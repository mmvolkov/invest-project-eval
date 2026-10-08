/** Обёртка над Chart.js: единый стиль, типы bar/line/mixed/doughnut/horizontalBar/waterfall/histogram/tornado */

const PALETTE = ['#1f6feb', '#f2994a', '#27ae60', '#9b51e0', '#eb5757', '#2d9cdb', '#f2c94c', '#56ccf2'];
const charts = new Map();

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function hasChartJs() {
  return typeof window !== 'undefined' && typeof window.Chart !== 'undefined';
}

export function destroyChart(canvas) {
  const c = charts.get(canvas);
  if (c) {
    c.destroy();
    charts.delete(canvas);
  }
}

export function renderChart(canvas, spec) {
  if (!hasChartJs()) {
    canvas.replaceWith(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Графики недоступны: не загрузилась библиотека Chart.js' }));
    return null;
  }
  destroyChart(canvas);
  const fg = css('--fg-2') || '#555';
  const grid = css('--line') || '#ddd';
  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    plugins: {
      legend: { labels: { color: fg, boxWidth: 12 } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label || ''}: ${nf.format(Array.isArray(ctx.raw) ? ctx.raw[1] - ctx.raw[0] : ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed)}` } },
    },
    scales: { x: { ticks: { color: fg }, grid: { color: grid } }, y: { ticks: { color: fg, callback: (v) => nf.format(v) }, grid: { color: grid } } },
  };
  let type = spec.type;
  let data;
  let options = JSON.parse(JSON.stringify(common));
  // восстановить функции после клонирования
  options.plugins.tooltip.callbacks = common.plugins.tooltip.callbacks;
  options.scales.y.ticks.callback = common.scales.y.ticks.callback;

  if (type === 'doughnut') {
    data = { labels: spec.labels, datasets: [{ data: spec.datasets[0].data, backgroundColor: PALETTE, borderWidth: 0 }] };
    options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: fg } } } };
  } else if (type === 'waterfall') {
    const vals = spec.datasets[0].data;
    const bars = [];
    const colors = [];
    let run = 0;
    vals.forEach((v, i) => {
      if (i === 0 || i === vals.length - 1) {
        bars.push([0, v]);
        colors.push(PALETTE[0]);
        run = v;
      } else {
        bars.push([run, run + v]);
        colors.push(v >= 0 ? PALETTE[2] : PALETTE[4]);
        run += v;
      }
    });
    type = 'bar';
    data = { labels: spec.labels, datasets: [{ label: spec.datasets[0].label, data: bars, backgroundColor: colors }] };
    options.plugins.legend.display = false;
  } else if (type === 'tornado') {
    // datasets: [{label:'−', data:[...]}, {label:'+', data:[...]}], base — значение базы
    type = 'bar';
    options.indexAxis = 'y';
    data = {
      labels: spec.labels,
      datasets: spec.datasets.map((d, i) => ({ label: d.label, data: d.data.map((v) => [spec.base, v]), backgroundColor: i === 0 ? PALETTE[4] : PALETTE[2] })),
    };
    options.scales.x.stacked = false;
    options.scales.y.stacked = true;
    options.scales.x.ticks = { color: fg, callback: (v) => nf.format(v) };
    options.plugins.tooltip.callbacks = { label: (ctx) => `${ctx.dataset.label}: ${nf.format(ctx.raw[1])}` };
  } else if (type === 'horizontalBar') {
    type = 'bar';
    options.indexAxis = 'y';
    data = { labels: spec.labels, datasets: spec.datasets.map((d) => ({ label: d.label, data: d.data, backgroundColor: d.data.map((v) => (v >= 0 ? PALETTE[2] : PALETTE[4])) })) };
    options.scales.x.ticks = { color: fg, callback: (v) => nf.format(v) };
  } else if (type === 'histogram') {
    type = 'bar';
    data = { labels: spec.labels, datasets: [{ label: spec.datasets[0].label, data: spec.datasets[0].data, backgroundColor: spec.datasets[0].data.map((_, i) => (spec.negativeUntil != null && i < spec.negativeUntil ? PALETTE[4] : PALETTE[0])), barPercentage: 1, categoryPercentage: 1 }] };
    options.plugins.legend.display = false;
  } else {
    data = {
      labels: spec.labels,
      datasets: spec.datasets.map((d, i) => {
        const color = d.color || PALETTE[i % PALETTE.length];
        const t = d.type || (type === 'mixed' ? 'bar' : type);
        return {
          type: t,
          label: d.label,
          data: d.data,
          backgroundColor: t === 'line' ? color : color + 'cc',
          borderColor: color,
          borderWidth: t === 'line' ? 2 : 0,
          tension: 0.25,
          pointRadius: 2,
          fill: false,
          yAxisID: 'y',
        };
      }),
    };
    if (type === 'mixed') type = 'bar';
    if (spec.stacked) {
      options.scales.x.stacked = true;
      options.scales.y.stacked = true;
    }
  }
  const chart = new window.Chart(canvas, { type, data, options });
  charts.set(canvas, chart);
  return chart;
}

/** PNG (base64) для отчётов */
export function chartImage(canvas) {
  const c = charts.get(canvas);
  if (!c) return null;
  return c.toBase64Image('image/png', 1);
}

export function allChartImages(root) {
  const out = [];
  root.querySelectorAll('canvas').forEach((cv) => {
    const c = charts.get(cv);
    if (c) out.push({ title: cv.dataset.title || '', dataUrl: c.toBase64Image('image/png', 1), width: cv.width, height: cv.height });
  });
  return out;
}
