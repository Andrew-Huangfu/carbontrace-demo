/* 应用入口：布局、导航、路由（hash）、登录态 */
(function (CT) {
  const { createApp, ref, computed, onMounted, onBeforeUnmount } = Vue;
  const store = CT.store;

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>',
    realtime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
    sources: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V9l5-4v16M10 21V9l9-4v16"/></svg>',
    devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4V2m6 2V2M9 22v-2m6 2v-2M4 9H2m2 6H2m20-6h-2m2 6h-2"/><rect x="9" y="9" width="6" height="6"/></svg>',
    quality: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    accounting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    factors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5l8 7 8-7v14"/></svg>',
    quota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15"/></svg>',
    targets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };
  const NAV = [
    { group: '监测', items: [{ key: 'dashboard', label: '总览驾驶舱' }, { key: 'realtime', label: '实时监测' }, { key: 'alerts', label: '告警中心', badge: true }] },
    { group: '资产', items: [{ key: 'sources', label: '排放源与组织' }, { key: 'devices', label: '采集设备' }, { key: 'quality', label: '数据质量' }] },
    { group: '核算', items: [{ key: 'accounting', label: '碳核算' }, { key: 'factors', label: '排放因子库' }, { key: 'quota', label: '碳配额与资产' }, { key: 'targets', label: '减排目标与项目' }, { key: 'reports', label: '报告与合规' }] },
    { group: '系统', items: [{ key: 'settings', label: '系统设置' }] },
  ];
  const DEFAULT_PAGE = 'dashboard';

  const App = {
    setup() {
      const route = ref((location.hash || '').replace(/^#\/?/, '') || DEFAULT_PAGE);
      const authed = ref(!!CT.api.token || CT.api.demo);
      const menuOpen = ref(false);
      const clock = ref('');
      const onHash = () => { const r = (location.hash || '').replace(/^#\/?/, '') || DEFAULT_PAGE; route.value = CT.pages[r] ? r : DEFAULT_PAGE; menuOpen.value = false; window.scrollTo(0, 0); };
      let clockTimer = null;

      const boot = async () => {
        try {
          const me = await CT.api.request('GET', '/auth/me', undefined, { noAuthRedirect: true });
          store.user = me.user;
          authed.value = true;
        } catch (e) {
          if (CT.api.demo) { store.user = { username: 'demo', display_name: '演示用户', role: 'admin' }; authed.value = true; }
          else { authed.value = false; return; }
        }
        await store.init();
        CT.realtime.start();
      };
      onMounted(async () => {
        window.addEventListener('hashchange', onHash);
        onHash();
        CT.bus.on('unauthorized', () => { authed.value = false; });
        clockTimer = setInterval(() => { clock.value = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }, 1000);
        if (authed.value) await boot();
        else if (!CT.api.token && !CT.api.demo) {
          // 未登录：若后端未启用鉴权则直接进入
          try { await boot(); } catch (e) { /* 需要登录 */ }
        }
      });
      onBeforeUnmount(() => { window.removeEventListener('hashchange', onHash); clearInterval(clockTimer); });
      const onLogin = async () => { authed.value = true; await store.init(); CT.realtime.start(); };
      const logout = async () => { try { if (!CT.api.demo) await CT.api.post('/auth/logout'); } catch (e) {} CT.realtime.stop(); CT.api.setToken(null); store.user = null; store.ready = false; authed.value = false; };
      const page = computed(() => CT.pages[route.value] || CT.pages[DEFAULT_PAGE]);
      const title = computed(() => page.value.title);
      const themeLabel = computed(() => ({ system: '跟随系统', dark: '深色', light: '浅色' }[store.theme]));
      const go = (key) => { location.hash = key; };
      return { store, route, authed, page, title, NAV, ICONS, menuOpen, clock, onLogin, logout, themeLabel, go, demo: CT.api.demo };
    },
    template: `
    <page-login v-if="!authed" @done="onLogin"></page-login>
    <div v-else class="app">
      <div class="loading-bar" v-if="store.loading > 0"></div>
      <div v-if="menuOpen" class="sidebar-backdrop" @click="menuOpen = false"></div>
      <aside class="sidebar" :class="{open: menuOpen}">
        <div class="brand"><div class="logo">C</div><div><div class="name">碳迹 CarbonTrace</div><div class="sub">碳排放监测管理平台</div></div></div>
        <nav class="nav">
          <template v-for="g in NAV" :key="g.group">
            <div class="nav-group">{{ g.group }}</div>
            <a v-for="it in g.items" :key="it.key" class="nav-item" :class="{active: route === it.key}" :href="'#' + it.key" @click="menuOpen=false">
              <span v-html="ICONS[it.key]"></span><span>{{ it.label }}</span><span v-if="it.badge && store.openAlerts" class="badge">{{ store.openAlerts }}</span>
            </a>
          </template>
        </nav>
        <div class="sidebar-foot"><span class="dot" :class="{off: !store.wsConnected && !demo}"></span>{{ demo ? '演示模式 · 本地模拟' : (store.wsConnected ? '实时通道已连接' : '实时通道未连接（轮询）') }}<div v-if="store.meta">v{{ store.meta.version }} · {{ store.meta.tz }}</div></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn btn-ghost btn-icon menu-btn" @click="menuOpen = !menuOpen" aria-label="菜单"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
          <div><h1>{{ title }}</h1><div class="crumbs">{{ store.nodeName() }}</div></div>
          <ct-scope-select v-if="store.ready" :tree="store.tree" v-model="store.nodeId"></ct-scope-select>
          <span class="grow"></span>
          <span class="small muted num clock">{{ clock }} <span class="muted">(Asia/Shanghai)</span></span>
          <button class="btn btn-ghost btn-sm theme-btn" @click="store.cycleTheme()" :title="'主题：' + themeLabel">◐ <span>{{ themeLabel }}</span></button>
          <div class="flex" v-if="store.user"><span class="tag tag-accent user-tag">{{ store.user.display_name || store.user.username }} · {{ CT.label('role', store.user.role) }}</span><button class="btn btn-ghost btn-sm" @click="logout">退出</button></div>
        </header>
        <main class="content" v-if="store.ready"><component :is="page.name" :key="route"></component></main>
        <main class="content" v-else><div class="tiles"><div v-for="i in 4" :key="i" class="tile"><div class="skeleton" style="height:12px;width:40%"></div><div class="skeleton" style="height:28px;width:60%"></div></div></div></main>
      </div>
      <ct-toasts></ct-toasts><ct-confirm></ct-confirm>
    </div>`,
  };

  const app = createApp(App);
  app.config.globalProperties.CT = CT;
  CT.registerComponents(app);
  Object.values(CT.pages).forEach((p) => app.component(p.name, p));
  app.mount('#app');
})(window.CT);
