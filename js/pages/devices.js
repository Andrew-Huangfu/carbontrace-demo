/* 采集设备管理 */
(function (CT) {
  const { ref, reactive, computed, watch, onMounted, onBeforeUnmount } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.devices = {
    name: 'page-devices',
    title: '采集设备',
    setup() {
      const store = CT.store;
      const data = ref({ items: [], summary: {} });
      const f = reactive({ status: '', device_type: '', q: '' });
      const detail = ref(null);
      const readings = ref(null);
      const form = reactive({ show: false, busy: false, data: null });
      const keyShown = ref(null);
      let unsub = null;

      const load = () => CT.load(async () => { data.value = await CT.api.get('/devices' + CT.api.qs({ node_id: store.nodeId, status: f.status, device_type: f.device_type, q: f.q })); });
      onMounted(() => { load(); unsub = CT.bus.on('rt', (ev) => { if (ev.type === 'device_status') { const d = data.value.items.find((x) => x.id === ev.device_id); if (d) d.status = ev.status; } if (ev.type === 'readings') { const d = data.value.items.find((x) => x.id === ev.device_id); if (d) { d.last_seen_at = ev.at; for (const p of ev.points) d.latest[p.metric] = { ts: p.ts, value: p.value, unit: p.unit, quality: p.quality, interval_s: p.interval_s }; } if (detail.value && detail.value.id === ev.device_id) { for (const p of ev.points) detail.value.latest[p.metric] = { ts: p.ts, value: p.value, unit: p.unit, quality: p.quality, interval_s: p.interval_s }; } } }); });
      onBeforeUnmount(() => unsub && unsub());
      watch(() => store.nodeId, load);
      watch(() => [f.status, f.device_type], load);
      let qt = null; watch(() => f.q, () => { clearTimeout(qt); qt = setTimeout(load, 300); });

      const types = computed(() => store.dict('device_types'));
      const metrics = computed(() => store.dict('metrics'));
      const metricLabel = (m) => (metrics.value[m] || {}).label || m;
      const open = (d) => CT.load(async () => {
        detail.value = await CT.api.get(`/devices/${d.id}`);
        keyShown.value = null;
        readings.value = await CT.api.get(`/devices/${d.id}/readings` + CT.api.qs({ days: 1, limit: 3000 }));
      });
      const chartFor = (m) => {
        const pts = (readings.value && readings.value.series[m]) || [];
        const spec = metrics.value[m] || {};
        return CT.charts.timeLine({ series: [{ name: metricLabel(m), data: pts.map((p) => [p[0], CT.pointRate(m, p[1], p[3]).value]), area: true }], unit: spec.kind === 'interval' ? spec.unit + '/h' : spec.unit, digits: 1, extra: { legend: { show: false }, grid: { top: 10, bottom: 4, left: 4, right: 10, containLabel: true } } });
      };
      const latestText2 = (m, v) => { const r = CT.pointRate(m, v); return CT.fmt.num(r.value, r.rate ? 0 : 1) + ' ' + r.unit; };
      const edit = (d) => {
        form.data = d ? { id: d.id, name: d.name, device_key: d.device_key, device_type: d.device_type, model: d.model, vendor: d.vendor, protocol: d.protocol, source_id: d.source_id, org_node_id: d.org_node_id, sampling_interval_s: d.sampling_interval_s, firmware: d.firmware, install_date: d.install_date ? d.install_date.slice(0, 10) : '', calibration_due: d.calibration_due ? d.calibration_due.slice(0, 10) : '', location: d.location, status: d.status, metrics: d.metrics }
          : { name: '', device_key: '', device_type: 'gas_meter', model: '', vendor: '', protocol: 'MQTT', source_id: null, org_node_id: (store.units()[0] || {}).id, sampling_interval_s: 300, firmware: '', install_date: '', calibration_due: '', location: '', status: 'offline', metrics: null };
        form.show = true;
      };
      const sources = ref([]);
      const loadSources = () => CT.load(async () => { sources.value = (await CT.api.get('/sources')).items; }, { silent: true });
      onMounted(loadSources);
      const save = () => CT.load(async () => {
        form.busy = true;
        try {
          const b = Object.assign({}, form.data); delete b.id;
          b.install_date = b.install_date ? b.install_date + 'T00:00:00Z' : null;
          b.calibration_due = b.calibration_due ? b.calibration_due + 'T00:00:00Z' : null;
          if (!b.device_key) delete b.device_key;
          if (!form.data.id) b.metrics = null;
          let r;
          if (form.data.id) r = await CT.api.put(`/devices/${form.data.id}`, b); else { r = await CT.api.post('/devices', b); if (r.api_key) { keyShown.value = r.api_key; } }
          CT.toast('已保存' + (r.api_key ? '，请妥善保存接入密钥' : ''), 'ok'); form.show = false; await load(); await store.loadTree();
          if (!form.data.id && r.id) open(r);
        } finally { form.busy = false; }
      });
      const rotate = async () => { if (!(await CT.confirm('轮换接入密钥', '旧密钥将立即失效，设备需使用新密钥重新接入。确定轮换？', { okText: '轮换' }))) return; await CT.load(async () => { const r = await CT.api.post(`/devices/${detail.value.id}/rotate-key`); keyShown.value = r.api_key; CT.toast('已生成新密钥', 'ok'); }); };
      const remove = async (d) => { if (!(await CT.confirm('删除设备', `确定删除「${d.name}」及其全部遥测数据？`, { danger: true, okText: '删除' }))) return; await CT.load(async () => { await CT.api.del(`/devices/${d.id}`); CT.toast('已删除', 'ok'); detail.value = null; await load(); await store.loadTree(); }); };
      const copy = async (t) => { CT.toast((await CT.copy(t)) ? '已复制' : '复制失败，请手动选择文本', 'ok'); };
      const calClass = (d) => { if (!d.calibration_due) return ''; const days = (new Date(d.calibration_due) - Date.now()) / 86400000; return days < 0 ? 'tag-critical' : days < 30 ? 'tag-warning' : 'tag-neutral'; };
      const latestText = (d) => Object.entries(d.latest || {}).slice(0, 3).map(([m, v]) => `${metricLabel(m)} ${latestText2(m, v)}`).join(' · ');
      return { store, data, f, types, metrics, metricLabel, detail, readings, open, chartFor, form, edit, save, rotate, remove, keyShown, copy, calClass, latestText, latestText2, sources, CT };
    },
    template: `
    <div class="stack">
      <div class="tiles">
        <ct-tile label="设备总数" :value="String(data.summary.total || 0)" :sub="store.nodeName()"></ct-tile>
        <ct-tile label="在线" :value="String(data.summary.online || 0)"></ct-tile>
        <ct-tile label="离线" :value="String(data.summary.offline || 0)" :sub="data.summary.offline ? '需现场检查' : ''"></ct-tile>
        <ct-tile label="故障 / 检修" :value="(data.summary.fault || 0) + ' / ' + (data.summary.maintenance || 0)"></ct-tile>
      </div>
      <div class="card">
        <div class="card-b"><div class="toolbar">
          <input class="input" v-model="f.q" placeholder="搜索名称 / 标识 / 型号" style="width:220px">
          <select class="select" v-model="f.status"><option value="">全部状态</option><option v-for="(l,k) in CT.labels.deviceStatus" :key="k" :value="k">{{ l }}</option></select>
          <select class="select" v-model="f.device_type"><option value="">全部类型</option><option v-for="(t,k) in types" :key="k" :value="k">{{ t.label }}</option></select>
          <span class="spacer"></span>
          <a class="btn" href="#settings" style="text-decoration:none">接入说明</a>
          <button class="btn btn-primary" v-if="store.can('operator')" @click="edit(null)">新增设备</button>
        </div></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>状态</th><th>设备</th><th>类型 / 协议</th><th>绑定排放源</th><th>位置</th><th>最新数据</th><th>最后上报</th><th>校准到期</th></tr></thead>
          <tbody>
            <tr v-if="!data.items.length"><td colspan="8" class="empty">没有符合条件的设备</td></tr>
            <tr v-for="d in data.items" :key="d.id" class="clickable" :class="{selected: detail && detail.id === d.id}" @click="open(d)">
              <td><ct-tag dict="deviceStatus" :value="d.status" dot></ct-tag></td>
              <td><strong>{{ d.name }}</strong><div class="sub mono">{{ d.device_key }} · {{ d.model || '' }}</div></td>
              <td class="small">{{ (types[d.device_type] || {}).label || d.device_type }}<div class="sub">{{ d.protocol }} · {{ d.sampling_interval_s }}s</div></td>
              <td class="small">{{ d.source_name || '—' }}<div class="sub">{{ d.unit_name }}</div></td>
              <td class="small muted">{{ d.location }}</td>
              <td class="small num">{{ latestText(d) || '—' }}</td>
              <td class="small nowrap">{{ CT.fmt.ago(d.last_seen_at) }}</td>
              <td><span class="tag" :class="calClass(d)">{{ CT.fmt.date(d.calibration_due) }}</span></td>
            </tr>
          </tbody></table></div></div>
      </div>

      <ct-drawer :show="!!detail" :title="detail ? detail.name : ''" :sub="detail ? detail.device_key + ' · ' + ((types[detail.device_type]||{}).label || '') : ''" @close="detail=null">
        <template #tools><button class="btn btn-sm" v-if="store.can('operator')" @click="edit(detail)">编辑</button><button class="btn btn-sm btn-ghost" style="color:var(--critical)" v-if="store.can()" @click="remove(detail)">删除</button></template>
        <div v-if="detail" class="stack">
          <div class="flex wrap"><ct-tag dict="deviceStatus" :value="detail.status" dot></ct-tag><span class="small muted">最后上报 {{ CT.fmt.dt(detail.last_seen_at) }}（{{ CT.fmt.ago(detail.last_seen_at) }}）</span></div>
          <dl class="kv">
            <dt>型号 / 厂商</dt><dd>{{ detail.model || '—' }} · {{ detail.vendor || '—' }}</dd>
            <dt>协议 / 采样</dt><dd>{{ detail.protocol }} · 每 {{ detail.sampling_interval_s }} 秒</dd>
            <dt>绑定排放源</dt><dd>{{ detail.source_name || '未绑定' }}（{{ detail.unit_name }}）</dd>
            <dt>安装位置</dt><dd>{{ detail.location || '—' }}</dd>
            <dt>固件</dt><dd>{{ detail.firmware || '—' }}</dd>
            <dt>安装 / 校准到期</dt><dd>{{ CT.fmt.date(detail.install_date) }} / <span class="tag" :class="calClass(detail)">{{ CT.fmt.date(detail.calibration_due) }}</span></dd>
            <dt>指标</dt><dd>{{ (detail.metrics || []).map(metricLabel).join('、') || '—' }}</dd>
          </dl>
          <div>
            <div class="flex between mb"><strong>近 24 小时曲线</strong><span class="small muted">{{ readings ? Object.values(readings.series).reduce((s,a)=>s+a.length,0) : 0 }} 个采样点</span></div>
            <div v-for="m in detail.metrics" :key="m"><div class="small muted">{{ metricLabel(m) }} · 最新 <strong class="num">{{ detail.latest[m] ? latestText2(m, detail.latest[m]) : '—' }}</strong><span v-if="(metrics[m]||{}).kind === 'interval'">（按小时速率）</span></div><ct-chart :option="chartFor(m)" height="140px"></ct-chart></div>
          </div>
          <div v-if="store.can()">
            <div class="flex between mb"><strong>接入凭证</strong><button class="btn btn-sm" @click="rotate">轮换密钥</button></div>
            <div class="pre mono">X-Device-Key: {{ detail.device_key }}
X-Api-Key: {{ keyShown || detail.api_key || '（已隐藏，轮换后显示）' }}</div>
            <div class="small muted mt">HTTP 示例：POST /api/ingest/readings</div>
            <div class="pre mono">{{ JSON.stringify(detail.ingest_example.http.body, null, 2) }}</div>
            <div class="small muted mt">MQTT 主题：<code>{{ detail.ingest_example.mqtt.topic }}</code> <button class="btn btn-sm btn-ghost" @click="copy(detail.ingest_example.mqtt.topic)">复制</button></div>
          </div>
        </div>
      </ct-drawer>

      <ct-modal :show="form.show" :title="form.data && form.data.id ? '编辑设备' : '新增设备'" :busy="form.busy" @close="form.show=false" @ok="save" lg>
        <div v-if="form.data" class="form">
          <div class="field"><label>设备名称</label><input class="input" v-model="form.data.name"></div>
          <div class="field"><label>设备标识（device_key）</label><input class="input mono" v-model="form.data.device_key" :disabled="!!form.data.id" placeholder="留空自动生成"></div>
          <div class="field"><label>设备类型</label><select class="select" v-model="form.data.device_type" :disabled="!!form.data.id"><option v-for="(t,k) in types" :key="k" :value="k">{{ t.label }}</option></select><div class="hint">指标：{{ ((types[form.data.device_type]||{}).metrics||[]).map(metricLabel).join('、') || '网关无指标' }}</div></div>
          <div class="field"><label>通讯协议</label><select class="select" v-model="form.data.protocol"><option v-for="p in (store.dict('protocols') || [])" :key="p" :value="p">{{ p }}</option></select></div>
          <div class="field"><label>型号</label><input class="input" v-model="form.data.model"></div>
          <div class="field"><label>厂商</label><input class="input" v-model="form.data.vendor"></div>
          <div class="field"><label>所属车间/装置</label><select class="select" v-model="form.data.org_node_id"><option v-for="u in store.units()" :key="u.id" :value="u.id">{{ (store.siteOf(u.id)||{}).name }} / {{ u.name }}</option></select></div>
          <div class="field"><label>绑定排放源</label><select class="select" v-model="form.data.source_id"><option :value="null">不绑定（网关）</option><option v-for="s in sources" :key="s.id" :value="s.id">{{ s.site_name }} / {{ s.name }}</option></select></div>
          <div class="field"><label>采样周期（秒）</label><input class="input" type="number" v-model.number="form.data.sampling_interval_s"></div>
          <div class="field"><label>状态</label><select class="select" v-model="form.data.status"><option v-for="(l,k) in CT.labels.deviceStatus" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field"><label>安装日期</label><input class="input" type="date" v-model="form.data.install_date"></div>
          <div class="field"><label>校准到期</label><input class="input" type="date" v-model="form.data.calibration_due"></div>
          <div class="field"><label>固件版本</label><input class="input" v-model="form.data.firmware"></div>
          <div class="field"><label>安装位置</label><input class="input" v-model="form.data.location"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
