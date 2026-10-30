/* 实时监测：排放源速率、设备实时曲线、事件流（WebSocket + 轮询兜底） */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted, onBeforeUnmount } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.realtime = {
    name: 'page-realtime',
    title: '实时监测',
    setup() {
      const store = CT.store;
      const rt = ref(null);
      const selected = ref(null);          // 选中的排放源
      const live = reactive({});           // device_id -> { metric -> [[ts, v], ...] }
      const events = ref([]);
      const filter = ref('all');
      let unsub = null, timer = null;

      const load = () => CT.load(async () => {
        const r = await CT.api.get('/monitor/realtime' + CT.api.qs({ node_id: store.nodeId }));
        rt.value = r;
        if (!events.value.length) events.value = (r.events || []).slice().reverse();
        if (!selected.value && r.sources.length) select(r.sources[0]);
      });

      const select = async (s) => {
        selected.value = s;
        const since = new Date(Date.now() - 3600 * 1000).toISOString();
        await Promise.all(s.devices.map(async (d) => {
          const r = await CT.api.get(`/devices/${d.id}/readings` + CT.api.qs({ from: since, limit: 2000 })).catch(() => null);
          if (!r) return;
          const out = {};
          for (const [m, pts] of Object.entries(r.series || {})) out[m] = pts.map((p) => [p[0], CT.pointRate(m, p[1], p[3]).value]);
          live[d.id] = out;
        }));
      };

      const onEvent = (ev) => {
        if (ev.type === '_status') return;
        events.value.unshift(ev);
        if (events.value.length > 80) events.value.pop();
        if (ev.type === 'readings' && live[ev.device_id]) {
          for (const p of ev.points) {
            const arr = (live[ev.device_id][p.metric] = live[ev.device_id][p.metric] || []);
            arr.push([p.ts, CT.pointRate(p.metric, p).value]);
            if (arr.length > 1500) arr.shift();
          }
          if (rt.value) {
            const d = rt.value.devices.find((x) => x.id === ev.device_id);
            if (d) { d.status = 'online'; d.last_seen_at = ev.at; for (const p of ev.points) d.latest[p.metric] = { ts: p.ts, value: p.value, unit: p.unit, quality: p.quality, interval_s: p.interval_s }; }
          }
        }
        if (ev.type === 'device_status' && rt.value) { const d = rt.value.devices.find((x) => x.id === ev.device_id); if (d) d.status = ev.status; }
      };

      onMounted(() => { load(); unsub = CT.bus.on('rt', onEvent); timer = setInterval(load, 15000); });
      onBeforeUnmount(() => { unsub && unsub(); clearInterval(timer); });
      watch(() => store.nodeId, () => { selected.value = null; load(); });

      const sources = computed(() => (rt.value ? rt.value.sources.filter((s) => filter.value === 'all' || (filter.value === 'over' ? (s.threshold_t_h && s.rate_t_h > s.threshold_t_h) : String(s.scope) === filter.value)) : []));
      const metricLabel = (m) => (store.dict('metrics')[m] || {}).label || m;
      const metricUnit = (m) => { const spec = store.dict('metrics')[m] || {}; return spec.kind === 'interval' ? (spec.unit || '') + '/h' : (spec.unit || ''); };
      const chartFor = (devId, metric) => {
        const pts = (live[devId] && live[devId][metric]) || [];
        return CT.charts.timeLine({ series: [{ name: metricLabel(metric), data: pts, area: true }], unit: metricUnit(metric), digits: 1, extra: { grid: { top: 10, bottom: 4, left: 4, right: 10, containLabel: true }, legend: { show: false } } });
      };
      const latestText = (m, v) => { const r = CT.pointRate(m, v); return CT.fmt.num(r.value, r.rate ? 0 : 1) + ' ' + r.unit; };
      const selDevices = computed(() => (selected.value && rt.value ? rt.value.devices.filter((d) => d.source_id === selected.value.id) : []));
      const evText = (ev) => {
        if (ev.type === 'readings') return `${ev.device_name} 上报 ${ev.points.map((p) => metricLabel(p.metric) + ' ' + latestText(p.metric, p)).join('，')}`;
        if (ev.type === 'device_status') return `${ev.device_key} 状态变为 ${CT.label('deviceStatus', ev.status)}`;
        if (ev.type === 'alert') return `告警：${ev.alert.title}`;
        if (ev.type === 'alert_resolved') return `告警 #${ev.alert_id} 已自动恢复`;
        return ev.type;
      };
      const evClass = (ev) => (ev.type === 'alert' ? 'tag-critical' : ev.type === 'device_status' ? (ev.status === 'online' ? 'tag-good' : 'tag-serious') : ev.type === 'alert_resolved' ? 'tag-good' : 'tag-neutral');
      const evTag = (ev) => ({ readings: '数据', device_status: '状态', alert: '告警', alert_resolved: '恢复' }[ev.type] || ev.type);
      return { store, rt, sources, selected, select, selDevices, live, chartFor, metricLabel, metricUnit, latestText, filter, events, evText, evClass, evTag, CT };
    },
    template: `
    <div class="stack">
      <div class="tiles" v-if="rt">
        <ct-tile label="当前总排放速率" :value="rt.total_rate_t_h" unit="tCO₂e/h" :digits="2" :sub="'更新 ' + CT.fmt.time(rt.server_time)"></ct-tile>
        <ct-tile label="今日累计" :value="rt.today.total" unit="tCO₂e" :digits="0" :sub="'范围一 ' + CT.fmt.num(rt.today.scope1,0) + ' · 范围二 ' + CT.fmt.num(rt.today.scope2,0)"></ct-tile>
        <ct-tile label="设备在线" :value="rt.device_summary.online + ' / ' + rt.device_summary.total" :sub="rt.device_summary.offline + ' 离线 · ' + rt.device_summary.fault + ' 故障 · ' + rt.device_summary.maintenance + ' 检修'"></ct-tile>
        <ct-tile label="实时通道" :value="store.wsConnected ? 'WebSocket' : '轮询'" :sub="store.wsConnected ? '已连接，秒级推送' : '每 15 秒刷新'"></ct-tile>
      </div>
      <div class="grid">
        <div class="card col-7">
          <div class="card-h"><h3>排放源实时速率</h3><span class="sub">点击查看设备曲线</span>
            <div class="tools"><ct-seg v-model="filter" :options="[{value:'all',label:'全部'},{value:'1',label:'范围一'},{value:'2',label:'范围二'},{value:'over',label:'超阈值'}]"></ct-seg></div></div>
          <div class="card-b">
            <div class="source-grid">
              <div v-for="s in sources" :key="s.id" class="source-card" :class="{active: selected && selected.id === s.id}" @click="select(s)">
                <div class="flex between"><strong class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.name }}</strong>
                  <ct-tag v-if="s.threshold_t_h && s.rate_t_h > s.threshold_t_h" dict="severity" value="critical" text="超限"></ct-tag>
                  <ct-tag v-else-if="s.rate_t_h === null" dict="deviceStatus" value="offline" text="无数据"></ct-tag>
                  <ct-tag v-else dict="deviceStatus" value="online" text="正常"></ct-tag></div>
                <div class="rate">{{ CT.fmt.num(s.rate_t_h, 2) }}<span class="unit">tCO₂e/h</span></div>
                <ct-bar :value="s.threshold_t_h ? (s.rate_t_h || 0) / s.threshold_t_h : 0" :warn="0.9" :crit="1"></ct-bar>
                <div class="flex between small muted"><span>{{ s.site_name }} · {{ CT.label('method', s.method) }}</span><span class="num">今日 {{ CT.fmt.num(s.today_t, 1) }} t</span></div>
              </div>
            </div>
            <ct-empty v-if="rt && !sources.length" text="没有符合条件的排放源"></ct-empty>
          </div>
        </div>
        <div class="card col-5">
          <div class="card-h"><h3>事件流</h3><span class="sub">采集 / 状态 / 告警</span></div>
          <div class="card-b"><div class="event-list">
            <div v-for="(ev, i) in events" :key="i" class="event"><span class="t">{{ CT.fmt.time(ev.at) }}</span><span><span class="tag" :class="evClass(ev)" style="margin-right:6px">{{ evTag(ev) }}</span>{{ evText(ev) }}</span></div>
            <div v-if="!events.length" class="empty">等待事件…</div>
          </div></div>
        </div>
      </div>
      <div v-if="selected" class="card">
        <div class="card-h"><h3>{{ selected.name }} · 设备实时曲线</h3><span class="sub">最近 60 分钟 · {{ selected.site_name }} / {{ selected.unit_name }}</span>
          <div class="tools small muted">{{ CT.label('method', selected.method) }} · 阈值 {{ selected.threshold_t_h ? CT.fmt.num(selected.threshold_t_h,2) + ' t/h' : '未设置' }}</div></div>
        <div class="card-b">
          <div v-for="d in selDevices" :key="d.id" class="mb">
            <div class="flex between mb"><div class="flex"><strong>{{ d.name }}</strong><ct-tag dict="deviceStatus" :value="d.status" dot></ct-tag><span class="small muted">{{ d.device_key }} · 最后上报 {{ CT.fmt.ago(d.last_seen_at) }}</span></div>
              <div class="flex small wrap"><span v-for="(v, m) in d.latest" :key="m" class="tag tag-neutral">{{ metricLabel(m) }} <strong class="num">{{ latestText(m, v) }}</strong></span></div></div>
            <div class="grid"><div v-for="m in d.metrics" :key="m" class="col-6 keep"><div class="small muted">{{ metricLabel(m) }}<span v-if="(store.dict('metrics')[m]||{}).kind === 'interval'">（按小时速率）</span></div><ct-chart :option="chartFor(d.id, m)" height="150px"></ct-chart></div></div>
          </div>
          <ct-empty v-if="!selDevices.length" text="该排放源未绑定采集设备（手工台账来源）"></ct-empty>
        </div>
      </div>
    </div>`,
  };
})(window.CT);
