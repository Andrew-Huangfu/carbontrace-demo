/* 报告与合规（MRV 流程） */
(function (CT) {
  const { ref, reactive, computed, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.reports = {
    name: 'page-reports',
    title: '报告与合规',
    setup() {
      const store = CT.store;
      const reports = ref([]);
      const gen = reactive({ show: false, busy: false, report_type: 'monthly', org_node_id: null, period: '' });
      const detail = ref(null);
      const steps = [{ key: 'draft', label: '草稿' }, { key: 'internal_review', label: '内部审核' }, { key: 'verifying', label: '第三方核查' }, { key: 'submitted', label: '已提交' }, { key: 'approved', label: '已通过' }];
      const load = () => CT.load(async () => { reports.value = (await CT.api.get('/reports')).items; if (!detail.value && reports.value.length) detail.value = await CT.api.get(`/reports/${reports.value[0].id}`); });
      onMounted(load);
      const openGen = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); gen.org_node_id = store.nodeId || store.tree[0].id; gen.period = gen.report_type === 'monthly' ? CT.monthKey(d) : String(CT.year() - 1); gen.show = true; };
      const doGen = () => CT.load(async () => { gen.busy = true; try { const r = await CT.api.post('/reports/generate', { report_type: gen.report_type, org_node_id: gen.org_node_id, period: gen.period }); CT.toast('报告已生成', 'ok'); gen.show = false; await load(); detail.value = r; } finally { gen.busy = false; } });
      const advance = async (r, status) => { const v = status === 'verifying' ? '中环联合（北京）认证中心' : null; if (!(await CT.confirm('流转状态', `将「${r.title}」流转为「${CT.label('reportStatus', status)}」？`))) return; await CT.load(async () => { await CT.api.post(`/reports/${r.id}/status`, { status, verifier: v }); CT.toast('已流转', 'ok'); await load(); if (detail.value && detail.value.id === r.id) detail.value = await CT.api.get(`/reports/${r.id}`); }); };
      const openDetail = (r) => CT.load(async () => { detail.value = await CT.api.get(`/reports/${r.id}`); });
      const download = (r) => { const u = CT.api.downloadUrl(`/reports/${r.id}/download`); if (!u) { CT.toast('演示模式下不提供文件下载；本地运行后端可导出 Excel', 'info'); return; } CT.download(u); };
      const remove = async (r) => { if (!(await CT.confirm('删除报告', `确定删除「${r.title}」？`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/reports/${r.id}`); if (detail.value && detail.value.id === r.id) detail.value = null; await load(); }); };
      const summaryOpt = computed(() => { const s = detail.value && detail.value.summary; if (!s) return null; return CT.charts.stackedBar({ categories: s.trend.map((x) => CT.fmt.period(x.period)), series: [{ name: '范围一', data: s.trend.map((x) => x.scope1) }, { name: '范围二', data: s.trend.map((x) => x.scope2) }], digits: 0 }); });
      const bySourceOpt = computed(() => { const s = detail.value && detail.value.summary; if (!s) return null; return CT.charts.hbar({ items: s.by_source.map((x) => ({ label: x.label, value: x.co2e_t })), max: 10 }); });
      const nextLabel = (st) => ({ internal_review: '提交内审', verifying: '送第三方核查', submitted: '提交主管部门', approved: '核查通过', draft: '退回草稿' }[st] || st);
      return { store, reports, gen, openGen, doGen, advance, detail, openDetail, download, remove, steps, summaryOpt, bySourceOpt, nextLabel, CT };
    },
    template: `
    <div class="stack">
      <div class="card"><div class="card-b"><div class="toolbar">
        <span class="small muted">月度 / 年度温室气体排放报告按《企业温室气体排放核算方法与报告指南》结构生成，可导出 Excel；MRV 流程：草稿 → 内部审核 → 第三方核查 → 提交 → 通过。</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" v-if="store.can('operator','auditor')" @click="openGen">生成报告</button>
      </div></div></div>
      <div class="grid">
        <div class="card" :class="detail ? 'col-7' : 'col-12'">
          <div class="card-h"><h3>报告列表</h3><span class="sub">{{ reports.length }} 份</span></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>报告</th><th>类型</th><th>期间</th><th class="num">排放量 tCO₂e</th><th>流程</th><th>核查机构</th><th>生成</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!reports.length"><td colspan="8" class="empty">暂无报告</td></tr>
              <tr v-for="r in reports" :key="r.id" class="clickable" :class="{selected: detail && detail.id === r.id}" @click="openDetail(r)">
                <td><strong>{{ r.title }}</strong><div class="sub">{{ r.org_name }}</div></td><td class="small">{{ CT.label('reportType', r.report_type) }}</td><td class="num">{{ r.period }}</td>
                <td class="num">{{ CT.fmt.num(r.total_t,0) }}</td><td><ct-tag dict="reportStatus" :value="r.status"></ct-tag></td><td class="small muted">{{ r.verifier || '—' }}</td>
                <td class="small num nowrap">{{ CT.fmt.date(r.generated_at) }}<div class="sub">{{ r.generated_by }}</div></td>
                <td class="nowrap" @click.stop><button class="btn btn-sm" @click="download(r)">Excel</button> <button v-for="s in r.next_status" :key="s" class="btn btn-sm btn-ghost" v-if="store.can('auditor')" @click="advance(r, s)">{{ nextLabel(s) }}</button> <button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can()" @click="remove(r)">删除</button></td>
              </tr>
            </tbody></table></div></div>
        </div>
        <div class="card col-5" v-if="detail">
          <div class="card-h"><div><h3>{{ detail.title }}</h3><div class="sub">生成于 {{ CT.fmt.dt(detail.generated_at) }} · GWP {{ detail.summary.gwp_set }}</div></div><div class="tools"><button class="btn btn-sm btn-ghost" @click="detail=null">关闭</button></div></div>
          <div class="card-b stack">
            <ct-pipeline :steps="steps" :current="detail.status"></ct-pipeline>
            <div class="tiles" style="grid-template-columns:repeat(2,1fr)">
              <ct-tile label="合计排放" :value="detail.summary.totals.total" unit="tCO₂e" :digits="0" :delta="detail.summary.yoy" delta-label="同比" invert></ct-tile>
              <ct-tile label="范围一 / 范围二" :value="CT.fmt.num(detail.summary.totals.scope1,0) + ' / ' + CT.fmt.num(detail.summary.totals.scope2,0)" :sub="'实测法 ' + CT.fmt.pct(detail.summary.totals.total ? (detail.summary.totals.measured||0)/detail.summary.totals.total : 0)"></ct-tile>
            </div>
            <div><div class="small muted mb">期内趋势</div><ct-chart :option="summaryOpt" height="180px"></ct-chart></div>
            <div><div class="small muted mb">分排放源</div><ct-chart :option="bySourceOpt" :height="(Math.min(10, detail.summary.by_source.length) * 26 + 20) + 'px'"></ct-chart></div>
            <dl class="kv"><dt>数据完整率</dt><dd>{{ CT.fmt.pct(detail.summary.data_quality.avg_completeness) }}（{{ detail.summary.data_quality.devices_below_95 }} 台低于 95%）</dd><dt>核查机构</dt><dd>{{ detail.verifier || '—' }}</dd><dt>提交时间</dt><dd>{{ CT.fmt.dt(detail.submitted_at) }}</dd></dl>
          </div>
        </div>
      </div>
      <ct-modal :show="gen.show" title="生成排放报告" :busy="gen.busy" ok-text="生成" @close="gen.show=false" @ok="doGen">
        <div class="form">
          <div class="field"><label>报告类型</label><select class="select" v-model="gen.report_type" @change="gen.period = gen.report_type === 'monthly' ? CT.monthKey(new Date(Date.now() - 30*86400000)) : String(CT.year() - 1)"><option value="monthly">月度报告</option><option value="annual">年度报告</option></select></div>
          <div class="field"><label>报告对象</label><select class="select" v-model="gen.org_node_id"><option v-for="n in store.nodes.filter(n => n.level !== 'unit')" :key="n.id" :value="n.id">{{ n.name }}</option></select></div>
          <div class="field"><label>期间</label><input class="input" v-model="gen.period" :placeholder="gen.report_type === 'monthly' ? 'YYYY-MM' : 'YYYY'"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
