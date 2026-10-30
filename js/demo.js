/* 演示模式适配器：无后端时，用导出的 API 快照响应请求，并在浏览器内模拟实时数据与常用操作。
   快照由 tools/export_snapshot.py 从真实后端导出（data/snapshot.json）。 */
(function (CT) {
  let snap = null;
  let loading = null;
  const state = { alertSeq: 100000, idSeq: 900000, latest: {} };

  const parse = (path) => { const [p, q] = path.split('?'); const params = {}; (q || '').split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); }); return { p, params }; };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- 时间平移：把快照里的时间整体搬到“现在”，保证任何时候打开都像在实时运行 ---------- */
  const TZ = 'Asia/Shanghai';
  const localParts = (ms) => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const o = {}; f.formatToParts(new Date(ms)).forEach((x) => { o[x.type] = x.value; });
    return { date: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` };
  };
  const dayOf = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const addDays = (ymd, n) => new Date(dayOf(ymd) + n * 86400000).toISOString().slice(0, 10);
  const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const RE_HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;
  const RE_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const RE_INLINE = /(\d{4}-\d{2}-\d{2})( \d{2}:\d{2})?/g;
  const shiftSnapshot = (s) => {
    const meta = s['GET /meta'];
    const exported = meta && meta.server_time ? Date.parse(meta.server_time) : NaN;
    if (!exported) return s;
    const now = Date.now();
    const deltaMs = now - exported;
    if (deltaMs < 10 * 60 * 1000) return s;                       // 刚导出的快照无需平移
    const dayDelta = Math.round((dayOf(localParts(now).date) - dayOf(localParts(exported).date)) / 86400000);
    const shiftStr = (v) => {
      if (RE_ISO.test(v)) return new Date(Date.parse(v) + deltaMs).toISOString().slice(0, 19) + 'Z';
      if (RE_HOUR.test(v)) { const t = Date.parse(v + ':00+08:00') + deltaMs; const p = localParts(t); return `${p.date}T${p.hm.slice(0, 2)}:00`; }
      if (RE_DAY.test(v)) return addDays(v, dayDelta);
      if (v.length > 10 && /\d{4}-\d{2}-\d{2}/.test(v)) return v.replace(RE_INLINE, (m, d, hm) => addDays(d, dayDelta) + (hm || ''));
      return v;
    };
    // 这些字段是“历史事实”（因子有效期、安装日期、项目周期、交易日、台账期间），不随打开时间平移
    const KEEP = new Set(['valid_from', 'valid_to', 'install_date', 'start_date', 'end_date', 'trade_date', 'period_start', 'period_end', 'baseline_year']);
    const walk = (x) => {
      if (typeof x === 'string') return shiftStr(x);
      if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = walk(x[i]); return x; }
      if (x && typeof x === 'object') { for (const k of Object.keys(x)) { if (KEEP.has(k)) continue; if (k === 'period' && typeof x[k] === 'string' && x[k].length <= 7) continue; x[k] = walk(x[k]); } return x; }
      return x;
    };
    walk(s);
    s.__shifted = { deltaMs, dayDelta };
    return s;
  };

  const ensure = async () => {
    if (snap) return snap;
    if (!loading) {
      const src = window.__SNAPSHOT__ ? Promise.resolve(window.__SNAPSHOT__) : fetch('data/snapshot.json').then((r) => r.json());
      loading = src.then((j) => { snap = shiftSnapshot(j); index(); return snap; });
    }
    return loading;
  };
  let byPath = {};
  const index = () => { byPath = {}; Object.keys(snap).forEach((k) => { const { p, params } = parse(k.replace(/^GET /, '')); (byPath[p] = byPath[p] || []).push({ key: k, params }); }); };

  /* 查找最匹配的快照项：同路径下按匹配的查询参数数量打分 */
  const find = (path) => {
    const { p, params } = parse(path);
    const exact = snap['GET ' + path];
    if (exact !== undefined) return clone(exact);
    const cands = byPath[p] || [];
    if (!cands.length) return undefined;
    let best = null, bestScore = -Infinity;
    for (const c of cands) {
      let score = 0;
      for (const [k, v] of Object.entries(params)) { if (c.params[k] === v) score += 2; else if (c.params[k] !== undefined) score -= 1; }
      for (const k of Object.keys(c.params)) if (params[k] === undefined) score -= 0.5;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best ? clone(snap[best.key]) : undefined;
  };
  const set = (path, val) => { snap['GET ' + path] = val; index(); };
  const allKeys = (prefix) => Object.keys(snap).filter((k) => k.startsWith('GET ' + prefix));
  const patchAll = (prefix, fn) => { allKeys(prefix).forEach((k) => { const v = fn(snap[k], k); if (v !== undefined) snap[k] = v; }); };

  /* ------------------------------------------------------------ 变更操作（内存） */
  const mutate = (method, path, body) => {
    const { p } = parse(path);
    let m;
    if (p === '/auth/login') return { token: 'demo', user: { id: 1, username: body.username || 'demo', display_name: body.username === 'admin' ? '系统管理员' : (body.username || '演示用户'), role: body.username === 'operator' ? 'operator' : body.username === 'auditor' ? 'auditor' : body.username === 'viewer' ? 'viewer' : 'admin' } };
    if (p === '/auth/logout') return { ok: true };
    if ((m = p.match(/^\/alerts\/(\d+)\/(ack|resolve)$/))) {
      const id = +m[1], now = CT.nowIso();
      patchAll('/alerts?', (v) => { (v.items || []).forEach((a) => { if (a.id === id) { if (m[2] === 'ack') { a.status = 'acknowledged'; a.acknowledged_at = now; a.acknowledged_by = 'admin'; } else { a.status = 'resolved'; a.resolved_at = now; a.resolved_by = 'admin'; a.resolution_note = body.note || a.resolution_note; } } }); return v; });
      patchAll('/alerts/stats', (v) => { if (m[2] === 'ack') { v.open = Math.max(0, v.open - 1); v.acknowledged += 1; } else { v.acknowledged = Math.max(0, v.acknowledged - (v.open ? 0 : 1)); v.open = Math.max(0, v.open - 1); v.resolved_24h += 1; } return v; });
      patchAll('/dashboard/overview', (v) => { v.alerts.latest = v.alerts.latest.filter((a) => a.id !== id); if (m[2] === 'ack') { v.alerts.open = Math.max(0, v.alerts.open - 1); v.alerts.acknowledged += 1; } else { v.alerts.open = Math.max(0, v.alerts.open - 1); } return v; });
      return { ok: true };
    }
    if (p === '/alerts/evaluate') return { rules: 6, new_alerts: 0 };
    if ((m = p.match(/^\/alert-rules\/(\d+)\/toggle$/))) { patchAll('/alert-rules', (v) => { v.items.forEach((r) => { if (r.id === +m[1]) r.enabled = !r.enabled; }); return v; }); return { ok: true }; }
    if ((m = p.match(/^\/alert-rules\/(\d+)$/))) { if (method === 'DELETE') { patchAll('/alert-rules', (v) => { v.items = v.items.filter((r) => r.id !== +m[1]); return v; }); return { ok: true }; } patchAll('/alert-rules', (v) => { v.items.forEach((r, i) => { if (r.id === +m[1]) v.items[i] = Object.assign({}, r, body); }); return v; }); return body; }
    if (p === '/alert-rules') { const r = Object.assign({ id: ++state.idSeq, active_alerts: 0, rule_type_label: CT.label('ruleType', body.rule_type), created_at: CT.nowIso() }, body); patchAll('/alert-rules', (v) => { v.items.push(r); return v; }); return r; }
    if (p === '/settings') { patchAll('/settings', (v) => { v.items.forEach((s) => { if (body.values[s.key] !== undefined) s.value = body.values[s.key]; }); return v; }); return find('/settings'); }
    if (p === '/activity-entries') { const e = Object.assign({ id: ++state.idSeq, status: 'draft', entered_by: 'admin', created_at: CT.nowIso(), source_name: '（新录入）', activity_label: body.activity_type }, body); patchAll('/activity-entries', (v) => { v.items.unshift(e); return v; }); return e; }
    if ((m = p.match(/^\/activity-entries\/(\d+)\/confirm$/))) { let co2 = 0; patchAll('/activity-entries', (v) => { v.items.forEach((e) => { if (e.id === +m[1]) { e.status = 'confirmed'; co2 = e.value * 0.418; } }); return v; }); return { ok: true, records: 1, co2e_t: co2 }; }
    if ((m = p.match(/^\/activity-entries\/(\d+)$/))) { patchAll('/activity-entries', (v) => { v.items = v.items.filter((e) => e.id !== +m[1]); return v; }); return { ok: true }; }
    if (p === '/emissions/recalculate') return { records: 2184, sources: 13 };
    if (p === '/reports/generate') { const base = (find('/reports') || { items: [] }).items[0]; const node = (CT.store.nodes || []).find((n) => n.id === body.org_node_id) || { name: '全集团' }; const r = Object.assign(clone(find(`/reports/${base ? base.id : 1}`) || {}), { id: ++state.idSeq, title: `${node.name} ${body.period}${body.report_type === 'monthly' ? '月度' : '年度'}温室气体排放报告`, report_type: body.report_type, period: body.period, status: 'draft', status_label: '草稿', generated_at: CT.nowIso(), generated_by: 'admin', org_name: node.name, verifier: null, submitted_at: null, next_status: ['internal_review'] }); set(`/reports/${r.id}`, r); patchAll('/reports', (v) => { v.items.unshift(Object.assign({}, r, { summary: undefined })); return v; }); return r; }
    if ((m = p.match(/^\/reports\/(\d+)\/status$/))) { const nx = { draft: ['internal_review'], internal_review: ['draft', 'verifying'], verifying: ['internal_review', 'submitted'], submitted: ['approved', 'verifying'], approved: [] }; const upd = (r) => { if (r && r.id === +m[1]) { r.status = body.status; r.status_label = CT.label('reportStatus', body.status); r.next_status = nx[body.status]; if (body.verifier) r.verifier = body.verifier; if (body.status === 'submitted') r.submitted_at = CT.nowIso(); } return r; }; patchAll('/reports', (v, k) => (k === 'GET /reports' ? (v.items.forEach(upd), v) : upd(v))); return find(`/reports/${m[1]}`); }
    if ((m = p.match(/^\/reports\/(\d+)$/)) && method === 'DELETE') { patchAll('/reports', (v, k) => (k === 'GET /reports' ? (v.items = v.items.filter((r) => r.id !== +m[1]), v) : v)); return { ok: true }; }
    // 通用集合：交易 / 配额 / 目标 / 项目 / 用户 / 设备 / 排放源 / 因子 / 组织节点
    const coll = { '/quota/transactions': ['/quota/transactions', 'trade_date'], '/quota/allowances': ['/quota/allowances'], '/targets': ['/targets'], '/projects': ['/projects'], '/users': ['/users'], '/devices': ['/devices'], '/sources': ['/sources'], '/factors': ['/factors'], '/org/nodes': ['/org/tree'] };
    for (const [prefix, [listPrefix]] of Object.entries(coll)) {
      if (p === prefix && method === 'POST') { const item = Object.assign({ id: ++state.idSeq, created_at: CT.nowIso(), site_name: ((CT.store.nodes || []).find((n) => n.id === body.site_id) || {}).name, org_name: ((CT.store.nodes || []).find((n) => n.id === body.org_node_id) || {}).name, device_key: body.device_key || ('DEV-' + state.idSeq), api_key: 'demo-key-' + state.idSeq, status: body.status || 'offline', latest: {}, devices: [], metrics: body.metrics || [], role_label: CT.label('role', body.role), is_active: true, emission_24h_t: 0, emission_mtd_t: 0, activity_label: body.activity_type, amount: (body.quantity_t || 0) * (body.price || 0) }, body); patchAll(listPrefix, (v) => { if (v.items) v.items.push(item); return v; }); if (prefix === '/devices') set(`/devices/${item.id}`, Object.assign({ ingest_example: { http: { body: { readings: [] } }, mqtt: { topic: `carbon/${item.device_key}/telemetry` } } }, item)); return item; }
      const mm = p.match(new RegExp('^' + prefix.replace(/\//g, '\\/') + '\\/(\\d+)$'));
      if (mm) { const id = +mm[1]; if (method === 'DELETE') { patchAll(listPrefix, (v) => { if (v.items) v.items = v.items.filter((x) => x.id !== id); return v; }); return { ok: true }; } patchAll(listPrefix, (v) => { if (v.items) v.items.forEach((x, i) => { if (x.id === id) v.items[i] = Object.assign({}, x, body); }); return v; }); return Object.assign({ id }, body); }
      if ((mm = p.match(new RegExp('^' + prefix.replace(/\//g, '\\/') + '\\/(\\d+)\\/rotate-key$')))) return { device_key: 'DEV', api_key: 'demo-rotated-' + Date.now() };
    }
    return { ok: true };
  };

  /* ------------------------------------------------------------ 请求入口 */
  CT.demo = {
    async request(method, path, body) {
      await ensure();
      await CT.sleep(60 + Math.random() * 120);
      if (method === 'GET') {
        const { p, params } = parse(path);
        let v = find(path);
        if (v === undefined) {
          if (p === '/auth/me') return { user: { id: 1, username: 'demo', display_name: '演示用户', role: 'admin' }, anonymous: false };
          console.warn('[demo] 无快照：', path);
          return { items: [], total: 0 };
        }
        // 设备读数：按 from 过滤，并追加浏览器内模拟的新点
        if (/^\/devices\/\d+\/readings$/.test(p)) {
          const id = +p.split('/')[2];
          const extra = state.latest[id] && state.latest[id].history;
          if (extra) for (const [mtr, pts] of Object.entries(extra)) { v.series[mtr] = (v.series[mtr] || []).concat(pts); }
          if (params.from) { const t = new Date(params.from).getTime(); for (const mtr of Object.keys(v.series)) v.series[mtr] = v.series[mtr].filter((x) => new Date(x[0]).getTime() >= t); }
        }
        if (p === '/monitor/realtime') { v.server_time = CT.nowIso(); v.sources.forEach((s) => { const l = state.latest['src' + s.id]; if (l) { s.rate_t_h = l.rate; s.today_t = l.today; } }); v.devices.forEach((d) => { const l = state.latest[d.id]; if (l) { d.latest = l.latest; d.last_seen_at = l.ts; } }); }
        if (p === '/meta') v.server_time = CT.nowIso();
        return v;
      }
      return mutate(method, path, body);
    },
    /* 浏览器内实时模拟：每 8 秒对在线设备做随机游走 */
    subscribe(handler) {
      let stopped = false;
      const tick = async () => {
        await ensure();
        const rt = find('/monitor/realtime');
        if (!rt) return;
        handler({ type: '_status', connected: true });
        const now = CT.nowIso();
        for (const d of rt.devices) {
          if (d.status !== 'online' || !d.metrics || !d.metrics.length) continue;
          const st = (state.latest[d.id] = state.latest[d.id] || { latest: clone(d.latest || {}), history: {}, ts: now });
          const points = [];
          for (const m of d.metrics) {
            const cur = st.latest[m] || d.latest[m];
            if (!cur) continue;
            const base = cur.value;
            const spec = (CT.store.dict('metrics') || {})[m] || {};
            let v = spec.kind === 'interval' ? base * (0.95 + Math.random() * 0.1) : base * (1 + (Math.random() - 0.5) * 0.03);
            v = Math.max(0, +v.toFixed(3));
            st.latest[m] = { ts: now, value: v, unit: cur.unit, quality: 'good' };
            (st.history[m] = st.history[m] || []).push([now, v]);
            if (st.history[m].length > 400) st.history[m].shift();
            points.push({ metric: m, ts: now, value: v, unit: cur.unit, quality: 'good' });
          }
          st.ts = now;
          if (points.length) handler({ type: 'readings', at: now, device_id: d.id, device_key: d.device_key, device_name: d.name, source_id: d.source_id, points });
        }
        rt.sources.forEach((s) => { const st = (state.latest['src' + s.id] = state.latest['src' + s.id] || { rate: s.rate_t_h, today: s.today_t }); if (st.rate !== null) { st.rate = +(st.rate * (1 + (Math.random() - 0.5) * 0.04)).toFixed(4); st.today = +(st.today + st.rate * 8 / 3600).toFixed(3); } });
      };
      tick();
      const timer = setInterval(() => { if (!stopped) tick(); }, 8000);
      return () => { stopped = true; clearInterval(timer); };
    },
  };
})(window.CT);
