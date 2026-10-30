/* ECharts 封装：主题令牌、常用图表构造器、<ct-chart> 组件 */
(function (CT) {
  const palette = () => ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'].map(CT.cssVar);
  const ink = () => ({ fg: CT.cssVar('--fg'), fg2: CT.cssVar('--fg-2'), muted: CT.cssVar('--muted'), grid: CT.cssVar('--grid'), axis: CT.cssVar('--axis'), surface: CT.cssVar('--surface'), border: CT.cssVar('--border'), accent: CT.cssVar('--accent') });

  const base = () => {
    const c = ink();
    return {
      color: palette(),
      textStyle: { fontFamily: CT.cssVar('--font-ui'), color: c.fg2 },
      animationDuration: 300,
      tooltip: {
        trigger: 'axis', backgroundColor: c.surface, borderColor: c.border, textStyle: { color: c.fg, fontSize: 12 }, padding: [8, 10],
        axisPointer: { type: 'line', lineStyle: { color: c.axis } },
      },
      grid: { left: 8, right: 12, top: 32, bottom: 8, containLabel: true },
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: c.fg2, fontSize: 12 } },
      xAxis: { axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, axisLabel: { color: c.muted, fontSize: 11 }, splitLine: { show: false } },
      yAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.muted, fontSize: 11 }, splitLine: { lineStyle: { color: c.grid } } },
    };
  };
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b || {})) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = merge(a[k], b[k]);
      else out[k] = b[k];
    }
    return out;
  };

  const unitFmt = (unit, digits) => (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: digits === undefined ? 1 : digits }) + (unit ? ' ' + unit : ''));

  CT.charts = {
    palette, base, merge,
    /* 堆叠柱（时间序列 × 分类） */
    stackedBar({ categories, series, unit = 'tCO₂e', stack = true, digits = 1, extra = {} }) {
      const b = base();
      return merge(merge(b, {
        tooltip: { valueFormatter: unitFmt(unit, digits) },
        xAxis: { type: 'category', data: categories, axisLabel: { interval: 'auto', hideOverlap: true } },
        yAxis: { type: 'value', name: unit, nameTextStyle: { color: ink().muted, fontSize: 11, align: 'left' } },
        series: series.map((s, i) => ({ name: s.name, type: 'bar', stack: stack ? 'total' : undefined, data: s.data, barMaxWidth: 28, itemStyle: { borderRadius: stack && i < series.length - 1 ? 0 : [3, 3, 0, 0] }, emphasis: { focus: 'series' } })),
      }), extra);
    },
    /* 折线（可多系列） */
    line({ categories, series, unit = '', digits = 1, area = false, extra = {}, smooth = false }) {
      const b = base();
      return merge(merge(b, {
        tooltip: { valueFormatter: unitFmt(unit, digits) },
        xAxis: { type: 'category', data: categories, boundaryGap: false, axisLabel: { hideOverlap: true } },
        yAxis: { type: 'value', name: unit, nameTextStyle: { color: ink().muted, fontSize: 11, align: 'left' }, scale: true },
        series: series.map((s) => ({ name: s.name, type: 'line', data: s.data, showSymbol: false, smooth, lineStyle: { width: 2, type: s.dashed ? 'dashed' : 'solid' }, areaStyle: area || s.area ? { opacity: 0.12 } : undefined, emphasis: { focus: 'series' }, markLine: s.markLine })),
      }), extra);
    },
    /* 时间轴折线（数据为 [ts, value]） */
    timeLine({ series, unit = '', digits = 2, extra = {} }) {
      const b = base();
      return merge(merge(b, {
        tooltip: { valueFormatter: unitFmt(unit, digits) },
        xAxis: { type: 'time', axisLabel: { hideOverlap: true, formatter: (v) => CT.fmt.hm(new Date(v).toISOString()) } },
        yAxis: { type: 'value', name: unit, nameTextStyle: { color: ink().muted, fontSize: 11, align: 'left' }, scale: true },
        series: series.map((s) => ({ name: s.name, type: 'line', data: s.data, showSymbol: false, lineStyle: { width: 2 }, areaStyle: s.area ? { opacity: 0.1 } : undefined, markLine: s.markLine })),
      }), extra);
    },
    /* 横向条形（分项排名） */
    hbar({ items, unit = 'tCO₂e', digits = 1, color, max = 10, extra = {} }) {
      const b = base();
      const rows = items.slice(0, max).reverse();
      return merge(merge(b, {
        tooltip: { trigger: 'item', valueFormatter: unitFmt(unit, digits) },
        legend: { show: false },
        grid: { top: 8, bottom: 8, left: 8, right: 56, containLabel: true },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: ink().grid } }, axisLabel: { show: false } },
        yAxis: { type: 'category', data: rows.map((r) => r.label), axisLabel: { color: ink().fg2, fontSize: 12, width: 110, overflow: 'truncate' }, splitLine: { show: false } },
        series: [{ type: 'bar', data: rows.map((r) => r.value), barMaxWidth: 16, itemStyle: { color: color || ink().accent, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: ink().fg2, fontSize: 11, formatter: (p) => Number(p.value).toLocaleString('zh-CN', { maximumFractionDigits: digits }) } }],
      }), extra);
    },
    /* 环形占比（≤ 4 项，其余折入“其他”） */
    donut({ items, unit = 'tCO₂e', digits = 1, extra = {} }) {
      const b = base();
      const c = ink();
      const sorted = items.slice().sort((a, b2) => b2.value - a.value);
      const main = sorted.slice(0, 4);
      const rest = sorted.slice(4);
      if (rest.length) main.push({ label: '其他', value: rest.reduce((s, x) => s + x.value, 0) });
      const total = main.reduce((s, x) => s + x.value, 0) || 1;
      return merge(merge(b, {
        tooltip: { trigger: 'item', valueFormatter: unitFmt(unit, digits) },
        legend: { orient: 'vertical', right: 0, top: 'middle', formatter: (n) => { const it = main.find((x) => x.label === n); return n + '  ' + (it ? (it.value / total * 100).toFixed(1) + '%' : ''); } },
        series: [{ type: 'pie', radius: ['50%', '74%'], center: ['30%', '50%'], avoidLabelOverlap: true, itemStyle: { borderColor: c.surface, borderWidth: 2 }, label: { show: false }, data: main.map((x) => ({ name: x.label, value: Number(x.value.toFixed(digits)) })) }],
      }), extra);
    },
    /* 分组柱（本年 vs 去年） */
    groupedBar({ categories, series, unit = 'tCO₂e', digits = 0, extra = {} }) {
      const b = base();
      return merge(merge(b, {
        tooltip: { valueFormatter: unitFmt(unit, digits) },
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value', name: unit, nameTextStyle: { color: ink().muted, fontSize: 11, align: 'left' } },
        series: series.map((s) => ({ name: s.name, type: 'bar', data: s.data, barMaxWidth: 18, itemStyle: { borderRadius: [3, 3, 0, 0], color: s.color }, emphasis: { focus: 'series' } })),
      }), extra);
    },
    /* 热力（设备 × 小时） */
    heatmap({ xs, ys, data, min = 0, max = 1, extra = {} }) {
      const b = base();
      const c = ink();
      return merge(merge(b, {
        tooltip: { trigger: 'item', formatter: (p) => `${ys[p.value[1]]}<br>${xs[p.value[0]]}：${(p.value[2] * 100).toFixed(0)}%` },
        legend: { show: false },
        grid: { top: 8, bottom: 8, left: 8, right: 8, containLabel: true },
        xAxis: { type: 'category', data: xs, splitArea: { show: false }, axisLabel: { interval: 3 } },
        yAxis: { type: 'category', data: ys, splitLine: { show: false }, axisLabel: { width: 130, overflow: 'truncate', color: c.fg2 } },
        visualMap: { min, max, show: false, inRange: { color: [CT.isDark() ? '#184f95' : '#cde2fb', CT.isDark() ? '#86b6ef' : '#2a78d6'] } },
        series: [{ type: 'heatmap', data, itemStyle: { borderColor: c.surface, borderWidth: 1 }, emphasis: { itemStyle: { shadowBlur: 4 } } }],
      }), extra);
    },
  };

  /* <ct-chart :option="opt" height="260px"> */
  CT.components = CT.components || {};
  /* 主题切换时只需重算颜色相关字段 */
  const themeBits = () => {
    const b = base();
    const c = ink();
    return { color: b.color, textStyle: b.textStyle, tooltip: { backgroundColor: c.surface, borderColor: c.border, textStyle: { color: c.fg } }, legend: { textStyle: { color: c.fg2 } }, xAxis: { axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.muted } }, yAxis: { axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } } };
  };

  CT.components.CtChart = {
    name: 'ct-chart',
    props: { option: { type: [Object, Function], default: null }, height: { type: String, default: '240px' }, loading: Boolean },
    template: `<div class="chart" :style="{height: height}" ref="el"></div>`,
    mounted() {
      this.render();
      this.ro = new ResizeObserver(() => { this.chart && this.chart.resize(); });
      this.ro.observe(this.$refs.el);
      this.off = CT.bus.on('theme', () => this.render(true));
    },
    beforeUnmount() { this.ro && this.ro.disconnect(); this.off && this.off(); if (this.chart) { this.chart.dispose(); this.chart = null; } },
    watch: { option: { handler() { this.render(); }, deep: true }, loading(v) { if (this.chart) v ? this.chart.showLoading({ text: '', color: CT.cssVar('--accent'), maskColor: 'transparent' }) : this.chart.hideLoading(); } },
    methods: {
      render(rebuild) {
        if (!window.echarts || !this.$refs.el) return;
        if (rebuild && this.chart) { this.chart.dispose(); this.chart = null; }
        if (!this.chart) this.chart = echarts.init(this.$refs.el, null, { renderer: 'canvas' });
        if (!this.option) return;
        let opt = typeof this.option === 'function' ? this.option() : this.option;
        if (rebuild && typeof this.option !== 'function') {
          const t = themeBits();
          opt = merge(opt, t);
          if (Array.isArray(opt.xAxis)) opt.xAxis = opt.xAxis.map((a) => merge(a, t.xAxis));
          if (Array.isArray(opt.yAxis)) opt.yAxis = opt.yAxis.map((a) => merge(a, t.yAxis));
        }
        this.chart.setOption(opt, { notMerge: true });
      },
    },
  };
})(window.CT);
