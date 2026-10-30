/* 通用工具：数字/时间格式化、字典标签、颜色读取 */
window.CT = window.CT || {};
(function (CT) {
  const TZ = 'Asia/Shanghai';

  CT.fmt = {
    num(v, digits = 0) {
      if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
      return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },
    t(v, digits = 1) { return CT.fmt.num(v, digits); },
    pct(v, digits = 1) {
      if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
      return (Number(v) * 100).toFixed(digits) + '%';
    },
    compact(v) {
      if (v === null || v === undefined) return '—';
      const n = Number(v);
      if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
      if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
      return CT.fmt.num(n, Math.abs(n) < 10 ? 2 : 0);
    },
    money(v) {
      if (v === null || v === undefined) return '—';
      const n = Number(v);
      if (Math.abs(n) >= 1e4) return '¥' + (n / 1e4).toFixed(1) + ' 万';
      return '¥' + CT.fmt.num(n, 0);
    },
    dt(iso, opts) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString('zh-CN', Object.assign({ timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }, opts || {}));
    },
    time(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleTimeString('zh-CN', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    hm(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleTimeString('zh-CN', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' });
    },
    date(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('zh-CN', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    },
    ago(iso) {
      if (!iso) return '从未';
      const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 60) return Math.round(s) + ' 秒前';
      if (s < 3600) return Math.round(s / 60) + ' 分钟前';
      if (s < 86400) return (s / 3600).toFixed(1) + ' 小时前';
      return (s / 86400).toFixed(1) + ' 天前';
    },
    period(p) {
      // 2026-10-01T13:00 → 10-01 13:00 ; 2026-10-01 → 10-01 ; 2026-10 → 2026-10
      if (!p) return '';
      if (p.length === 16) return p.slice(5, 10) + ' ' + p.slice(11);
      if (p.length === 10) return p.slice(5);
      return p;
    },
    delta(cur, prev) {
      if (!prev || prev === 0 || cur === null || cur === undefined) return null;
      return (cur - prev) / prev;
    },
  };

  CT.labels = {
    scope: { 1: '范围一', 2: '范围二', 3: '范围三' },
    scopeLong: { 1: '范围一 · 直接排放', 2: '范围二 · 外购电力/热力', 3: '范围三 · 价值链' },
    method: { measurement: '实测法', factor: '核算法', manual: '手工台账' },
    quality: { measured: '实测', estimated: '估算', manual: '手工' },
    deviceStatus: { online: '在线', offline: '离线', fault: '故障', maintenance: '检修' },
    alertStatus: { open: '待处理', acknowledged: '已确认', resolved: '已关闭' },
    severity: { critical: '紧急', major: '重要', minor: '一般', info: '提示' },
    ruleType: { rate_threshold: '排放速率超限', device_offline: '设备离线', data_anomaly: '数据异常', concentration_range: '浓度越限', quota_pace: '配额预警', data_missing: '完整率不足' },
    txType: { buy: '买入', sell: '卖出', ccer_offset: 'CCER 抵销', allocation: '配额分配', surrender: '履约清缴' },
    projectStatus: { planning: '规划中', in_progress: '实施中', completed: '已完成' },
    projectCategory: { energy_efficiency: '节能改造', fuel_switch: '燃料替代', renewable: '可再生能源', process: '工艺优化', management: '管理措施' },
    reportStatus: { draft: '草稿', internal_review: '内部审核', verifying: '第三方核查', submitted: '已提交', approved: '已通过' },
    reportType: { monthly: '月度报告', annual: '年度报告', mrv: 'MRV 报告' },
    role: { admin: '系统管理员', operator: '运行工程师', auditor: '核查/审计', viewer: '只读' },
    entryStatus: { draft: '草稿', confirmed: '已确认' },
    level: { group: '集团', site: '厂区', unit: '车间/装置' },
  };
  CT.label = (dict, key) => (CT.labels[dict] && CT.labels[dict][key]) || key || '—';

  CT.tagClass = {
    severity: { critical: 'tag-critical', major: 'tag-serious', minor: 'tag-warning', info: 'tag-info' },
    deviceStatus: { online: 'tag-good', offline: 'tag-critical', fault: 'tag-serious', maintenance: 'tag-info' },
    alertStatus: { open: 'tag-critical', acknowledged: 'tag-warning', resolved: 'tag-neutral' },
    projectStatus: { planning: 'tag-neutral', in_progress: 'tag-info', completed: 'tag-good' },
    reportStatus: { draft: 'tag-neutral', internal_review: 'tag-warning', verifying: 'tag-info', submitted: 'tag-accent', approved: 'tag-good' },
    quality: { good: 'tag-good', suspect: 'tag-warning', bad: 'tag-critical', interpolated: 'tag-info' },
    entryStatus: { draft: 'tag-warning', confirmed: 'tag-good' },
  };
  CT.tag = (dict, key) => (CT.tagClass[dict] && CT.tagClass[dict][key]) || 'tag-neutral';

  /* 把一个采样点换算为可读的显示值：区间消耗量（kWh/Nm³…）换算为每小时速率，瞬时值原样返回 */
  CT.pointRate = (metric, point, interval) => {
    const spec = (CT.store && CT.store.dict('metrics')[metric]) || {};
    const iv = interval || (point && point.interval_s) || 300;
    const v = point && typeof point === 'object' ? point.value : point;
    if (spec.kind === 'interval' && iv) return { value: v * 3600 / iv, unit: (spec.unit || '') + '/h', rate: true };
    return { value: v, unit: spec.unit || '', rate: false };
  };
  CT.cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  CT.isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  CT.uid = (() => { let i = 1; return () => 'ct' + (i++); })();
  CT.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  CT.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  CT.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  CT.isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  CT.nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  CT.monthKey = (d) => { d = d || new Date(); const loc = new Date(d.toLocaleString('en-US', { timeZone: TZ })); return loc.getFullYear() + '-' + String(loc.getMonth() + 1).padStart(2, '0'); };
  CT.year = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getFullYear();
  CT.download = (url) => { const a = document.createElement('a'); a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); };
  CT.copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } };
})(window.CT);
