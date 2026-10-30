/* 全局状态：登录用户、字典、组织树、当前范围、主题 */
(function (CT) {
  const { reactive } = Vue;
  const store = reactive({
    ready: false,
    user: null,
    meta: null,          // /api/meta 返回的字典
    tree: [],
    nodes: [],
    nodeId: null,        // 当前范围（组织节点 id，null = 全集团）
    wsConnected: false,
    theme: 'system',
    loading: 0,
    openAlerts: 0,
    serverTime: null,
    error: null,
  });

  store.node = () => store.nodes.find((n) => n.id === store.nodeId) || null;
  store.nodeName = () => { const n = store.node(); return n ? n.name : '全集团'; };
  store.isGroup = () => { const n = store.node(); return !n || n.level === 'group'; };
  store.siteOf = (nodeId) => {
    let n = store.nodes.find((x) => x.id === nodeId);
    while (n && n.level === 'unit') n = store.nodes.find((x) => x.id === n.parent_id);
    return n;
  };
  store.sites = () => store.nodes.filter((n) => n.level === 'site');
  store.units = () => store.nodes.filter((n) => n.level === 'unit');
  store.dict = (key) => (store.meta && store.meta.dict && store.meta.dict[key]) || {};
  store.can = (...roles) => { const r = store.user && store.user.role; return !r || r === 'admin' || roles.includes(r); };

  store.loadMeta = async () => {
    store.meta = await CT.api.get('/meta');
    store.openAlerts = store.meta.counts ? store.meta.counts.open_alerts : 0;
    store.serverTime = store.meta.server_time;
  };
  store.loadTree = async () => {
    const r = await CT.api.get('/org/tree');
    store.tree = r.tree;
    store.nodes = r.nodes;
    if (store.nodeId === null && store.tree.length) store.nodeId = store.tree[0].id;
  };
  store.init = async () => {
    await Promise.all([store.loadMeta(), store.loadTree()]);
    store.ready = true;
  };

  /* 主题 */
  const applyTheme = (t) => {
    const root = document.documentElement;
    if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    store.theme = t;
    try { localStorage.setItem('ct_theme', t); } catch (e) {}
    setTimeout(() => CT.bus.emit('theme', t), 30);
  };
  store.setTheme = applyTheme;
  store.cycleTheme = () => applyTheme(store.theme === 'system' ? 'dark' : store.theme === 'dark' ? 'light' : 'system');
  try { const saved = localStorage.getItem('ct_theme'); if (saved && saved !== 'system') applyTheme(saved); } catch (e) {}
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (store.theme === 'system') CT.bus.emit('theme', 'system'); });
  }
  new MutationObserver(() => CT.bus.emit('theme', document.documentElement.getAttribute('data-theme') || 'system')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  CT.store = store;

  /* 异步加载包装：统一 loading 与错误提示 */
  CT.load = async (fn, { silent } = {}) => {
    store.loading++;
    try { return await fn(); }
    catch (e) { if (!silent) CT.toast(e.message || String(e), 'err', 4000); console.error(e); return null; }
    finally { store.loading--; }
  };
})(window.CT);
