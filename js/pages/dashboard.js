/* 总览驾驶舱 */
(function (CT) {
  const { ref, computed, watch, onMounted, onBeforeUnmount } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.dashboard = {
    name: 'page-dashboard',
    title: '总览驾驶舱',
    setup() {
      const store = CT.store;
      const ov = ref(null);
      const trend = ref([]);
      const bySite = ref([]);
      const byType = ref([]);
      const yoy = ref([]);
      const quota = ref(null);
      const days = ref(30);
      let timer = null;

      const load = () => CT.load(async () => {
        const q = CT.api.qs({ node_id: store.nodeId });
        const [o, t, s, ty, y, qo] = await Promise.all([
          CT.api.get('/dashboard/overview' + q),
          CT.api.get('/dashboard/trend' + CT.api.qs({ node_id: store.nodeId, granularity: 'day', days: days.value })),
          CT.api.get('/dashboard/breakdown' + CT.api.qs({ node_id: store.nodeId, by: store.isGroup() ? 'site' : 'source', days: days.value })),
          CT.api.get('/dashboard/breakdown' + CT.api.qs({ node_id: store.nodeId, by: 'source_type', days: days.value })),
          CT.api.get('/dashboard/yoy' + q),
          CT.api.get('/quota/overview'),
        ]);
        ov.value = o; trend.value = t.items; bySite.value = s.items; byType.value = ty.items; yoy.value = y.items; quota.value = qo;
        store.openAlerts = o.alerts.open + o.alerts.acknowledged;
      });
      onMounted(() => { load(); timer = setInterval(() => load(), 60000); });
      onBeforeUnmount(() => clearInterval(timer));
      watch(() => store.nodeId, load);
      watch(days, load);

      const k = computed(() => (ov.value ? ov.value.kpis : {}));
      const trendOpt = computed(() => CT.charts.stackedBar({
        categories: trend.value.map((x) => CT.fmt.period(x.period)),
        series: [{ name: '范围一', data: trend.value.map((x) => +x.scope1.toFixed(1)) }, { name: '范围二', data: trend.value.map((x) => +x.scope2.toFixed(1)) }],
      }));
      const siteOpt = computed(() => CT.charts.hbar({ items: bySite.value.map((x) => ({ label: x.label, value: x.co2e_t })), max: 8 }));
      const typeOpt = computed(() => CT.charts.donut({ items: byType.value.map((x) => ({ label: x.label, value: x.co2e_t })) }));
      const yoyOpt = computed(() => CT.charts.groupedBar({
        categories: yoy.value.map((x) => x.month + '月'),
        series: [{ name: String(CT.year() - 1), data: yoy.value.map((x) => x.previous), color: CT.cssVar('--s2') }, { name: String(CT.year()), data: yoy.value.map((x) => x.current), color: CT.cssVar('--s1') }],
      }));
      const quotaRows = computed(() => {
        if (!quota.value) return [];
        const n = store.node();
        if (n && n.level === 'site') return quota.value.sites.filter((s) => s.site_id === n.id);
        if (n && n.level === 'unit') { const site = store.siteOf(n.id); return quota.value.sites.filter((s) => site && s.site_id === site.id); }
        return quota.value.sites;
      });
      const rateOf = (s) => (s.threshold_t_h ? s.rate_t_h / s.threshold_t_h : 0);
      return { store, ov, k, trendOpt, siteOpt, typeOpt, yoyOpt, quotaRows, days, CT, rateOf, load };
    },
    template: `
    <div v-if="ov" class="stack">
      <div class="tiles">
        <ct-tile label="今日排放（截至当前）" :value="k.today_t" unit="tCO₂e" :digits="0" :delta="CT.fmt.delta(k.today_t, k.yesterday_same_t)" delta-label="较昨日同时段" invert></ct-tile>
        <ct-tile label="本月累计" :value="k.mtd_t" unit="tCO₂e" :digits="0" :delta="CT.fmt.delta(k.mtd_t, k.last_month_same_t)" delta-label="较上月同期" invert></ct-tile>
        <ct-tile label="本年累计" :value="k.ytd_t" unit="tCO₂e" :digits="0" :delta="CT.fmt.delta(k.ytd_t, k.last_ytd_t)" delta-label="较去年同期" invert></ct-tile>
        <ct-tile label="实时排放速率" :value="k.rate_t_h" unit="tCO₂e/h" :digits="2" :sub="'实测法占比 ' + CT.fmt.pct(k.measured_share)"></ct-tile>
        <ct-tile label="设备在线" :value="ov.devices.online + ' / ' + ov.devices.total" :sub="ov.devices.offline ? ov.devices.offline + ' 台离线' : '全部在线'"></ct-tile>
        <ct-tile label="未处理告警" :value="String(ov.alerts.open + ov.alerts.acknowledged)" :sub="ov.alerts.critical + ' 紧急 · ' + ov.alerts.major + ' 重要'"></ct-tile>
      </div>

      <div class="grid">
        <div class="card col-8">
          <div class="card-h"><h3>排放趋势</h3><span class="sub">按范围 · 日</span>
            <div class="tools"><ct-seg v-model="days" :options="[{value:14,label:'14 天'},{value:30,label:'30 天'},{value:90,label:'90 天'}]"></ct-seg></div></div>
          <div class="card-b"><ct-chart :option="trendOpt" height="280px"></ct-chart></div>
        </div>
        <div class="card col-4">
          <div class="card-h"><h3>排放源类型构成</h3><span class="sub">近 {{ days }} 天</span></div>
          <div class="card-b"><ct-chart :option="typeOpt" height="280px"></ct-chart></div>
        </div>
      </div>

      <div class="grid">
        <div class="card col-4">
          <div class="card-h"><h3>{{ store.isGroup() ? '分厂区排放' : '分排放源' }}</h3><span class="sub">近 {{ days }} 天</span></div>
          <div class="card-b"><ct-chart :option="siteOpt" height="250px"></ct-chart></div>
        </div>
        <div class="card col-4">
          <div class="card-h"><h3>逐月同比</h3><span class="sub">{{ CT.year() - 1 }} vs {{ CT.year() }}</span></div>
          <div class="card-b"><ct-chart :option="yoyOpt" height="250px"></ct-chart></div>
        </div>
        <div class="card col-4">
          <div class="card-h"><h3>年度配额进度</h3><span class="sub">范围一 + 范围二</span><div class="tools"><a href="#quota" class="small">详情</a></div></div>
          <div class="card-b stack">
            <div v-for="q in quotaRows" :key="q.site_id">
              <div class="flex between small"><strong>{{ q.site_name }}</strong><span class="num">{{ CT.fmt.num(q.used_t,0) }} / {{ CT.fmt.num(q.available_t,0) }} t · 预计 {{ CT.fmt.pct(q.projected_ratio) }}</span></div>
              <ct-bar :value="q.used_ratio" :marker="q.projected_ratio" :warn="0.85" :crit="1"></ct-bar>
            </div>
            <div v-if="ov.target" class="notice" :class="{warn: !ov.target.on_track}">
              年度目标 {{ CT.fmt.num(ov.target.target_value,0) }} t ·
              按当前节奏预计 {{ CT.fmt.num(ov.target.projected,0) }} t，
              <strong>{{ ov.target.on_track ? '可达成' : '存在缺口 ' + CT.fmt.num(ov.target.gap,0) + ' t' }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="card col-7">
          <div class="card-h"><h3>实时排放源 TOP</h3><span class="sub">近 15 分钟均值</span><div class="tools"><a href="#realtime" class="small">实时监测</a></div></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>排放源</th><th>厂区</th><th>范围</th><th class="num">速率 tCO₂e/h</th><th style="width:34%">相对阈值</th></tr></thead>
            <tbody><tr v-for="s in ov.top_sources" :key="s.id">
              <td>{{ s.name }}</td><td class="muted">{{ s.site_name }}</td><td><ct-tag :text="CT.label('scope', s.scope)"></ct-tag></td>
              <td class="num">{{ CT.fmt.num(s.rate_t_h, 2) }}</td>
              <td><div class="ratebar"><ct-bar :value="rateOf(s)" :warn="0.9" :crit="1"></ct-bar><span class="small muted num">{{ s.threshold_t_h ? CT.fmt.pct(rateOf(s),0) : '无阈值' }}</span></div></td>
            </tr></tbody></table></div></div>
        </div>
        <div class="card col-5">
          <div class="card-h"><h3>最新告警</h3><div class="tools"><a href="#alerts" class="small">告警中心</a></div></div>
          <div class="card-b flush">
            <div v-if="!ov.alerts.latest.length" class="empty">当前没有未处理告警</div>
            <div v-for="a in ov.alerts.latest" :key="a.id" class="sev-stripe" :class="a.severity" style="padding:10px 14px;border-bottom:1px solid var(--border)">
              <div class="flex between"><strong class="small">{{ a.title }}</strong><ct-tag dict="severity" :value="a.severity"></ct-tag></div>
              <div class="small muted" style="margin-top:2px">{{ a.message }}</div>
              <div class="small muted num" style="margin-top:2px">{{ CT.fmt.dt(a.triggered_at) }} · {{ CT.label('alertStatus', a.status) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="tiles"><div v-for="i in 7" :key="i" class="tile"><div class="skeleton" style="height:12px;width:50%"></div><div class="skeleton" style="height:26px;width:70%"></div></div></div>`,
  };
})(window.CT);
