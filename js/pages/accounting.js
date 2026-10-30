/* 碳核算：序列、分项、核算记录、重算、手工台账 */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.accounting = {
    name: 'page-accounting',
    title: '碳核算',
    setup() {
      const store = CT.store;
      const tab = ref('overview');
      const range = ref('30d');
      const gran = ref('day');
      const by = ref('source');
      const series = ref({ items: [], totals: {} });
      const breakdown = ref([]);
      const records = ref({ items: [], total: 0, page: 1 });
      const entries = ref([]);
      const recalc = reactive({ show: false, busy: false, start: CT.isoDaysAgo(2).slice(0, 10), end: CT.nowIso().slice(0, 10) });
      const entryForm = reactive({ show: false, busy: false, data: null });
      const sources = ref([]);

      const rangeParams = () => {
        if (range.value === 'ytd') return { from: CT.year() + '-01-01T00:00:00+08:00' };
        if (range.value === 'year') return { from: CT.year() + '-01-01T00:00:00+08:00' };
        return { days: parseInt(range.value) };
      };
      const load = () => CT.load(async () => {
        const base = Object.assign({ node_id: store.nodeId }, rangeParams());
        const [s, b] = await Promise.all([
          CT.api.get('/emissions/series' + CT.api.qs(Object.assign({ granularity: gran.value }, base))),
          CT.api.get('/emissions/breakdown' + CT.api.qs(Object.assign({ by: by.value }, base))),
        ]);
        series.value = s; breakdown.value = b.items;
      });
      const loadRecords = (page = 1) => CT.load(async () => { records.value = await CT.api.get('/emissions/records' + CT.api.qs(Object.assign({ node_id: store.nodeId, page, page_size: 30 }, rangeParams()))); });
      const loadEntries = () => CT.load(async () => { entries.value = (await CT.api.get('/activity-entries')).items; sources.value = (await CT.api.get('/sources')).items; });
      onMounted(() => { load(); loadRecords(); loadEntries(); });
      watch(() => store.nodeId, () => { load(); loadRecords(); });
      watch([range, gran], () => { if (range.value === 'ytd' || range.value === '90d') gran.value = gran.value === 'hour' ? 'day' : gran.value; load(); loadRecords(); });
      watch(by, load);

      const t = computed(() => series.value.totals || {});
      const seriesOpt = computed(() => CT.charts.stackedBar({ categories: series.value.items.map((x) => CT.fmt.period(x.period)), series: [{ name: '范围一', data: series.value.items.map((x) => +x.scope1.toFixed(2)) }, { name: '范围二', data: series.value.items.map((x) => +x.scope2.toFixed(2)) }] }));
      const bdOpt = computed(() => CT.charts.hbar({ items: breakdown.value.map((x) => ({ label: x.label, value: x.co2e_t })), max: 12 }));

      const doRecalc = () => CT.load(async () => {
        recalc.busy = true;
        try { const r = await CT.api.post('/emissions/recalculate', { start: recalc.start + 'T00:00:00+08:00', end: recalc.end + 'T23:59:59+08:00' }); CT.toast(`已重算 ${r.sources} 个排放源，更新 ${r.records} 条记录`, 'ok'); recalc.show = false; await load(); await loadRecords(); }
        finally { recalc.busy = false; }
      });
      const manualSources = computed(() => sources.value.filter((s) => !s.devices || !s.devices.length));
      const newEntry = () => {
        const mk = CT.monthKey();
        const s = manualSources.value[0] || sources.value[0];
        entryForm.data = { source_id: s ? s.id : null, activity_type: s ? s.activity_type : '', period_start: mk + '-01', period_end: '', value: null, unit: s ? ((store.dict('activity_types')[s.activity_type] || {}).unit || '') : '', evidence: '', note: '' };
        entryForm.show = true;
      };
      watch(() => entryForm.data && entryForm.data.source_id, (id) => { const s = sources.value.find((x) => x.id === id); if (s && entryForm.data) { entryForm.data.activity_type = s.activity_type; entryForm.data.unit = (store.dict('activity_types')[s.activity_type] || {}).unit || ''; } });
      const saveEntry = () => CT.load(async () => {
        entryForm.busy = true;
        try {
          const d = entryForm.data;
          const start = d.period_start + 'T00:00:00+08:00';
          let end = d.period_end;
          if (!end) { const [y, m] = d.period_start.split('-').map(Number); end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`; }
          await CT.api.post('/activity-entries', { source_id: d.source_id, activity_type: d.activity_type, period_start: start, period_end: end + 'T00:00:00+08:00', value: d.value, unit: d.unit, evidence: d.evidence, note: d.note });
          CT.toast('台账已录入（草稿），确认后参与核算', 'ok'); entryForm.show = false; await loadEntries();
        } finally { entryForm.busy = false; }
      });
      const confirmEntry = (e) => CT.load(async () => { const r = await CT.api.post(`/activity-entries/${e.id}/confirm`); CT.toast(`已确认，核算 ${CT.fmt.num(r.co2e_t, 2)} tCO₂e`, 'ok'); await loadEntries(); await load(); });
      const delEntry = async (e) => { if (!(await CT.confirm('删除台账', '同时删除由该台账生成的核算记录，确定？', { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/activity-entries/${e.id}`); await loadEntries(); await load(); }); };
      return { store, tab, range, gran, by, series, t, seriesOpt, breakdown, bdOpt, records, loadRecords, recalc, doRecalc, entries, entryForm, newEntry, saveEntry, confirmEntry, delEntry, sources, manualSources, CT };
    },
    template: `
    <div class="stack">
      <div class="card"><div class="card-b"><div class="toolbar">
        <ct-seg v-model="range" :options="[{value:'7d',label:'7 天'},{value:'30d',label:'30 天'},{value:'90d',label:'90 天'},{value:'ytd',label:'本年'}]"></ct-seg>
        <ct-seg v-model="gran" :options="[{value:'hour',label:'小时'},{value:'day',label:'日'},{value:'month',label:'月'}]"></ct-seg>
        <span class="small muted">范围：{{ store.nodeName() }}</span>
        <span class="spacer"></span>
        <button class="btn" v-if="store.can('operator','auditor')" @click="recalc.show=true">重算核算结果</button>
      </div></div></div>
      <div class="tiles">
        <ct-tile label="合计排放" :value="t.total" unit="tCO₂e" :digits="0"></ct-tile>
        <ct-tile label="范围一 · 直接排放" :value="t.scope1" unit="tCO₂e" :digits="0" :sub="'占比 ' + CT.fmt.pct(t.total ? t.scope1 / t.total : 0)"></ct-tile>
        <ct-tile label="范围二 · 外购电力/热力" :value="t.scope2" unit="tCO₂e" :digits="0" :sub="'占比 ' + CT.fmt.pct(t.total ? t.scope2 / t.total : 0)"></ct-tile>
        <ct-tile label="实测法（CEMS）占比" :value="CT.fmt.pct(t.measurement_share || 0)" :sub="'核算法 ' + CT.fmt.num((t.by_method||{}).factor||0,0) + ' · 手工台账 ' + CT.fmt.num((t.by_method||{}).manual||0,0) + ' t'"></ct-tile>
      </div>
      <div class="card">
        <div class="tabs"><button :class="{active: tab==='overview'}" @click="tab='overview'">核算结果</button><button :class="{active: tab==='records'}" @click="tab='records'">核算记录明细</button><button :class="{active: tab==='entries'}" @click="tab='entries'">手工台账 ({{ entries.filter(e => e.status==='draft').length }} 待确认)</button></div>
        <template v-if="tab==='overview'">
          <div class="card-b"><ct-chart :option="seriesOpt" height="280px"></ct-chart></div>
          <div class="card-h"><h3>分项</h3><div class="tools"><ct-seg v-model="by" :options="[{value:'source',label:'排放源'},{value:'activity_type',label:'活动类型'},{value:'source_type',label:'源类型'},{value:'method',label:'核算方法'},{value:'site',label:'厂区'},{value:'gas',label:'气体'}]"></ct-seg></div></div>
          <div class="grid" style="padding:14px 16px">
            <div class="col-6 keep"><ct-chart :option="bdOpt" :height="(Math.max(4, Math.min(12, breakdown.length)) * 28 + 20) + 'px'"></ct-chart></div>
            <div class="col-6 keep"><div class="table-wrap"><table class="tbl"><thead><tr><th>分项</th><th class="num">排放量 tCO₂e</th><th class="num">占比</th></tr></thead>
              <tbody><tr v-for="b in breakdown" :key="b.key"><td>{{ b.label }}<span v-if="by==='source'" class="sub"> {{ CT.label('scope', b.scope) }}</span></td><td class="num">{{ CT.fmt.num(b.co2e_t, 1) }}</td><td class="num">{{ CT.fmt.pct(b.share) }}</td></tr></tbody></table></div></div>
          </div>
        </template>
        <template v-else-if="tab==='records'">
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>期间（本地）</th><th>排放源</th><th>范围 / 气体</th><th>方法</th><th class="num">活动量</th><th class="num">因子</th><th class="num">排放 tCO₂e</th><th class="num">覆盖率</th><th>质量</th></tr></thead>
            <tbody>
              <tr v-if="!records.items.length"><td colspan="9" class="empty">暂无记录</td></tr>
              <tr v-for="r in records.items" :key="r.id">
                <td class="num nowrap">{{ r.period_local }} <span class="sub">{{ r.granularity === 'month' ? '月' : '时' }}</span></td>
                <td>{{ r.source_name }}</td><td class="small">{{ CT.label('scope', r.scope) }} · {{ r.gas }}</td><td class="small">{{ CT.label('method', r.method) }}</td>
                <td class="num">{{ r.activity_value !== null ? CT.fmt.num(r.activity_value, 2) + ' ' + (r.activity_unit || '') : '—' }}</td>
                <td class="num small">{{ r.factor_value !== null ? r.factor_value : '—' }}</td>
                <td class="num"><strong>{{ CT.fmt.num(r.co2e_t, 3) }}</strong></td>
                <td class="num">{{ CT.fmt.pct(r.coverage, 0) }}</td><td><ct-tag :text="CT.label('quality', r.data_quality)"></ct-tag></td>
              </tr>
            </tbody></table></div>
            <ct-pager :page="records.page" :total="records.total" :page-size="30" @change="loadRecords"></ct-pager></div>
        </template>
        <template v-else>
          <div class="card-b"><div class="toolbar"><span class="small muted">适用于无法在线计量的排放源：发票/台账/充注记录等。录入后由核查或运行人员确认，确认后按月生成核算记录。</span><span class="spacer"></span><button class="btn btn-primary" v-if="store.can('operator','auditor')" @click="newEntry">录入台账</button></div></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>排放源</th><th>活动类型</th><th>期间</th><th class="num">活动量</th><th>凭证</th><th>录入人</th><th>状态</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!entries.length"><td colspan="8" class="empty">暂无台账</td></tr>
              <tr v-for="e in entries" :key="e.id">
                <td>{{ e.source_name }}</td><td class="small">{{ e.activity_label }}</td><td class="small num">{{ CT.fmt.date(e.period_start) }} ~ {{ CT.fmt.date(e.period_end) }}</td>
                <td class="num">{{ CT.fmt.num(e.value, 2) }} {{ e.unit }}</td><td class="small muted">{{ e.evidence }}</td><td class="small">{{ e.entered_by }}</td>
                <td><ct-tag dict="entryStatus" :value="e.status"></ct-tag></td>
                <td class="nowrap"><button v-if="e.status==='draft' && store.can('operator','auditor')" class="btn btn-sm btn-primary" @click="confirmEntry(e)">确认</button> <button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can('operator')" @click="delEntry(e)">删除</button></td>
              </tr>
            </tbody></table></div></div>
        </template>
      </div>

      <ct-modal :show="recalc.show" title="重算核算结果" :busy="recalc.busy" ok-text="开始重算" @close="recalc.show=false" @ok="doRecalc">
        <div class="stack"><div class="notice">按当前因子库与 GWP 设置，对所选时间范围内的全部排放源重新计算小时级记录（通常用于因子更新或补采数据后）。</div>
          <div class="form"><div class="field"><label>开始日期</label><input class="input" type="date" v-model="recalc.start"></div><div class="field"><label>结束日期</label><input class="input" type="date" v-model="recalc.end"></div></div></div>
      </ct-modal>
      <ct-modal :show="entryForm.show" title="录入活动数据台账" :busy="entryForm.busy" @close="entryForm.show=false" @ok="saveEntry">
        <div v-if="entryForm.data" class="form">
          <div class="field full"><label>排放源</label><select class="select" v-model="entryForm.data.source_id"><optgroup label="无计量设备（手工）"><option v-for="s in manualSources" :key="s.id" :value="s.id">{{ s.site_name }} / {{ s.name }}</option></optgroup><optgroup label="其他"><option v-for="s in sources.filter(s => s.devices && s.devices.length)" :key="s.id" :value="s.id">{{ s.site_name }} / {{ s.name }}</option></optgroup></select></div>
          <div class="field"><label>期间开始</label><input class="input" type="date" v-model="entryForm.data.period_start"></div>
          <div class="field"><label>期间结束（留空为自然月）</label><input class="input" type="date" v-model="entryForm.data.period_end"></div>
          <div class="field"><label>活动量</label><input class="input" type="number" step="0.01" v-model.number="entryForm.data.value"></div>
          <div class="field"><label>单位</label><input class="input" v-model="entryForm.data.unit"></div>
          <div class="field full"><label>凭证编号 / 附件</label><input class="input" v-model="entryForm.data.evidence" placeholder="发票号、领用单号…"></div>
          <div class="field full"><label>备注</label><input class="input" v-model="entryForm.data.note"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
