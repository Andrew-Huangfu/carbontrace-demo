/* 系统设置：参数、接入、用户与角色、审计日志、关于 */
(function (CT) {
  const { ref, reactive, computed, onMounted, watch } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.settings = {
    name: 'page-settings',
    title: '系统设置',
    setup() {
      const store = CT.store;
      const tab = ref('params');
      const settings = ref([]);
      const vals = reactive({});
      const users = ref({ items: [], roles: {} });
      const audit = ref({ items: [], total: 0, page: 1 });
      const uForm = reactive({ show: false, busy: false, data: null });
      const spec = ref(null);
      const busy = ref(false);
      const load = () => CT.load(async () => {
        settings.value = (await CT.api.get('/settings')).items;
        settings.value.forEach((s) => { vals[s.key] = typeof s.value === 'object' && s.value !== null ? JSON.parse(JSON.stringify(s.value)) : s.value; });
        spec.value = await CT.api.get('/ingest/spec');
        if (store.can('auditor')) { users.value = await CT.api.get('/users'); await loadAudit(1); }
      });
      const loadAudit = (page) => CT.load(async () => { audit.value = await CT.api.get('/audit-log' + CT.api.qs({ page, page_size: 30 })); });
      onMounted(load);
      const save = () => CT.load(async () => { busy.value = true; try { const body = {}; ['carbon_price_cny', 'gwp_set', 'heartbeat_timeout_min', 'data_retention_days', 'report_org_name', 'webhook_url', 'mqtt', 'notification'].forEach((k) => { if (vals[k] !== undefined) body[k] = vals[k]; }); body.carbon_price_cny = Number(body.carbon_price_cny); body.heartbeat_timeout_min = Number(body.heartbeat_timeout_min); await CT.api.put('/settings', { values: body }); CT.toast('设置已保存', 'ok'); await load(); } finally { busy.value = false; } });
      const editUser = (u) => { uForm.data = u ? { id: u.id, username: u.username, display_name: u.display_name, password: '', role: u.role, org_node_id: u.org_node_id, email: u.email, phone: u.phone, is_active: u.is_active } : { username: '', display_name: '', password: '', role: 'viewer', org_node_id: null, email: '', phone: '', is_active: true }; uForm.show = true; };
      const saveUser = () => CT.load(async () => { uForm.busy = true; try { const b = Object.assign({}, uForm.data); delete b.id; if (!b.password) b.password = null; if (uForm.data.id) await CT.api.put(`/users/${uForm.data.id}`, b); else await CT.api.post('/users', b); CT.toast('用户已保存', 'ok'); uForm.show = false; users.value = await CT.api.get('/users'); } finally { uForm.busy = false; } });
      const gwpSets = computed(() => store.dict('gwp_sets'));
      const meta = computed(() => store.meta || {});
      return { store, tab, settings, vals, save, busy, users, audit, loadAudit, uForm, editUser, saveUser, spec, gwpSets, meta, CT };
    },
    template: `
    <div class="card">
      <div class="tabs"><button :class="{active: tab==='params'}" @click="tab='params'">核算与告警参数</button><button :class="{active: tab==='ingest'}" @click="tab='ingest'">设备接入</button><button :class="{active: tab==='users'}" @click="tab='users'" v-if="store.can('auditor')">用户与角色</button><button :class="{active: tab==='audit'}" @click="tab='audit'" v-if="store.can('auditor')">审计日志</button><button :class="{active: tab==='about'}" @click="tab='about'">关于</button></div>
      <div class="card-b" v-if="tab==='params'">
        <div class="form" style="max-width:860px">
          <div class="field"><label>碳价参考（元 / tCO₂e）</label><input class="input" type="number" step="0.01" v-model="vals.carbon_price_cny"><div class="hint">用于配额缺口成本敞口与盈余价值估算，可按全国碳市场最新成交价更新</div></div>
          <div class="field"><label>GWP 版本</label><select class="select" v-model="vals.gwp_set"><option v-for="(g,k) in gwpSets" :key="k" :value="k">{{ k }}（CH4={{ g.CH4 }} · N2O={{ g.N2O }}）</option></select><div class="hint">国内核算指南多采用 SAR（CH4=21，N2O=310）；切换后请重算历史期间</div></div>
          <div class="field"><label>设备心跳超时（分钟）</label><input class="input" type="number" v-model="vals.heartbeat_timeout_min"></div>
          <div class="field"><label>遥测数据保留（天）</label><input class="input" type="number" v-model="vals.data_retention_days"></div>
          <div class="field"><label>报告署名单位</label><input class="input" v-model="vals.report_org_name"></div>
          <div class="field"><label>告警 Webhook 地址</label><input class="input" v-model="vals.webhook_url" placeholder="https://…（企业微信 / 钉钉 / 自建）"></div>
          <div class="field full" v-if="vals.notification"><label>通知渠道</label><div class="flex wrap"><label class="checkbox"><input type="checkbox" v-model="vals.notification.email"> 邮件</label><label class="checkbox"><input type="checkbox" v-model="vals.notification.sms"> 短信</label><label class="checkbox"><input type="checkbox" v-model="vals.notification.webhook"> Webhook</label></div></div>
          <div class="field full"><button class="btn btn-primary" :disabled="busy || !store.can()" @click="save">保存设置</button></div>
        </div>
      </div>
      <div class="card-b" v-if="tab==='ingest'">
        <div class="stack" style="max-width:900px">
          <div class="notice">设备或边缘网关可通过 HTTP、MQTT 接入；Modbus/OPC-UA 设备由现场网关轮询后以同样格式上送。每台设备在「采集设备」中拥有唯一 <code>device_key</code> 与接入密钥。</div>
          <div class="form" v-if="vals.mqtt">
            <div class="field"><label>MQTT Broker</label><input class="input" v-model="vals.mqtt.broker" placeholder="mqtt.example.com"></div>
            <div class="field"><label>端口</label><input class="input" type="number" v-model.number="vals.mqtt.port"></div>
            <div class="field"><label>订阅主题</label><input class="input mono" v-model="vals.mqtt.topic"></div>
            <div class="field"><label>启用</label><ct-switch v-model="vals.mqtt.enabled"></ct-switch><div class="hint">后端需安装 paho-mqtt 并配置 MQTT_BROKER 环境变量</div></div>
            <div class="field full"><button class="btn btn-primary" :disabled="busy || !store.can()" @click="save">保存接入配置</button></div>
          </div>
          <div v-if="spec">
            <div class="small muted mb">HTTP 上报</div>
            <div class="pre mono">POST /api/ingest/readings
X-Device-Key: &lt;device_key&gt;
X-Api-Key: &lt;api_key&gt;
Content-Type: application/json

{{ JSON.stringify(spec.http.body, null, 2) }}</div>
            <div class="small muted mt mb">MQTT 上报</div>
            <div class="pre mono">topic: {{ spec.mqtt.topic }}
payload: {{ JSON.stringify(spec.mqtt.payload, null, 2) }}</div>
            <div class="small muted mt mb">指标规范（服务端校验区间）</div>
            <div class="table-wrap"><table class="tbl"><thead><tr><th>指标</th><th>说明</th><th>单位</th><th class="num">下限</th><th class="num">上限</th><th>类型</th></tr></thead>
              <tbody><tr v-for="(m,k) in spec.metrics" :key="k"><td class="mono">{{ k }}</td><td>{{ m.label }}</td><td>{{ m.unit }}</td><td class="num">{{ m.min }}</td><td class="num">{{ m.max }}</td><td class="small">{{ m.kind === 'interval' ? '区间消耗量' : '瞬时值' }}</td></tr></tbody></table></div>
            <ul class="small muted"><li v-for="n in spec.notes" :key="n">{{ n }}</li></ul>
          </div>
        </div>
      </div>
      <template v-if="tab==='users'">
        <div class="card-b"><div class="toolbar"><span class="small muted">角色：管理员（全部）· 运行工程师（监测/设备/告警处理/台账）· 核查审计（核算/报告/审计）· 只读</span><span class="spacer"></span><button class="btn btn-primary" v-if="store.can()" @click="editUser(null)">新增用户</button></div></div>
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>所属</th><th>邮箱 / 电话</th><th>状态</th><th>最近登录</th><th></th></tr></thead>
          <tbody><tr v-for="u in users.items" :key="u.id"><td class="mono">{{ u.username }}</td><td>{{ u.display_name }}</td><td><ct-tag :text="u.role_label"></ct-tag></td><td class="small">{{ u.org_name || '全集团' }}</td><td class="small">{{ u.email || '—' }}<div class="sub">{{ u.phone }}</div></td><td><ct-tag :dict="u.is_active ? 'deviceStatus' : null" :value="u.is_active ? 'online' : ''" :text="u.is_active ? '启用' : '停用'"></ct-tag></td><td class="small num">{{ CT.fmt.dt(u.last_login_at) }}</td><td><button class="btn btn-sm btn-ghost" v-if="store.can()" @click="editUser(u)">编辑</button></td></tr></tbody></table></div></div>
      </template>
      <template v-if="tab==='audit'">
        <div class="card-b flush"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>时间</th><th>用户</th><th>操作</th><th>对象</th><th>详情</th><th>IP</th></tr></thead>
          <tbody><tr v-for="a in audit.items" :key="a.id"><td class="num nowrap">{{ CT.fmt.dt(a.ts) }}</td><td class="mono">{{ a.user }}</td><td><ct-tag :text="a.action"></ct-tag></td><td class="small">{{ a.target_type || '' }} {{ a.target_id || '' }}</td><td class="mono small" style="max-width:420px;white-space:normal;word-break:break-all">{{ JSON.stringify(a.detail) }}</td><td class="small muted">{{ a.ip || '' }}</td></tr></tbody></table></div>
          <ct-pager :page="audit.page" :total="audit.total" :page-size="30" @change="loadAudit"></ct-pager></div>
      </template>
      <div class="card-b" v-if="tab==='about'">
        <dl class="kv" style="max-width:720px">
          <dt>平台</dt><dd>{{ meta.app }} v{{ meta.version }}</dd>
          <dt>服务器时间</dt><dd>{{ CT.fmt.dt(meta.server_time) }}（{{ meta.tz }}）</dd>
          <dt>数据规模</dt><dd v-if="meta.counts">{{ meta.counts.devices }} 台设备 · {{ meta.counts.sources }} 个排放源 · {{ CT.fmt.num(meta.counts.readings) }} 条遥测 · {{ CT.fmt.num(meta.counts.records) }} 条核算记录</dd>
          <dt>运行模式</dt><dd>{{ CT.api.demo ? '演示模式（内置快照 + 本地模拟）' : (meta.simulator ? '内置设备模拟器运行中' : '生产模式') }}</dd>
          <dt>API 文档</dt><dd><a href="/api/docs" target="_blank" v-if="!CT.api.demo">/api/docs（OpenAPI）</a><span v-else class="muted">本地运行后端后访问 /api/docs</span></dd>
          <dt>技术栈</dt><dd>FastAPI · SQLAlchemy（SQLite / PostgreSQL）· WebSocket · Vue 3 · ECharts</dd>
        </dl>
      </div>
      <ct-modal :show="uForm.show" :title="uForm.data && uForm.data.id ? '编辑用户' : '新增用户'" :busy="uForm.busy" @close="uForm.show=false" @ok="saveUser">
        <div v-if="uForm.data" class="form">
          <div class="field"><label>用户名</label><input class="input mono" v-model="uForm.data.username" :disabled="!!uForm.data.id"></div>
          <div class="field"><label>姓名</label><input class="input" v-model="uForm.data.display_name"></div>
          <div class="field"><label>{{ uForm.data.id ? '新密码（留空不改）' : '初始密码' }}</label><input class="input" type="password" v-model="uForm.data.password" autocomplete="new-password"></div>
          <div class="field"><label>角色</label><select class="select" v-model="uForm.data.role"><option v-for="(l,k) in CT.labels.role" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="field"><label>所属组织</label><select class="select" v-model="uForm.data.org_node_id"><option :value="null">全集团</option><option v-for="n in store.nodes.filter(n => n.level === 'site')" :key="n.id" :value="n.id">{{ n.name }}</option></select></div>
          <div class="field"><label>启用</label><ct-switch v-model="uForm.data.is_active"></ct-switch></div>
          <div class="field"><label>邮箱</label><input class="input" v-model="uForm.data.email"></div>
          <div class="field"><label>电话</label><input class="input" v-model="uForm.data.phone"></div>
        </div>
      </ct-modal>
    </div>`,
  };
})(window.CT);
