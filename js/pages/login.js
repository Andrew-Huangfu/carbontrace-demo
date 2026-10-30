/* 登录 */
(function (CT) {
  const { reactive } = Vue;
  CT.pages = CT.pages || {};
  CT.pages.login = {
    name: 'page-login',
    title: '登录',
    emits: ['done'],
    setup(props, { emit }) {
      const f = reactive({ username: 'admin', password: 'admin123', busy: false, error: '' });
      const submit = async () => {
        f.busy = true; f.error = '';
        try {
          const r = await CT.api.request('POST', '/auth/login', { username: f.username, password: f.password }, { noAuthRedirect: true });
          CT.api.setToken(r.token);
          CT.store.user = r.user;
          emit('done');
        } catch (e) { f.error = e.message; }
        finally { f.busy = false; }
      };
      return { f, submit, demo: CT.api.demo };
    },
    template: `
    <div class="login-wrap"><form class="login-card" @submit.prevent="submit">
      <div class="brand"><div class="logo">C</div><div><div class="name" style="color:var(--fg)">碳迹 CarbonTrace</div><div class="sub">碳排放监测管理平台</div></div></div>
      <div v-if="demo" class="notice">演示模式：数据来自后端导出的快照并在浏览器内模拟实时变化，任意账号均可登录。</div>
      <div class="field"><label>用户名</label><input id="login-user" class="input" v-model="f.username" autocomplete="username"></div>
      <div class="field"><label>密码</label><input id="login-pass" class="input" type="password" v-model="f.password" autocomplete="current-password"></div>
      <div v-if="f.error" class="notice warn">{{ f.error }}</div>
      <button class="btn btn-primary" type="submit" :disabled="f.busy" style="justify-content:center;padding:9px">{{ f.busy ? '登录中…' : '登录' }}</button>
      <div class="small muted">演示账号：admin / admin123（管理员）· operator / op123456（运行）· auditor / audit123（核查）· viewer / view123（只读）</div>
    </form></div>`,
  };
})(window.CT);
