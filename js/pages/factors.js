/* 排放因子库 */
(function (CT) {
  const { ref, reactive, computed, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.factors = {
    name: 'page-factors',
    title: '排放因子库',
    setup() {
      const store = CT.store;
      const data = ref({ items: [], gwp: {} });
      const form = reactive({ show: false, busy: false, data: null, paramsText: '' });
      const q = ref('');
      const load = () => CT.load(async () => { data.value = await CT.api.get('/factors'); });
      onMounted(load);
      const activityTypes = computed(() => store.dict('activity_types'));
      const items = computed(() => data.value.items.filter((f) => !q.value || (f.name + f.code + f.activity_label + (f.source || '')).includes(q.value)));
      const grouped = computed(() => { const g = {}; items.value.forEach((f) => (g[f.activity_type] = g[f.activity_type] || []).push(f)); return g; });
      const isActive = (f) => { const now = Date.now(); return (!f.valid_from || new Date(f.valid_from) <= now) && (!f.valid_to || new Date(f.valid_to) > now) && f.is_default; };
      const edit = (f) => {
        form.data = f ? { id: f.id, code: f.code, name: f.name, activity_type: f.activity_type, gas: f.gas, value: f.value, activity_unit: f.activity_unit, display_unit: f.display_unit, scope: f.scope, region: f.region, source: f.source, version: f.version, valid_from: f.valid_from ? f.valid_from.slice(0, 10) : '', valid_to: f.valid_to ? f.valid_to.slice(0, 10) : '', is_default: f.is_default, notes: f.notes, params: f.params || {} }
          : { code: '', name: '', activity_type: 'natural_gas', gas: 'CO2', value: null, activity_unit: 'Nm³', display_unit: '', scope: 1, region: '全国', source: '', version: String(CT.year()), valid_from: CT.year() + '-01-01', valid_to: '', is_default: true, notes: '', params: {} };
        form.paramsText = JSON.stringify(form.data.params, null, 2); form.show = true;
      };
      const save = () => CT.load(async () => {
        let params; try { params = JSON.parse(form.paramsText || '{}'); } catch (e) { CT.toast('计算参数需为合法 JSON', 'err'); return; }
        form.busy = true;
        try {
          const b = Object.assign({}, form.data, { params }); delete b.id;
          b.valid_from = b.valid_from ? b.valid_from + 'T00:00:00+08:00' : null; b.valid_to = b.valid_to ? b.valid_to + 'T00:00:00+08:00' : null;
          if (form.data.id) await CT.api.put(`/factors/${form.data.id}`, b); else await CT.api.post('/factors', b);
          CT.toast('因子已保存；如需影响历史结果请执行重算', 'ok'); form.show = false; await load();
        } finally { form.busy = false; }
      });
      const remove = async (f) => { if (!(await CT.confirm('删除因子', `确定删除「${f.name}」？被核算记录引用的因子无法删除，请改设失效日期。`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/factors/${f.id}`); CT.toast('已删除', 'ok'); await load(); }); };
      return { store, data, items, grouped, q, isActive, form, edit, save, remove, activityTypes, CT };
    },
    template: `
    <div class="stack">
      <div class="card"><div class="card-b"><div class="toolbar">
        <input class="input" v-model="q" placeholder="搜索因子 / 出处" style="width:240px">
        <span class="small muted">当前 GWP：<span v-for="(v,g) in data.gwp" :key="g" class="tag tag-neutral" style="margin-right:4px">{{ g }} = {{ v }}</span></span>
        <span class="spacer"></span>
        <button class="btn btn-primary" v-if="store.can('auditor')" @click="edit(null)">新增因子</button>
      </div></div>
      <div class="card-b" style="padding-top:0"><div class="notice">因子为示例默认值，正式使用前请按生态环境部最新发布的核算指南与年度电网因子核对；修改因子后对历史期间执行「碳核算 → 重算」。</div></div></div>
      <div v-for="(list, at) in grouped" :key="at" class="card">
        <div class="card-h"><h3>{{ (activityTypes[at] || {}).label || at }}</h3><span class="sub">{{ list.length }} 条 · 范围{{ list[0].scope }}</span></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>状态</th><th>编码 / 名称</th><th>气体</th><th class="num">因子值</th><th>展示单位</th><th>版本 / 有效期</th><th>出处</th><th></th></tr></thead>
          <tbody><tr v-for="f in list" :key="f.id">
            <td><ct-tag :dict="isActive(f) ? 'deviceStatus' : null" :value="isActive(f) ? 'online' : ''" :text="isActive(f) ? '生效中' : (f.valid_to && new Date(f.valid_to) <= Date.now() ? '已失效' : '未启用')"></ct-tag></td>
            <td><strong>{{ f.name }}</strong><div class="sub mono">{{ f.code }}</div></td>
            <td>{{ f.gas }}</td>
            <td class="num mono">{{ f.value }} <span class="sub">t/{{ f.activity_unit }}</span></td>
            <td class="small">{{ f.display_unit }}</td>
            <td class="small num">{{ f.version }}<div class="sub">{{ CT.fmt.date(f.valid_from) }} ~ {{ f.valid_to ? CT.fmt.date(f.valid_to) : '至今' }}</div></td>
            <td class="small muted" style="max-width:360px">{{ f.source }}</td>
            <td class="nowrap"><button class="btn btn-sm btn-ghost" v-if="store.can('auditor')" @click="edit(f)">编辑</button><button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can()" @click="remove(f)">删除</button></td>
          </tr></tbody></table></div></div>
      </div>
      <ct-modal :show="form.show" :title="form.data && form.data.id ? '编辑因子' : '新增因子'" :busy="form.busy" @close="form.show=false" @ok="save" lg>
        <div v-if="form.data" class="form">
          <div class="field"><label>编码</label><input class="input mono" v-model="form.data.code"></div>
          <div class="field"><label>名称</label><input class="input" v-model="form.data.name"></div>
          <div class="field"><label>活动类型</label><select class="select" v-model="form.data.activity_type"><option v-for="(t,k) in activityTypes" :key="k" :value="k">{{ t.label }}</option></select></div>
          <div class="field"><label>气体</label><select class="select" v-model="form.data.gas"><option v-for="g in ['CO2','CH4','N2O','HFC-134a','R410A','CO2e']" :key="g">{{ g }}</option></select></div>
          <div class="field"><label>因子值（t 气体 / 活动单位）</label><input class="input mono" type="number" step="any" v-model.number="form.data.value"></div>
          <div class="field"><label>活动单位</label><input class="input" v-model="form.data.activity_unit" placeholder="Nm³ / t / kWh / L / GJ / kg"></div>
          <div class="field"><label>展示单位</label><input class="input" v-model="form.data.display_unit" placeholder="如 2.165 kgCO2/Nm³"></div>
          <div class="field"><label>范围</label><select class="select" v-model.number="form.data.scope"><option :value="1">范围一</option><option :value="2">范围二</option><option :value="3">范围三</option></select></div>
          <div class="field"><label>版本</label><input class="input" v-model="form.data.version"></div>
          <div class="field"><label>地区</label><input class="input" v-model="form.data.region"></div>
          <div class="field"><label>生效日期</label><input class="input" type="date" v-model="form.data.valid_from"></div>
          <div class="field"><label>失效日期</label><input class="input" type="date" v-model="form.data.valid_to"></div>
          <div class="field full"><label>出处</label><input class="input" v-model="form.data.source"></div>
          <div class="field full"><label>计算参数（JSON，如低位发热量、含碳量、氧化率）</label><textarea class="input mono" v-model="form.paramsText" rows="3"></textarea></div>
          <div class="field"><label>默认因子</label><ct-switch v-model="form.data.is_default"></ct-switch></div>
          <div class="field"><label>备注</label><input class="input" v-model="form.data.notes"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
