/* 碳配额与碳资产 */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.quota = {
    name: 'page-quota',
    title: '碳配额与资产',
    setup() {
      const store = CT.store;
      const year = ref(CT.year());
      const ov = ref(null);
      const pace = ref([]);
      const txs = ref([]);
      const allowances = ref([]);
      const txForm = reactive({ show: false, busy: false, data: null });
      const alForm = reactive({ show: false, busy: false, data: null });
      const load = () => CT.load(async () => {
        const [o, p, t, a] = await Promise.all([
          CT.api.get('/quota/overview' + CT.api.qs({ year: year.value })),
          CT.api.get('/quota/pace' + CT.api.qs({ year: year.value, node_id: store.nodeId })),
          CT.api.get('/quota/transactions' + CT.api.qs({ year: year.value })),
          CT.api.get('/quota/allowances'),
        ]);
        ov.value = o; pace.value = p.items; txs.value = t.items; allowances.value = a.items;
      });
      onMounted(load);
      watch([year, () => store.nodeId], load);
      const paceOpt = computed(() => CT.charts.line({
        categories: pace.value.map((x) => x.period.slice(5) + '月'),
        series: [
          { name: '累计排放', data: pace.value.map((x) => (x.has_data ? x.cumulative_t : null)), area: true },
          { name: '配额线性进度', data: pace.value.map((x) => x.budget_line_t), dashed: true },
        ],
        unit: 'tCO₂e', digits: 0,
      }));
      const monthlyOpt = computed(() => CT.charts.stackedBar({ categories: pace.value.map((x) => x.period.slice(5) + '月'), series: [{ name: '月排放', data: pace.value.map((x) => x.monthly_t) }], digits: 0, extra: { legend: { show: false } } }));
      const editTx = () => { txForm.data = { site_id: (store.sites()[0] || {}).id, trade_date: CT.nowIso().slice(0, 10), tx_type: 'buy', product: 'CEA', quantity_t: null, price: ov.value ? ov.value.carbon_price_cny : 85, counterparty: '', note: '' }; txForm.show = true; };
      const saveTx = () => CT.load(async () => { txForm.busy = true; try { await CT.api.post('/quota/transactions', Object.assign({}, txForm.data, { trade_date: txForm.data.trade_date + 'T00:00:00+08:00' })); CT.toast('交易已入账', 'ok'); txForm.show = false; await load(); } finally { txForm.busy = false; } });
      const delTx = async (t) => { if (!(await CT.confirm('删除交易记录', '确定删除该条交易？', { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/quota/transactions/${t.id}`); await load(); }); };
      const editAl = (a) => { alForm.data = a ? { site_id: a.site_id, year: a.year, allocated_t: a.allocated_t, adjustments_t: a.adjustments_t, covers_scope2: a.covers_scope2, note: a.note } : { site_id: (store.sites()[0] || {}).id, year: year.value, allocated_t: null, adjustments_t: 0, covers_scope2: true, note: '' }; alForm.show = true; };
      const saveAl = () => CT.load(async () => { alForm.busy = true; try { await CT.api.post('/quota/allowances', alForm.data); CT.toast('配额已保存', 'ok'); alForm.show = false; await load(); } finally { alForm.busy = false; } });
      const years = computed(() => { const y = CT.year(); return [y - 1, y, y + 1]; });
      const sign = (t) => (['buy', 'ccer_offset', 'allocation'].includes(t.tx_type) ? '+' : '−');
      return { store, year, years, ov, pace, paceOpt, monthlyOpt, txs, allowances, txForm, editTx, saveTx, delTx, alForm, editAl, saveAl, sign, CT };
    },
    template: `
    <div class="stack" v-if="ov">
      <div class="card"><div class="card-b"><div class="toolbar">
        <ct-seg v-model="year" :options="years.map(y => ({value: y, label: y + ' 年'}))"></ct-seg>
        <span class="small muted">参考碳价 ¥{{ ov.carbon_price_cny }} / t（系统设置可改）· 已过 {{ ov.days_elapsed }} 天，剩余 {{ ov.days_remaining }} 天</span>
        <span class="spacer"></span>
        <button class="btn" v-if="store.can()" @click="editAl(null)">配额分配</button>
        <button class="btn btn-primary" v-if="store.can()" @click="editTx">登记交易</button>
      </div></div></div>
      <div class="tiles">
        <ct-tile label="可用配额（含交易）" :value="ov.total.available_t" unit="tCO₂e" :digits="0" :sub="'初始分配 ' + CT.fmt.num(ov.total.allocated_t, 0)"></ct-tile>
        <ct-tile label="年初至今已用" :value="ov.total.used_t" unit="tCO₂e" :digits="0" :sub="'使用率 ' + CT.fmt.pct(ov.total.used_ratio)"></ct-tile>
        <ct-tile label="预计年末使用" :value="ov.total.projected_t" unit="tCO₂e" :digits="0" :sub="'预计使用率 ' + CT.fmt.pct(ov.total.projected_ratio)"></ct-tile>
        <ct-tile label="预计盈余 / 缺口" :value="ov.total.balance_t" unit="tCO₂e" :digits="0" :sub="ov.total.balance_t >= 0 ? '盈余可出售' : '需购买配额或 CCER'"></ct-tile>
        <ct-tile label="成本敞口（按参考价）" :value="CT.fmt.money(ov.total.cost_exposure_cny)" :sub="ov.total.cost_exposure_cny ? '缺口 × 碳价' : '当前无缺口'"></ct-tile>
      </div>
      <div class="grid">
        <div class="card col-7">
          <div class="card-h"><h3>配额消耗节奏</h3><span class="sub">{{ store.nodeName() }} · 累计排放 vs 配额线性进度</span></div>
          <div class="card-b"><ct-chart :option="paceOpt" height="260px"></ct-chart></div>
        </div>
        <div class="card col-5">
          <div class="card-h"><h3>月度排放</h3><span class="sub">{{ year }} 年</span></div>
          <div class="card-b"><ct-chart :option="monthlyOpt" height="260px"></ct-chart></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>分厂区配额使用</h3><span class="sub">年末外推 = 已用 + 近 30 日日均 × 剩余天数</span></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>厂区</th><th class="num">初始分配</th><th class="num">交易净额</th><th class="num">可用</th><th class="num">已用</th><th style="width:22%">使用进度（标记为预计）</th><th class="num">近30日日均</th><th class="num">预计年末</th><th class="num">盈余/缺口</th><th class="num">成本敞口</th></tr></thead>
          <tbody><tr v-for="r in ov.sites" :key="r.site_id">
            <td><strong>{{ r.site_name }}</strong><div class="sub">{{ r.covers_scope2 ? '范围一+二' : '仅范围一' }}</div></td>
            <td class="num">{{ CT.fmt.num(r.allocated_t,0) }}</td><td class="num">{{ r.net_transactions_t >= 0 ? '+' : '' }}{{ CT.fmt.num(r.net_transactions_t,0) }}</td><td class="num">{{ CT.fmt.num(r.available_t,0) }}</td><td class="num">{{ CT.fmt.num(r.used_t,0) }}</td>
            <td><div class="ratebar"><ct-bar :value="r.used_ratio" :marker="r.projected_ratio" :warn="0.85" :crit="1"></ct-bar><span class="small num muted">{{ CT.fmt.pct(r.used_ratio) }} → {{ CT.fmt.pct(r.projected_ratio) }}</span></div></td>
            <td class="num">{{ CT.fmt.num(r.recent_daily_t,1) }}</td><td class="num">{{ CT.fmt.num(r.projected_t,0) }}</td>
            <td class="num" :style="{color: r.balance_t < 0 ? 'var(--critical)' : 'inherit'}">{{ r.balance_t >= 0 ? '+' : '' }}{{ CT.fmt.num(r.balance_t,0) }}</td>
            <td class="num">{{ r.cost_exposure_cny ? CT.fmt.money(r.cost_exposure_cny) : '—' }}</td>
          </tr></tbody></table></div></div>
      </div>
      <div class="grid">
        <div class="card col-7">
          <div class="card-h"><h3>碳资产交易台账</h3><span class="sub">{{ year }} 年 · CEA / CCER</span></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>日期</th><th>厂区</th><th>类型</th><th>产品</th><th class="num">数量 t</th><th class="num">单价</th><th class="num">金额</th><th>对手方</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!txs.length"><td colspan="9" class="empty">本年暂无交易</td></tr>
              <tr v-for="t in txs" :key="t.id"><td class="num nowrap">{{ CT.fmt.date(t.trade_date) }}</td><td class="nowrap">{{ t.site_name }}</td><td><ct-tag :text="CT.label('txType', t.tx_type)"></ct-tag></td><td>{{ t.product }}</td><td class="num">{{ sign(t) }}{{ CT.fmt.num(t.quantity_t,0) }}</td><td class="num">{{ t.price ? '¥' + CT.fmt.num(t.price,2) : '—' }}</td><td class="num">{{ t.amount ? CT.fmt.money(t.amount) : '—' }}</td><td class="small muted">{{ t.counterparty }}<div class="sub">{{ t.note }}</div></td><td><button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can()" @click="delTx(t)">删除</button></td></tr>
            </tbody></table></div></div>
        </div>
        <div class="card col-5">
          <div class="card-h"><h3>配额分配记录</h3></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>年度</th><th>厂区</th><th class="num">分配量</th><th class="num">调整</th><th>口径</th><th></th></tr></thead>
            <tbody><tr v-for="a in allowances" :key="a.id"><td class="num">{{ a.year }}</td><td>{{ a.site_name }}</td><td class="num">{{ CT.fmt.num(a.allocated_t,0) }}</td><td class="num">{{ CT.fmt.num(a.adjustments_t,0) }}</td><td class="small">{{ a.covers_scope2 ? '范围一+二' : '范围一' }}</td><td><button class="btn btn-sm btn-ghost" v-if="store.can()" @click="editAl(a)">编辑</button></td></tr></tbody></table></div></div>
        </div>
      </div>
      <ct-modal :show="txForm.show" title="登记碳资产交易" :busy="txForm.busy" @close="txForm.show=false" @ok="saveTx">
        <div v-if="txForm.data" class="form">
          <div class="field"><label>厂区</label><select class="select" v-model="txForm.data.site_id"><option v-for="s in store.sites()" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
          <div class="field"><label>日期</label><input class="input" type="date" v-model="txForm.data.trade_date"></div>
          <div class="field"><label>类型</label><select class="select" v-model="txForm.data.tx_type"><option v-for="(l,k) in CT.labels.txType" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field"><label>产品</label><select class="select" v-model="txForm.data.product"><option>CEA</option><option>CCER</option></select></div>
          <div class="field"><label>数量（t）</label><input class="input" type="number" v-model.number="txForm.data.quantity_t"></div>
          <div class="field"><label>单价（元/t）</label><input class="input" type="number" step="0.01" v-model.number="txForm.data.price"></div>
          <div class="field full"><label>对手方</label><input class="input" v-model="txForm.data.counterparty"></div>
          <div class="field full"><label>备注</label><input class="input" v-model="txForm.data.note"></div>
        </div>
      </ct-modal>
      <ct-modal :show="alForm.show" title="年度配额分配" :busy="alForm.busy" @close="alForm.show=false" @ok="saveAl">
        <div v-if="alForm.data" class="form">
          <div class="field"><label>厂区</label><select class="select" v-model="alForm.data.site_id"><option v-for="s in store.sites()" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
          <div class="field"><label>年度</label><input class="input" type="number" v-model.number="alForm.data.year"></div>
          <div class="field"><label>分配量（t）</label><input class="input" type="number" v-model.number="alForm.data.allocated_t"></div>
          <div class="field"><label>调整量（t，可为负）</label><input class="input" type="number" v-model.number="alForm.data.adjustments_t"></div>
          <div class="field"><label>覆盖范围二</label><ct-switch v-model="alForm.data.covers_scope2"></ct-switch></div>
          <div class="field full"><label>备注</label><input class="input" v-model="alForm.data.note"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
