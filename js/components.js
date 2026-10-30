/* 通用组件：KPI 瓦片、标签、表格、弹窗、抽屉、进度条、分页、Toast、范围选择 */
(function (CT) {
  const C = (CT.components = CT.components || {});
  const { reactive } = Vue;

  /* ---------- Toast ---------- */
  const toasts = reactive([]);
  CT.toast = (msg, type = 'info', ms = 2800) => {
    const id = CT.uid();
    toasts.push({ id, msg, type });
    setTimeout(() => { const i = toasts.findIndex((t) => t.id === id); if (i >= 0) toasts.splice(i, 1); }, ms);
  };
  C.CtToasts = { name: 'ct-toasts', setup: () => ({ toasts }), template: `<div class="toast-wrap"><div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.msg }}</div></div>` };

  /* ---------- KPI 瓦片 ---------- */
  C.CtTile = {
    name: 'ct-tile',
    props: { label: String, value: [Number, String], unit: String, digits: { type: Number, default: 1 }, delta: Number, deltaLabel: String, invert: Boolean, accent: Boolean, sub: String, compact: Boolean },
    computed: {
      shown() { if (typeof this.value === 'string') return this.value; return this.compact ? CT.fmt.compact(this.value) : CT.fmt.num(this.value, this.digits); },
      deltaClass() { if (this.delta === null || this.delta === undefined || Number.isNaN(this.delta)) return 'flat'; if (Math.abs(this.delta) < 0.002) return 'flat'; const up = this.delta > 0; return (up !== this.invert) ? 'up' : 'down'; },
      deltaText() { if (this.delta === null || this.delta === undefined || Number.isNaN(this.delta)) return '—'; return (this.delta > 0 ? '+' : '') + (this.delta * 100).toFixed(1) + '%'; },
    },
    template: `<div class="tile" :class="{accent: accent}">
      <div class="label">{{ label }}</div>
      <div class="value">{{ shown }}<span v-if="unit" class="unit">{{ unit }}</span></div>
      <div v-if="deltaLabel" class="delta" :class="deltaClass"><span>{{ deltaText }}</span><span class="muted">{{ deltaLabel }}</span></div>
      <div v-else-if="sub" class="delta flat">{{ sub }}</div>
    </div>`,
  };

  /* ---------- 标签 ---------- */
  C.CtTag = {
    name: 'ct-tag',
    props: { dict: String, value: [String, Number], dot: Boolean, text: String },
    template: `<span class="tag" :class="dict ? CT.tag(dict, value) : 'tag-neutral'"><i v-if="dot" class="dot"></i>{{ text || (dict ? CT.label(dict, value) : value) }}</span>`,
    setup: () => ({ CT }),
  };

  /* ---------- 进度条 ---------- */
  C.CtBar = {
    name: 'ct-bar',
    props: { value: Number, warn: { type: Number, default: 0.85 }, crit: { type: Number, default: 1 }, marker: Number, lg: Boolean },
    computed: { w() { return CT.clamp((this.value || 0) * 100, 0, 100) + '%'; }, cls() { if ((this.value || 0) >= this.crit) return 'crit'; if ((this.value || 0) >= this.warn) return 'warn'; return ''; } },
    template: `<div class="bar" :class="{lg: lg}"><span :class="cls" :style="{width: w}"></span><i v-if="marker !== undefined && marker !== null" :style="{left: CT.clamp(marker*100,0,100)+'%'}"></i></div>`,
    setup: () => ({ CT }),
  };

  /* ---------- 表格 ---------- */
  C.CtTable = {
    name: 'ct-table',
    props: { columns: Array, rows: Array, rowKey: { type: String, default: 'id' }, clickable: Boolean, selected: [Number, String], empty: { type: String, default: '暂无数据' }, loading: Boolean, compact: Boolean },
    emits: ['row-click'],
    methods: { cell(col, row) { const v = row[col.key]; return col.format ? col.format(v, row) : (v === null || v === undefined || v === '' ? '—' : v); } },
    template: `<div class="table-wrap"><table class="tbl">
      <thead><tr><th v-for="c in columns" :key="c.key" :class="[c.align === 'right' ? 'num' : '', c.cls]" :style="c.width ? {width: c.width} : null">{{ c.label }}</th></tr></thead>
      <tbody>
        <tr v-if="loading && !rows.length"><td :colspan="columns.length"><div class="skeleton" style="height:18px;margin:6px 0"></div><div class="skeleton" style="height:18px;margin:6px 0"></div></td></tr>
        <tr v-else-if="!rows.length"><td :colspan="columns.length" class="empty">{{ empty }}</td></tr>
        <tr v-for="r in rows" :key="r[rowKey]" :class="{clickable: clickable, selected: selected !== undefined && selected === r[rowKey]}" @click="clickable && $emit('row-click', r)">
          <td v-for="c in columns" :key="c.key" :class="[c.align === 'right' ? 'num' : '', c.cls, c.nowrap ? 'nowrap' : '']">
            <slot :name="'cell-' + c.key" :row="r" :value="r[c.key]">{{ cell(c, r) }}</slot>
          </td>
        </tr>
      </tbody></table></div>`,
  };

  /* ---------- 分页 ---------- */
  C.CtPager = {
    name: 'ct-pager',
    props: { page: Number, total: Number, pageSize: { type: Number, default: 50 } },
    emits: ['change'],
    computed: { pages() { return Math.max(1, Math.ceil((this.total || 0) / this.pageSize)); } },
    template: `<div class="flex small muted" style="padding:8px 16px"><span>共 {{ CT.fmt.num(total) }} 条</span><span class="grow"></span>
      <button class="btn btn-sm" :disabled="page<=1" @click="$emit('change', page-1)">上一页</button><span class="num">{{ page }} / {{ pages }}</span><button class="btn btn-sm" :disabled="page>=pages" @click="$emit('change', page+1)">下一页</button></div>`,
    setup: () => ({ CT }),
  };

  /* ---------- 弹窗 ---------- */
  C.CtModal = {
    name: 'ct-modal',
    props: { show: Boolean, title: String, lg: Boolean, busy: Boolean, okText: { type: String, default: '保存' }, hideFooter: Boolean, danger: Boolean },
    emits: ['close', 'ok'],
    template: `<teleport to="body"><div v-if="show" class="overlay" @click.self="$emit('close')">
      <div class="modal" :class="{lg: lg}" role="dialog" aria-modal="true">
        <div class="card-h"><h3>{{ title }}</h3><div class="tools"><button class="btn btn-ghost btn-icon" @click="$emit('close')" aria-label="关闭">✕</button></div></div>
        <div class="card-b"><slot></slot></div>
        <div v-if="!hideFooter" class="card-f"><slot name="footer"><button class="btn" @click="$emit('close')">取消</button><button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="$emit('ok')">{{ busy ? '处理中…' : okText }}</button></slot></div>
      </div></div></teleport>`,
  };

  /* ---------- 抽屉 ---------- */
  C.CtDrawer = {
    name: 'ct-drawer',
    props: { show: Boolean, title: String, sub: String },
    emits: ['close'],
    template: `<teleport to="body"><div v-if="show"><div class="drawer-overlay" @click="$emit('close')"></div>
      <aside class="drawer" role="dialog" aria-modal="true">
        <div class="card-h"><div><h3>{{ title }}</h3><div v-if="sub" class="sub">{{ sub }}</div></div><div class="tools"><slot name="tools"></slot><button class="btn btn-ghost btn-icon" @click="$emit('close')" aria-label="关闭">✕</button></div></div>
        <div class="card-b"><slot></slot></div>
      </aside></div></teleport>`,
  };

  /* ---------- 确认框 ---------- */
  const confirmState = reactive({ show: false, title: '', text: '', resolve: null, danger: false, okText: '确定' });
  CT.confirm = (title, text, opts = {}) => new Promise((resolve) => { Object.assign(confirmState, { show: true, title, text, resolve, danger: !!opts.danger, okText: opts.okText || '确定' }); });
  C.CtConfirm = {
    name: 'ct-confirm',
    setup: () => ({ s: confirmState, done(v) { confirmState.show = false; confirmState.resolve && confirmState.resolve(v); } }),
    template: `<ct-modal :show="s.show" :title="s.title" :danger="s.danger" :ok-text="s.okText" @close="done(false)" @ok="done(true)"><p style="margin:0">{{ s.text }}</p></ct-modal>`,
  };

  /* ---------- 开关 ---------- */
  C.CtSwitch = { name: 'ct-switch', props: { modelValue: Boolean }, emits: ['update:modelValue'], template: `<button type="button" class="switch" :class="{on: modelValue}" role="switch" :aria-checked="modelValue" @click="$emit('update:modelValue', !modelValue)"></button>` };

  /* ---------- 分段按钮 ---------- */
  C.CtSeg = {
    name: 'ct-seg',
    props: { modelValue: [String, Number], options: Array },
    emits: ['update:modelValue'],
    template: `<div class="seg"><button v-for="o in options" :key="o.value" type="button" :class="{active: o.value === modelValue}" @click="$emit('update:modelValue', o.value)">{{ o.label }}</button></div>`,
  };

  /* ---------- 组织范围选择（顶栏） ---------- */
  C.CtScopeSelect = {
    name: 'ct-scope-select',
    props: { tree: Array, modelValue: [Number, null] },
    emits: ['update:modelValue'],
    data: () => ({ open: false }),
    computed: {
      flat() {
        const out = [];
        const walk = (nodes, depth) => nodes.forEach((n) => { out.push({ n, depth }); walk(n.children || [], depth + 1); });
        walk(this.tree || [], 0);
        return out;
      },
      current() { const f = this.flat.find((x) => x.n.id === this.modelValue); return f ? f.n : (this.flat[0] && this.flat[0].n); },
    },
    mounted() { this._doc = (e) => { if (!this.$el.contains(e.target)) this.open = false; }; document.addEventListener('click', this._doc); },
    beforeUnmount() { document.removeEventListener('click', this._doc); },
    template: `<div class="scope-select">
      <button class="scope-btn" @click="open = !open" aria-haspopup="listbox" :aria-expanded="open">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1"/></svg>
        <span>{{ current ? current.name : '全集团' }}</span><span class="lvl">{{ current ? CT.label('level', current.level) : '' }}</span><span class="muted">▾</span>
      </button>
      <div v-if="open" class="scope-pop" role="listbox">
        <div v-for="x in flat" :key="x.n.id" class="tree-node" :class="['tree-indent-' + Math.min(x.depth,2), {active: x.n.id === modelValue}]" role="option" @click="$emit('update:modelValue', x.n.id); open=false">
          <span>{{ x.n.name }}</span><span class="cnt">{{ x.n.source_count }} 源 · {{ x.n.device_count }} 设备</span>
        </div>
      </div></div>`,
    setup: () => ({ CT }),
  };

  /* ---------- 空状态 ---------- */
  C.CtEmpty = { name: 'ct-empty', props: { text: { type: String, default: '暂无数据' } }, template: `<div class="empty">{{ text }}</div>` };

  /* ---------- 流程步骤 ---------- */
  C.CtPipeline = {
    name: 'ct-pipeline',
    props: { steps: Array, current: String },
    computed: { idx() { return this.steps.findIndex((s) => s.key === this.current); } },
    template: `<div class="pipeline"><template v-for="(s, i) in steps" :key="s.key"><div class="step" :class="{done: i < idx, cur: i === idx}"><i>{{ i < idx ? '✓' : i + 1 }}</i><span>{{ s.label }}</span></div><div v-if="i < steps.length - 1" class="line" :class="{done: i < idx}"></div></template></div>`,
  };

  CT.registerComponents = (app) => { Object.values(C).forEach((c) => app.component(c.name, c)); };
})(window.CT);
