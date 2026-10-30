/* 告警中心：告警列表与处理、统计、规则管理 */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.alerts = {
    name: 'page-alerts',
    title: '告警中心',
    setup() {
      const store = CT.store;
      const tab = ref('list');
      const stats = ref(null);
      const list = ref({ items: [], total: 0 });
      const rules = ref([]);
      const f = reactive({ status: 'active', severity: '', rule_type: '', page: 1 });
      const action = reactive({ show: false, kind: 'ack', alert: null, note: '', busy: false });
      const ruleForm = reactive({ show: false, busy: false, data: null, paramsText: '' });

      const load = () => CT.load(async () => {
        const [s, l] = await Promise.all([
          CT.api.get('/alerts/stats' + CT.api.qs({ node_id: store.nodeId })),
          CT.api.get('/alerts' + CT.api.qs({ node_id: store.nodeId, status: f.status, severity: f.severity, rule_type: f.rule_type, page: f.page, page_size: 30 })),
        ]);
        stats.value = s; list.value = l;
        if (!store.nodeId || store.isGroup()) store.openAlerts = s.open + s.acknowledged;
      });
      const loadRules = () => CT.load(async () => { rules.value = (await CT.api.get('/alert-rules')).items; });
      onMounted(() => { load(); loadRules(); });
      watch(() => store.nodeId, () => { f.page = 1; load(); });
      watch(() => [f.status, f.severity, f.rule_type], () => { f.page = 1; load(); });
      watch(() => f.page, load);

      const dailyOpt = computed(() => stats.value ? CT.charts.stackedBar({ categories: stats.value.daily.map((d) => d.date.slice(5)), series: [{ name: '触发数', data: stats.value.daily.map((d) => d.count) }], unit: '条', digits: 0, extra: { legend: { show: false }, grid: { top: 12, bottom: 4, left: 4, right: 8, containLabel: true } } }) : null);

      const open = (kind, a) => { Object.assign(action, { show: true, kind, alert: a, note: '' }); };
      const doAction = () => CT.load(async () => {
        action.busy = true;
        try {
          await CT.api.post(`/alerts/${action.alert.id}/${action.kind}`, { note: action.note });
          CT.toast(action.kind === 'ack' ? '已确认告警' : '已关闭告警', 'ok');
          action.show = false;
          await load();
          store.openAlerts = Math.max(0, (stats.value.open || 0) + (stats.value.acknowledged || 0));
        } finally { action.busy = false; }
      });
      const evaluate = () => CT.load(async () => { const r = await CT.api.post('/alerts/evaluate'); CT.toast(`已评估 ${r.rules} 条规则，新增 ${r.new_alerts} 条告警`, 'ok'); await load(); });

      const ruleTypes = computed(() => store.dict('rule_types'));
      const editRule = (r) => {
        const data = r ? JSON.parse(JSON.stringify(r)) : { name: '', rule_type: 'rate_threshold', severity: 'major', scope_type: 'all', scope_id: null, params: {}, enabled: true, notify_channels: ['platform'], description: '' };
        ruleForm.data = data; ruleForm.paramsText = JSON.stringify(data.params || {}, null, 2); ruleForm.show = true;
      };
      const saveRule = () => CT.load(async () => {
        let params;
        try { params = JSON.parse(ruleForm.paramsText || '{}'); } catch (e) { CT.toast('参数需为合法 JSON', 'err'); return; }
        ruleForm.busy = true;
        try {
          const body = { name: ruleForm.data.name, rule_type: ruleForm.data.rule_type, severity: ruleForm.data.severity, scope_type: ruleForm.data.scope_type, scope_id: ruleForm.data.scope_id || null, params, enabled: ruleForm.data.enabled, notify_channels: ruleForm.data.notify_channels, description: ruleForm.data.description };
          if (ruleForm.data.id) await CT.api.put(`/alert-rules/${ruleForm.data.id}`, body); else await CT.api.post('/alert-rules', body);
          CT.toast('规则已保存', 'ok'); ruleForm.show = false; await loadRules();
        } finally { ruleForm.busy = false; }
      });
      const toggleRule = (r) => CT.load(async () => { await CT.api.post(`/alert-rules/${r.id}/toggle`); await loadRules(); });
      const delRule = async (r) => { if (!(await CT.confirm('删除规则', `确定删除「${r.name}」？相关历史告警将保留。`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/alert-rules/${r.id}`); CT.toast('已删除', 'ok'); await loadRules(); }); };
      const toggleChannel = (ch) => { const arr = ruleForm.data.notify_channels; const i = arr.indexOf(ch); i >= 0 ? arr.splice(i, 1) : arr.push(ch); };
      const paramHelp = computed(() => (ruleTypes.value[ruleForm.data && ruleForm.data.rule_type] || {}).params || {});
      return { store, tab, stats, list, f, dailyOpt, open, action, doAction, evaluate, rules, ruleTypes, ruleForm, editRule, saveRule, toggleRule, delRule, toggleChannel, paramHelp, CT };
    },
    template: `
    <div class="stack">
      <div class="tiles" v-if="stats">
        <ct-tile label="待处理" :value="String(stats.open)" :sub="'紧急 ' + stats.by_severity.critical + ' · 重要 ' + stats.by_severity.major"></ct-tile>
        <ct-tile label="已确认处理中" :value="String(stats.acknowledged)"></ct-tile>
        <ct-tile label="近 24 小时触发" :value="String(stats.triggered_24h)" :sub="'关闭 ' + stats.resolved_24h + ' 条'"></ct-tile>
        <ct-tile label="平均处理时长" :value="stats.mttr_min !== null ? CT.fmt.num(stats.mttr_min, 0) : '—'" unit="分钟" sub="MTTR（已关闭告警）"></ct-tile>
        <div class="tile" style="grid-column: span 2; min-width:0"><div class="label">近 14 天触发趋势</div><ct-chart :option="dailyOpt" height="56px"></ct-chart></div>
      </div>
      <div class="card">
        <div class="tabs"><button :class="{active: tab==='list'}" @click="tab='list'">告警列表</button><button :class="{active: tab==='rules'}" @click="tab='rules'">告警规则 ({{ rules.length }})</button></div>
        <template v-if="tab === 'list'">
          <div class="card-b"><div class="toolbar">
            <ct-seg v-model="f.status" :options="[{value:'active',label:'未关闭'},{value:'open',label:'待处理'},{value:'acknowledged',label:'已确认'},{value:'resolved',label:'已关闭'},{value:'',label:'全部'}]"></ct-seg>
            <select class="select" v-model="f.severity"><option value="">全部级别</option><option v-for="(l,k) in CT.labels.severity" :key="k" :value="k">{{ l }}</option></select>
            <select class="select" v-model="f.rule_type"><option value="">全部类型</option><option v-for="(l,k) in CT.labels.ruleType" :key="k" :value="k">{{ l }}</option></select>
            <span class="spacer"></span>
            <button class="btn" @click="evaluate" v-if="store.can('operator')">立即评估规则</button>
          </div></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>级别</th><th>告警</th><th>对象</th><th>厂区</th><th class="num">当前值 / 阈值</th><th>触发时间</th><th>状态</th><th>处理</th></tr></thead>
            <tbody>
              <tr v-if="!list.items.length"><td colspan="8" class="empty">没有符合条件的告警</td></tr>
              <tr v-for="a in list.items" :key="a.id" class="sev-stripe" :class="a.severity">
                <td><ct-tag dict="severity" :value="a.severity"></ct-tag></td>
                <td><div><strong>{{ a.title }}</strong></div><div class="sub">{{ a.message }}</div></td>
                <td class="nowrap">{{ a.target_name }}<div class="sub">{{ CT.label('ruleType', a.rule_type) }}</div></td>
                <td class="muted">{{ a.site_name }}</td>
                <td class="num nowrap">{{ a.value !== null ? CT.fmt.num(a.value, 3) : '—' }}<span class="muted"> / {{ a.threshold !== null ? CT.fmt.num(a.threshold, 2) : '—' }}</span></td>
                <td class="nowrap num">{{ CT.fmt.dt(a.triggered_at) }}<div class="sub" v-if="a.resolved_at">关闭 {{ CT.fmt.dt(a.resolved_at) }} · {{ a.resolved_by }}</div><div class="sub" v-else-if="a.acknowledged_at">确认 {{ a.acknowledged_by }}</div></td>
                <td><ct-tag dict="alertStatus" :value="a.status"></ct-tag></td>
                <td class="nowrap"><template v-if="store.can('operator')"><button v-if="a.status==='open'" class="btn btn-sm" @click="open('ack', a)">确认</button> <button v-if="a.status!=='resolved'" class="btn btn-sm btn-primary" @click="open('resolve', a)">关闭</button></template><span v-else class="muted small">{{ a.resolution_note || '—' }}</span></td>
              </tr>
            </tbody></table></div>
            <ct-pager :page="f.page" :total="list.total" :page-size="30" @change="p => f.page = p"></ct-pager>
          </div>
        </template>
        <template v-else>
          <div class="card-b"><div class="toolbar"><span class="muted small">规则由后台引擎每 30 秒评估一次；同一对象的同类告警在未关闭前不会重复产生，条件恢复后自动关闭。</span><span class="spacer"></span><button class="btn btn-primary" v-if="store.can('operator')" @click="editRule(null)">新增规则</button></div></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>启用</th><th>规则</th><th>类型</th><th>级别</th><th>作用范围</th><th>参数</th><th>通知</th><th class="num">当前告警</th><th></th></tr></thead>
            <tbody><tr v-for="r in rules" :key="r.id">
              <td><ct-switch :model-value="r.enabled" @update:model-value="toggleRule(r)"></ct-switch></td>
              <td><strong>{{ r.name }}</strong><div class="sub">{{ r.description }}</div></td>
              <td>{{ r.rule_type_label }}</td><td><ct-tag dict="severity" :value="r.severity"></ct-tag></td>
              <td>{{ r.scope_type === 'all' ? '全部' : r.scope_type + ' #' + r.scope_id }}</td>
              <td class="mono small">{{ JSON.stringify(r.params) }}</td>
              <td class="small">{{ (r.notify_channels || []).join(' / ') }}</td>
              <td class="num">{{ r.active_alerts }}</td>
              <td class="nowrap"><button class="btn btn-sm" @click="editRule(r)">编辑</button> <button class="btn btn-sm btn-ghost" style="color:var(--critical)" @click="delRule(r)" v-if="store.can()">删除</button></td>
            </tr></tbody></table></div></div>
        </template>
      </div>

      <ct-modal :show="action.show" :title="action.kind === 'ack' ? '确认告警' : '关闭告警'" :busy="action.busy" :ok-text="action.kind === 'ack' ? '确认接手' : '关闭告警'" @close="action.show=false" @ok="doAction">
        <div v-if="action.alert" class="stack">
          <div class="notice"><strong>{{ action.alert.title }}</strong><div class="small">{{ action.alert.message }}</div></div>
          <div class="field"><label>处理说明</label><textarea class="input" v-model="action.note" placeholder="现场检查情况、采取的措施…"></textarea></div>
        </div>
      </ct-modal>

      <ct-modal :show="ruleForm.show" :title="ruleForm.data && ruleForm.data.id ? '编辑规则' : '新增规则'" :busy="ruleForm.busy" @close="ruleForm.show=false" @ok="saveRule" lg>
        <div v-if="ruleForm.data" class="form">
          <div class="field"><label>规则名称</label><input class="input" v-model="ruleForm.data.name"></div>
          <div class="field"><label>类型</label><select class="select" v-model="ruleForm.data.rule_type"><option v-for="(t,k) in ruleTypes" :key="k" :value="k">{{ t.label }}</option></select></div>
          <div class="field"><label>级别</label><select class="select" v-model="ruleForm.data.severity"><option v-for="(l,k) in CT.labels.severity" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field"><label>作用范围</label><div class="flex"><select class="select" v-model="ruleForm.data.scope_type"><option value="all">全部</option><option value="site">指定厂区</option><option value="source">指定排放源</option><option value="device">指定设备</option></select><input class="input" v-if="ruleForm.data.scope_type !== 'all'" v-model.number="ruleForm.data.scope_id" placeholder="对象 ID" style="width:110px"></div></div>
          <div class="field full"><label>参数（JSON）</label><textarea class="input mono" v-model="ruleForm.paramsText" rows="4"></textarea><div class="hint" v-for="(h,k) in paramHelp" :key="k"><code>{{ k }}</code>：{{ h }}</div></div>
          <div class="field"><label>通知渠道</label><div class="flex wrap"><label v-for="ch in ['platform','email','sms','webhook']" :key="ch" class="checkbox"><input type="checkbox" :checked="ruleForm.data.notify_channels.includes(ch)" @change="toggleChannel(ch)"> {{ ch }}</label></div></div>
          <div class="field"><label>启用</label><ct-switch v-model="ruleForm.data.enabled"></ct-switch></div>
          <div class="field full"><label>说明</label><input class="input" v-model="ruleForm.data.description"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
