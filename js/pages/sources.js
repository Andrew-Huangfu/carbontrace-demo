/* 排放源与组织架构 */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.sources = {
    name: 'page-sources',
    title: '排放源与组织',
    setup() {
      const store = CT.store;
      const sources = ref([]);
      const form = reactive({ show: false, busy: false, data: null });
      const nodeForm = reactive({ show: false, busy: false, data: null });
      const detail = ref(null);
      const series = ref([]);

      const load = () => CT.load(async () => { sources.value = (await CT.api.get('/sources' + CT.api.qs({ node_id: store.nodeId }))).items; });
      onMounted(load);
      watch(() => store.nodeId, load);

      const flat = computed(() => { const out = []; const walk = (ns, d) => ns.forEach((n) => { out.push({ n, depth: d }); walk(n.children || [], d + 1); }); walk(store.tree, 0); return out; });
      const sourceTypes = computed(() => store.dict('source_types'));
      const activityTypes = computed(() => store.dict('activity_types'));
      const edit = (s) => {
        form.data = s ? { id: s.id, name: s.name, code: s.code, org_node_id: s.org_node_id, scope: s.scope, source_type: s.source_type, activity_type: s.activity_type, method: s.method, capacity: s.capacity, capacity_unit: s.capacity_unit, status: s.status, rate_threshold_t_h: s.rate_threshold_t_h, description: s.description }
          : { name: '', code: '', org_node_id: (store.units()[0] || {}).id, scope: 1, source_type: 'gas_boiler', activity_type: 'natural_gas', method: 'factor', capacity: null, capacity_unit: '', status: 'active', rate_threshold_t_h: null, description: '' };
        form.show = true;
      };
      watch(() => form.data && form.data.source_type, (t) => { if (form.data && t && sourceTypes.value[t]) { form.data.scope = sourceTypes.value[t].scope; } });
      const save = () => CT.load(async () => {
        form.busy = true;
        try {
          const b = Object.assign({}, form.data); delete b.id;
          if (form.data.id) await CT.api.put(`/sources/${form.data.id}`, b); else await CT.api.post('/sources', b);
          CT.toast('已保存', 'ok'); form.show = false; await load(); await store.loadTree();
        } finally { form.busy = false; }
      });
      const remove = async (s) => { if (!(await CT.confirm('删除排放源', `确定删除「${s.name}」？需先解绑设备。`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/sources/${s.id}`); CT.toast('已删除', 'ok'); await load(); await store.loadTree(); }); };
      const openDetail = (s) => CT.load(async () => { detail.value = s; series.value = (await CT.api.get(`/sources/${s.id}/series` + CT.api.qs({ granularity: 'day', days: 30 }))).items; });
      const detailOpt = computed(() => CT.charts.stackedBar({ categories: series.value.map((x) => CT.fmt.period(x.period)), series: [{ name: '排放量', data: series.value.map((x) => x.co2e_t) }], extra: { legend: { show: false }, grid: { top: 24, bottom: 4, left: 4, right: 8, containLabel: true } } }));

      const editNode = (n, parent) => {
        nodeForm.data = n ? { id: n.id, name: n.name, code: n.code, level: n.level, parent_id: n.parent_id, region: n.region, address: n.address, industry: n.industry, sort_order: n.sort_order || 0 }
          : { name: '', code: '', level: parent ? (parent.level === 'group' ? 'site' : 'unit') : 'site', parent_id: parent ? parent.id : null, region: '', address: '', industry: '', sort_order: 0 };
        nodeForm.show = true;
      };
      const saveNode = () => CT.load(async () => {
        nodeForm.busy = true;
        try { const b = Object.assign({}, nodeForm.data); delete b.id; if (nodeForm.data.id) await CT.api.put(`/org/nodes/${nodeForm.data.id}`, b); else await CT.api.post('/org/nodes', b); CT.toast('已保存', 'ok'); nodeForm.show = false; await store.loadTree(); }
        finally { nodeForm.busy = false; }
      });
      const removeNode = async (n) => { if (!(await CT.confirm('删除组织节点', `确定删除「${n.name}」？节点下不能有子节点、排放源或设备。`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/org/nodes/${n.id}`); CT.toast('已删除', 'ok'); if (store.nodeId === n.id) store.nodeId = store.tree[0].id; await store.loadTree(); }); };
      const totals = computed(() => ({ s1: sources.value.filter((s) => s.scope === 1).length, s2: sources.value.filter((s) => s.scope === 2).length, meas: sources.value.filter((s) => s.method === 'measurement').length, e24: CT.sum(sources.value, (s) => s.emission_24h_t) }));
      return { store, sources, flat, form, edit, save, remove, sourceTypes, activityTypes, detail, series, detailOpt, openDetail, nodeForm, editNode, saveNode, removeNode, totals, CT };
    },
    template: `
    <div class="grid">
      <div class="card col-3">
        <div class="card-h"><h3>组织架构</h3><span class="sub">集团 → 厂区 → 车间/装置</span><div class="tools"><button class="btn btn-sm" v-if="store.can()" @click="editNode(null, store.node() || store.tree[0])">新增子节点</button></div></div>
        <div class="card-b" style="padding:8px">
          <div v-for="x in flat" :key="x.n.id" class="tree-node" :class="['tree-indent-' + Math.min(x.depth,2), {active: x.n.id === store.nodeId}]" @click="store.nodeId = x.n.id">
            <span>{{ x.n.name }}</span>
            <span class="cnt">{{ x.n.source_count }} 源 · {{ CT.fmt.num(x.n.emission_24h_t,0) }} t/24h</span>
          </div>
        </div>
        <div class="card-f" v-if="store.node()">
          <div class="flex between"><span>{{ store.node().name }} · {{ CT.label('level', store.node().level) }} · {{ store.node().region || '' }}</span>
            <span v-if="store.can()"><button class="btn btn-sm btn-ghost" @click="editNode(store.node())">编辑</button><button class="btn btn-sm btn-ghost" style="color:var(--critical)" @click="removeNode(store.node())" v-if="store.node().level !== 'group'">删除</button></span></div>
        </div>
      </div>
      <div class="card col-9">
        <div class="card-h"><h3>排放源</h3><span class="sub">{{ store.nodeName() }} · {{ sources.length }} 个（范围一 {{ totals.s1 }} · 范围二 {{ totals.s2 }} · 实测法 {{ totals.meas }}）</span>
          <div class="tools"><button class="btn btn-primary btn-sm" v-if="store.can('operator')" @click="edit(null)">新增排放源</button></div></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>排放源</th><th>类型 / 活动</th><th>方法</th><th>采集设备</th><th class="num">速率 t/h</th><th class="num">近 24h t</th><th class="num">本月 t</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!sources.length"><td colspan="8" class="empty">该范围下没有排放源</td></tr>
            <tr v-for="s in sources" :key="s.id" class="clickable" :class="{selected: detail && detail.id === s.id}" @click="openDetail(s)">
              <td class="nowrap"><strong>{{ s.name }}</strong> <ct-tag :text="CT.label('scope', s.scope)"></ct-tag><div class="sub">{{ s.code }} · {{ s.site_name }} / {{ s.unit_name }}</div></td>
              <td class="small nowrap">{{ (sourceTypes[s.source_type] || {}).label || s.source_type }}<div class="sub">{{ (activityTypes[s.activity_type] || {}).label || s.activity_type }}{{ s.capacity ? ' · ' + s.capacity + ' ' + (s.capacity_unit || '') : '' }}</div></td>
              <td><ct-tag :text="CT.label('method', s.method)"></ct-tag></td>
              <td><span v-for="d in s.devices" :key="d.id" class="tag" :class="CT.tag('deviceStatus', d.status)" style="margin:1px" :title="d.name">{{ d.device_key }}</span><span v-if="!s.devices.length" class="muted small">手工台账</span></td>
              <td class="num">{{ s.current_rate_t_h !== undefined ? CT.fmt.num(s.current_rate_t_h, 2) : '—' }}<div class="sub" v-if="s.rate_threshold_t_h">阈 {{ CT.fmt.num(s.rate_threshold_t_h,2) }}</div></td>
              <td class="num">{{ CT.fmt.num(s.emission_24h_t, 1) }}</td>
              <td class="num">{{ CT.fmt.num(s.emission_mtd_t, 0) }}</td>
              <td class="nowrap" @click.stop><button class="btn btn-sm btn-ghost" v-if="store.can('operator')" @click="edit(s)">编辑</button><button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can()" @click="remove(s)">删除</button></td>
            </tr>
          </tbody></table></div></div>
      </div>
      <div class="card col-12" v-if="detail">
        <div class="card-h"><h3>{{ detail.name }} · 近 30 天排放</h3><span class="sub">{{ detail.description }}</span><div class="tools"><button class="btn btn-sm btn-ghost" @click="detail=null">收起</button></div></div>
        <div class="card-b"><ct-chart :option="detailOpt" height="220px"></ct-chart></div>
      </div>

      <ct-modal :show="form.show" :title="form.data && form.data.id ? '编辑排放源' : '新增排放源'" :busy="form.busy" @close="form.show=false" @ok="save" lg>
        <div v-if="form.data" class="form">
          <div class="field"><label>名称</label><input class="input" v-model="form.data.name"></div>
          <div class="field"><label>编码</label><input class="input" v-model="form.data.code" placeholder="如 SZ-S5"></div>
          <div class="field"><label>所属车间/装置</label><select class="select" v-model="form.data.org_node_id"><option v-for="u in store.units()" :key="u.id" :value="u.id">{{ (store.siteOf(u.id)||{}).name }} / {{ u.name }}</option></select></div>
          <div class="field"><label>排放源类型</label><select class="select" v-model="form.data.source_type"><option v-for="(t,k) in sourceTypes" :key="k" :value="k">{{ t.label }}（范围{{ t.scope }}）</option></select></div>
          <div class="field"><label>活动类型 / 燃料</label><select class="select" v-model="form.data.activity_type"><option v-for="(t,k) in activityTypes" :key="k" :value="k">{{ t.label }}（{{ t.unit }}）</option></select></div>
          <div class="field"><label>核算方法</label><select class="select" v-model="form.data.method"><option value="factor">核算法（活动数据 × 因子）</option><option value="measurement">实测法（CEMS）</option></select></div>
          <div class="field"><label>装置容量</label><div class="flex"><input class="input" type="number" v-model.number="form.data.capacity" style="width:50%"><input class="input" v-model="form.data.capacity_unit" placeholder="单位 t/h、kW…"></div></div>
          <div class="field"><label>排放速率告警阈值 tCO₂e/h</label><input class="input" type="number" step="0.01" v-model.number="form.data.rate_threshold_t_h"><div class="hint">留空则不触发速率超限告警</div></div>
          <div class="field"><label>状态</label><select class="select" v-model="form.data.status"><option value="active">运行</option><option value="inactive">停用</option></select></div>
          <div class="field full"><label>说明</label><input class="input" v-model="form.data.description"></div>
        </div>
      </ct-modal>
      <ct-modal :show="nodeForm.show" :title="nodeForm.data && nodeForm.data.id ? '编辑组织节点' : '新增组织节点'" :busy="nodeForm.busy" @close="nodeForm.show=false" @ok="saveNode">
        <div v-if="nodeForm.data" class="form">
          <div class="field"><label>名称</label><input class="input" v-model="nodeForm.data.name"></div>
          <div class="field"><label>编码</label><input class="input" v-model="nodeForm.data.code"></div>
          <div class="field"><label>层级</label><select class="select" v-model="nodeForm.data.level"><option value="site">厂区</option><option value="unit">车间/装置</option></select></div>
          <div class="field"><label>上级节点</label><select class="select" v-model="nodeForm.data.parent_id"><option v-for="n in store.nodes.filter(n => n.level !== 'unit')" :key="n.id" :value="n.id">{{ n.name }}</option></select></div>
          <div class="field"><label>地区</label><input class="input" v-model="nodeForm.data.region"></div>
          <div class="field"><label>行业</label><input class="input" v-model="nodeForm.data.industry"></div>
          <div class="field full"><label>地址</label><input class="input" v-model="nodeForm.data.address"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
