/* 减排目标与减排项目 */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.targets = {
    name: 'page-targets',
    title: '减排目标与项目',
    setup() {
      const store = CT.store;
      const targets = ref([]);
      const projects = ref({ items: [], summary: {} });
      const intensity = ref({ items: [], previous: [] });
      const pForm = reactive({ show: false, busy: false, data: null });
      const tForm = reactive({ show: false, busy: false, data: null });
      const load = () => CT.load(async () => {
        const [t, p, i] = await Promise.all([CT.api.get('/targets'), CT.api.get('/projects'), CT.api.get('/emissions/intensity' + CT.api.qs({ node_id: store.nodeId }))]);
        targets.value = t.items; projects.value = p; intensity.value = i;
      });
      onMounted(load);
      watch(() => store.nodeId, load);
      const intOpt = computed(() => {
        const cur = intensity.value.items, prev = intensity.value.previous;
        const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
        const pick = (arr, m) => { const x = arr.find((r) => r.period.endsWith('-' + m)); return x && x.intensity_per_wan_yuan !== null ? x.intensity_per_wan_yuan : null; };
        return CT.charts.line({ categories: months.map((m) => m + '月'), series: [{ name: String(CT.year() - 1), data: months.map((m) => pick(prev, m)), dashed: true }, { name: String(CT.year()), data: months.map((m) => pick(cur, m)), area: true }], unit: 'tCO₂e/万元', digits: 3 });
      });
      const editP = (p) => { pForm.data = p ? { id: p.id, org_node_id: p.org_node_id, name: p.name, category: p.category, status: p.status, start_date: p.start_date ? p.start_date.slice(0, 10) : '', end_date: p.end_date ? p.end_date.slice(0, 10) : '', investment_wan_yuan: p.investment_wan_yuan, expected_reduction_t: p.expected_reduction_t, actual_reduction_t: p.actual_reduction_t, owner: p.owner, description: p.description } : { org_node_id: (store.sites()[0] || {}).id, name: '', category: 'energy_efficiency', status: 'planning', start_date: '', end_date: '', investment_wan_yuan: 0, expected_reduction_t: 0, actual_reduction_t: 0, owner: '', description: '' }; pForm.show = true; };
      const saveP = () => CT.load(async () => { pForm.busy = true; try { const b = Object.assign({}, pForm.data); delete b.id; b.start_date = b.start_date ? b.start_date + 'T00:00:00+08:00' : null; b.end_date = b.end_date ? b.end_date + 'T00:00:00+08:00' : null; if (pForm.data.id) await CT.api.put(`/projects/${pForm.data.id}`, b); else await CT.api.post('/projects', b); CT.toast('项目已保存', 'ok'); pForm.show = false; await load(); } finally { pForm.busy = false; } });
      const delP = async (p) => { if (!(await CT.confirm('删除项目', `确定删除「${p.name}」？`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/projects/${p.id}`); await load(); }); };
      const editT = (t) => { tForm.data = t ? { id: t.id, org_node_id: t.org_node_id, year: t.year, target_type: t.target_type, baseline_year: t.baseline_year, baseline_value: t.baseline_value, target_value: t.target_value, unit: t.unit, description: t.description } : { org_node_id: store.tree[0].id, year: CT.year(), target_type: 'absolute', baseline_year: CT.year() - 1, baseline_value: null, target_value: null, unit: 'tCO2e', description: '' }; tForm.show = true; };
      const saveT = () => CT.load(async () => { tForm.busy = true; try { const b = Object.assign({}, tForm.data); delete b.id; if (tForm.data.id) await CT.api.put(`/targets/${tForm.data.id}`, b); else await CT.api.post('/targets', b); CT.toast('目标已保存', 'ok'); tForm.show = false; await load(); } finally { tForm.busy = false; } });
      const delT = async (t) => { if (!(await CT.confirm('删除目标', '确定删除该目标？', { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/targets/${t.id}`); await load(); }); };
      const progressOf = (p) => (p.expected_reduction_t ? Math.min(1, p.actual_reduction_t / p.expected_reduction_t) : 0);
      return { store, targets, projects, intOpt, pForm, editP, saveP, delP, tForm, editT, saveT, delT, progressOf, CT };
    },
    template: `
    <div class="stack">
      <div class="card"><div class="card-h"><h3>{{ CT.year() }} 年减排目标</h3><span class="sub">总量目标按年初至今节奏外推；强度目标按年初至今累计强度</span><div class="tools"><button class="btn btn-sm btn-primary" v-if="store.can()" @click="editT(null)">新增目标</button></div></div>
        <div class="card-b"><div class="gauge-row">
          <div v-for="t in targets" :key="t.id" class="source-card" style="cursor:default">
            <div class="flex between"><strong>{{ t.org_name }}</strong><ct-tag :dict="t.on_track ? 'deviceStatus' : 'severity'" :value="t.on_track ? 'online' : 'major'" :text="t.on_track ? '可达成' : '有缺口'"></ct-tag></div>
            <div class="small muted">{{ t.description }}</div>
            <div class="rate">{{ t.target_type === 'absolute' ? CT.fmt.num(t.target_value,0) : CT.fmt.num(t.target_value,2) }}<span class="unit">{{ t.unit }}（目标）</span></div>
            <ct-bar :value="t.progress || 0" :warn="t.target_type === 'absolute' ? 2 : 1" :crit="t.target_type === 'absolute' ? 2 : 1" :marker="t.target_type === 'absolute' ? (t.projected / t.target_value) : undefined"></ct-bar>
            <div class="flex between small muted"><span>基准 {{ t.baseline_year }}：{{ CT.fmt.num(t.baseline_value, t.target_type === 'absolute' ? 0 : 2) }}</span><span class="num">{{ t.target_type === 'absolute' ? '预计 ' + CT.fmt.num(t.projected,0) : '当前 ' + CT.fmt.num(t.ytd, 3) }}</span></div>
            <div class="flex between small"><span :class="t.on_track ? '' : 'muted'">较基准 {{ t.reduction_vs_baseline !== null ? (t.reduction_vs_baseline >= 0 ? '−' : '+') + CT.fmt.pct(Math.abs(t.reduction_vs_baseline)) : '—' }}</span><span v-if="store.can()"><button class="btn btn-sm btn-ghost" @click="editT(t)">编辑</button><button class="btn btn-sm btn-ghost" style="color:var(--critical)" @click="delT(t)">删除</button></span></div>
          </div>
          <ct-empty v-if="!targets.length" text="尚未设置本年目标"></ct-empty>
        </div></div>
      </div>
      <div class="grid">
        <div class="card col-6 keep"><div class="card-h"><h3>碳强度趋势</h3><span class="sub">{{ store.nodeName() }} · tCO₂e / 万元产值</span></div><div class="card-b"><ct-chart :option="intOpt" height="240px"></ct-chart></div></div>
        <div class="card col-6 keep"><div class="card-h"><h3>减排项目汇总</h3></div><div class="card-b"><div class="tiles" style="grid-template-columns:repeat(2,1fr)">
          <ct-tile label="项目数" :value="String(projects.summary.count || 0)" :sub="'规划 ' + (projects.summary.by_status||{}).planning + ' · 实施 ' + (projects.summary.by_status||{}).in_progress + ' · 完成 ' + (projects.summary.by_status||{}).completed"></ct-tile>
          <ct-tile label="累计投资" :value="projects.summary.investment_wan_yuan" unit="万元" :digits="0"></ct-tile>
          <ct-tile label="预期年减排" :value="projects.summary.expected_reduction_t" unit="tCO₂e" :digits="0"></ct-tile>
          <ct-tile label="已实现减排" :value="projects.summary.actual_reduction_t" unit="tCO₂e" :digits="0" :sub="'完成度 ' + CT.fmt.pct(projects.summary.expected_reduction_t ? projects.summary.actual_reduction_t / projects.summary.expected_reduction_t : 0)"></ct-tile>
        </div></div></div>
      </div>
      <div class="card">
        <div class="card-h"><h3>减排项目</h3><div class="tools"><button class="btn btn-sm btn-primary" v-if="store.can('operator')" @click="editP(null)">新增项目</button></div></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>项目</th><th>单位</th><th>类别</th><th>状态</th><th>周期</th><th class="num">投资 万元</th><th class="num">预期减排 t</th><th class="num">已实现 t</th><th style="width:16%">进度</th><th>负责人</th><th></th></tr></thead>
          <tbody><tr v-for="p in projects.items" :key="p.id">
            <td><strong>{{ p.name }}</strong><div class="sub">{{ p.description }}</div></td><td class="small">{{ p.org_name }}</td><td class="small">{{ CT.label('projectCategory', p.category) }}</td><td><ct-tag dict="projectStatus" :value="p.status"></ct-tag></td>
            <td class="small num nowrap">{{ CT.fmt.date(p.start_date) }} ~ {{ CT.fmt.date(p.end_date) }}</td><td class="num">{{ CT.fmt.num(p.investment_wan_yuan,0) }}</td><td class="num">{{ CT.fmt.num(p.expected_reduction_t,0) }}</td><td class="num">{{ CT.fmt.num(p.actual_reduction_t,0) }}</td>
            <td><div class="ratebar"><ct-bar :value="progressOf(p)" :warn="2" :crit="2"></ct-bar><span class="small muted num">{{ CT.fmt.pct(progressOf(p),0) }}</span></div></td><td class="small">{{ p.owner }}</td>
            <td class="nowrap"><button class="btn btn-sm btn-ghost" v-if="store.can('operator')" @click="editP(p)">编辑</button><button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can()" @click="delP(p)">删除</button></td>
          </tr></tbody></table></div></div>
      </div>
      <ct-modal :show="pForm.show" :title="pForm.data && pForm.data.id ? '编辑减排项目' : '新增减排项目'" :busy="pForm.busy" @close="pForm.show=false" @ok="saveP" lg>
        <div v-if="pForm.data" class="form">
          <div class="field full"><label>项目名称</label><input class="input" v-model="pForm.data.name"></div>
          <div class="field"><label>实施单位</label><select class="select" v-model="pForm.data.org_node_id"><option v-for="n in store.nodes.filter(n => n.level !== 'unit')" :key="n.id" :value="n.id">{{ n.name }}</option></select></div>
          <div class="field"><label>类别</label><select class="select" v-model="pForm.data.category"><option v-for="(l,k) in CT.labels.projectCategory" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field"><label>状态</label><select class="select" v-model="pForm.data.status"><option v-for="(l,k) in CT.labels.projectStatus" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field"><label>负责人</label><input class="input" v-model="pForm.data.owner"></div>
          <div class="field"><label>开始</label><input class="input" type="date" v-model="pForm.data.start_date"></div>
          <div class="field"><label>结束</label><input class="input" type="date" v-model="pForm.data.end_date"></div>
          <div class="field"><label>投资（万元）</label><input class="input" type="number" v-model.number="pForm.data.investment_wan_yuan"></div>
          <div class="field"><label>预期年减排（t）</label><input class="input" type="number" v-model.number="pForm.data.expected_reduction_t"></div>
          <div class="field"><label>已实现减排（t）</label><input class="input" type="number" v-model.number="pForm.data.actual_reduction_t"></div>
          <div class="field full"><label>说明</label><input class="input" v-model="pForm.data.description"></div>
        </div>
      </ct-modal>
      <ct-modal :show="tForm.show" :title="tForm.data && tForm.data.id ? '编辑目标' : '新增目标'" :busy="tForm.busy" @close="tForm.show=false" @ok="saveT">
        <div v-if="tForm.data" class="form">
          <div class="field"><label>组织</label><select class="select" v-model="tForm.data.org_node_id"><option v-for="n in store.nodes.filter(n => n.level !== 'unit')" :key="n.id" :value="n.id">{{ n.name }}</option></select></div>
          <div class="field"><label>目标年度</label><input class="input" type="number" v-model.number="tForm.data.year"></div>
          <div class="field"><label>类型</label><select class="select" v-model="tForm.data.target_type" @change="tForm.data.unit = tForm.data.target_type === 'absolute' ? 'tCO2e' : 'tCO2e/万元'"><option value="absolute">总量目标</option><option value="intensity">强度目标</option></select></div>
          <div class="field"><label>单位</label><input class="input" v-model="tForm.data.unit"></div>
          <div class="field"><label>基准年</label><input class="input" type="number" v-model.number="tForm.data.baseline_year"></div>
          <div class="field"><label>基准值</label><input class="input" type="number" step="any" v-model.number="tForm.data.baseline_value"></div>
          <div class="field"><label>目标值</label><input class="input" type="number" step="any" v-model.number="tForm.data.target_value"></div>
          <div class="field full"><label>说明</label><input class="input" v-model="tForm.data.description"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
