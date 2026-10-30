/* 数据质量 */
(function (CT) {
  const { ref, computed, watch, onMounted } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.quality = {
    name: 'page-quality',
    title: '数据质量',
    setup() {
      const store = CT.store;
      const hours = ref(24);
      const sum = ref(null);
      const issues = ref([]);
      const load = () => CT.load(async () => {
        const [s, i] = await Promise.all([CT.api.get('/data-quality/summary' + CT.api.qs({ hours: hours.value, node_id: store.nodeId })), CT.api.get('/data-quality/issues' + CT.api.qs({ hours: hours.value }))]);
        sum.value = s; issues.value = i.items;
      });
      onMounted(load);
      watch([hours, () => store.nodeId], load);
      const types = computed(() => store.dict('device_types'));
      const o = computed(() => (sum.value ? sum.value.overall : {}));
      const compOpt = computed(() => sum.value ? CT.charts.hbar({ items: sum.value.devices.slice().sort((a, b) => a.completeness - b.completeness).map((d) => ({ label: d.device_name, value: +(d.completeness * 100).toFixed(1) })), unit: '%', digits: 1, max: 20, extra: { xAxis: { max: 100 } } }) : null);
      const siteName = (id) => { const n = store.nodes.find((x) => x.id === id); return n ? n.name : ''; };
      const compClass = (v) => (v >= 0.95 ? 'tag-good' : v >= 0.8 ? 'tag-warning' : 'tag-critical');
      return { store, hours, sum, o, issues, types, compOpt, siteName, compClass, CT };
    },
    template: `
    <div class="stack" v-if="sum">
      <div class="card"><div class="card-b"><div class="toolbar">
        <ct-seg v-model="hours" :options="[{value:24,label:'近 24 小时'},{value:168,label:'近 7 天'},{value:720,label:'近 30 天'}]"></ct-seg>
        <span class="small muted">完整率 = 实收点数 / 按采样周期应收点数；有效率 = 合理区间内点数占比。</span>
      </div></div></div>
      <div class="tiles">
        <ct-tile label="平均完整率" :value="CT.fmt.pct(o.avg_completeness)" :sub="o.devices_below_95 + ' 台低于 95%'"></ct-tile>
        <ct-tile label="平均有效率" :value="CT.fmt.pct(o.avg_validity)"></ct-tile>
        <ct-tile label="离线设备" :value="String(o.devices_offline)"></ct-tile>
        <ct-tile label="校准过期 / 30 天内到期" :value="o.calibration_overdue + ' / ' + o.calibration_due_30d"></ct-tile>
        <ct-tile label="待处理问题" :value="String(issues.length)" :sub="issues.filter(i => i.severity === 'major').length + ' 项重要'"></ct-tile>
      </div>
      <div class="grid">
        <div class="card col-5">
          <div class="card-h"><h3>设备完整率排序</h3><span class="sub">低者在前</span></div>
          <div class="card-b"><ct-chart :option="compOpt" :height="(Math.max(5, Math.min(20, sum.devices.length)) * 26 + 20) + 'px'"></ct-chart></div>
        </div>
        <div class="card col-7">
          <div class="card-h"><h3>问题清单与建议措施</h3></div>
          <div class="card-b flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>级别</th><th>设备</th><th>问题</th><th>详情</th><th>建议措施</th></tr></thead>
            <tbody>
              <tr v-if="!issues.length"><td colspan="5" class="empty">未发现数据质量问题</td></tr>
              <tr v-for="(i, idx) in issues" :key="idx" class="sev-stripe" :class="i.severity"><td><ct-tag dict="severity" :value="i.severity"></ct-tag></td><td>{{ i.device_name }}</td><td><strong>{{ i.issue }}</strong></td><td class="small">{{ i.detail }}</td><td class="small muted">{{ i.action }}</td></tr>
            </tbody></table></div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>设备数据质量明细</h3><span class="sub">近 {{ hours }} 小时</span></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>设备</th><th>厂区</th><th>状态</th><th class="num">应收 / 实收</th><th style="width:18%">完整率</th><th class="num">有效率</th><th class="num">坏点</th><th class="num">时延</th><th>校准到期</th></tr></thead>
          <tbody><tr v-for="d in sum.devices" :key="d.device_id">
            <td><strong>{{ d.device_name }}</strong><div class="sub">{{ (types[d.device_type]||{}).label }}</div></td><td class="small">{{ siteName(d.site_id) }}</td><td><ct-tag dict="deviceStatus" :value="d.status" dot></ct-tag></td>
            <td class="num">{{ CT.fmt.num(d.expected) }} / {{ CT.fmt.num(d.received) }}</td>
            <td><div class="ratebar"><ct-bar :value="d.completeness" :warn="2" :crit="2"></ct-bar><span class="tag" :class="compClass(d.completeness)">{{ CT.fmt.pct(d.completeness) }}</span></div></td>
            <td class="num">{{ CT.fmt.pct(d.validity) }}</td><td class="num">{{ d.bad_points }}</td><td class="num">{{ d.latency_min !== null ? CT.fmt.num(d.latency_min,1) + ' 分钟' : '—' }}</td>
            <td><span class="tag" :class="d.calibration_days_left < 0 ? 'tag-critical' : d.calibration_days_left <= 30 ? 'tag-warning' : 'tag-neutral'">{{ CT.fmt.date(d.calibration_due) }}<span v-if="d.calibration_days_left !== null">（{{ d.calibration_days_left < 0 ? '过期 ' + (-d.calibration_days_left) : '剩 ' + d.calibration_days_left }} 天）</span></span></td>
          </tr></tbody></table></div></div>
      </div>
    </div>`,
  };
})(window.CT);
