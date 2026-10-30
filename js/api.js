/* HTTP 客户端：鉴权令牌、错误处理、演示模式切换、WebSocket 订阅 */
(function (CT) {
  const cfg = window.APP_CONFIG || {};
  const BASE = cfg.apiBase || '/api';
  const TOKEN_KEY = 'ct_token';
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }

  const api = {
    get demo() { return !!cfg.demoMode; },
    get token() { return token; },
    setToken(t) {
      token = t;
      try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 私密模式等 */ }
    },
    async request(method, path, body, opts = {}) {
      if (cfg.demoMode) return CT.demo.request(method, path, body);
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      let res;
      try {
        res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      } catch (e) {
        throw new Error('无法连接后端服务（' + e.message + '）');
      }
      if (res.status === 401 && !opts.noAuthRedirect) {
        api.setToken(null);
        CT.bus && CT.bus.emit('unauthorized');
        throw new Error('未登录或登录已过期');
      }
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) {
        const msg = (data && data.detail) ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : ('请求失败 ' + res.status);
        throw new Error(msg);
      }
      return data;
    },
    get(path) { return api.request('GET', path); },
    post(path, body) { return api.request('POST', path, body || {}); },
    put(path, body) { return api.request('PUT', path, body || {}); },
    del(path) { return api.request('DELETE', path); },
    qs(params) {
      const p = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v));
      return p.length ? '?' + p.join('&') : '';
    },
    downloadUrl(path) {
      if (cfg.demoMode) return null;
      return BASE + path + (token ? (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) : '');
    },
    /* 实时订阅：WebSocket，失败时由页面轮询兜底 */
    subscribe(handler) {
      if (cfg.demoMode) return CT.demo.subscribe(handler);
      let ws = null, closed = false, timer = null;
      const connect = () => {
        const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
        const url = (cfg.wsBase || (proto + location.host)) + '/api/ws/realtime';
        try { ws = new WebSocket(url); } catch (e) { handler({ type: '_status', connected: false }); return; }
        ws.onopen = () => { handler({ type: '_status', connected: true }); timer = setInterval(() => { try { ws.send('ping'); } catch (e) {} }, 25000); };
        ws.onmessage = (ev) => { try { handler(JSON.parse(ev.data)); } catch (e) {} };
        ws.onclose = () => { clearInterval(timer); handler({ type: '_status', connected: false }); if (!closed) setTimeout(connect, 4000); };
        ws.onerror = () => { try { ws.close(); } catch (e) {} };
      };
      connect();
      return () => { closed = true; clearInterval(timer); try { ws && ws.close(); } catch (e) {} };
    },
  };
  CT.api = api;

  /* 全局实时订阅：整个应用只保持一条 WebSocket，事件通过 CT.bus('rt') 分发 */
  let rtStop = null;
  CT.realtime = {
    start() {
      if (rtStop) return;
      rtStop = api.subscribe((ev) => {
        if (ev.type === '_status') { CT.store.wsConnected = ev.connected; }
        else if (ev.type === 'alert') { CT.toast('新告警：' + ev.alert.title, 'err', 6000); CT.store.openAlerts++; }
        else if (ev.type === 'alert_resolved') { CT.store.openAlerts = Math.max(0, CT.store.openAlerts - 1); }
        CT.bus.emit('rt', ev);
      });
    },
    stop() { if (rtStop) { rtStop(); rtStop = null; } CT.store.wsConnected = false; },
  };

  /* 简单事件总线 */
  const handlers = {};
  CT.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => CT.bus.off(ev, fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev, payload) { (handlers[ev] || []).forEach((f) => { try { f(payload); } catch (e) { console.error(e); } }); },
  };
})(window.CT);
