/**
 * Универсальные методы анализа: чувствительность («что если», торнадо),
 * пороговые значения (switching values), сценарный анализ, Монте-Карло.
 *
 * Все методы работают с любой моделью через функцию metricFn(inputs) → число,
 * и список драйверов { path, label, mode: 'scale'|'shift', unit }.
 */
import { applyDriver, deepClone, getPath, setPath } from './utils.js';
import { quantile, mean, stdev } from './finance.js';

/** Однофакторный анализ: таблица «драйвер × изменение» */
export function sensitivityTable(metricFn, inputs, drivers, steps = [-0.2, -0.1, 0, 0.1, 0.2]) {
  const base = metricFn(inputs);
  const rows = drivers.map((d) => {
    // для mode 'shift' шаг 0.1 трактуется как сдвиг на shiftScale (по умолчанию 1 п.п.)
    const values = steps.map((s) => metricFn(applyDriver(inputs, d, d.mode === 'shift' ? s * (d.shiftScale ?? 10) : s)));
    // эластичность: % изменения результата / % изменения фактора (по шагу +10%)
    const i10 = steps.indexOf(0.1);
    let elasticity = null;
    if (i10 >= 0 && base && isFinite(base) && d.mode !== 'shift') elasticity = (values[i10] - base) / Math.abs(base) / 0.1;
    return { driver: d, values, elasticity };
  });
  return { base, steps, rows };
}

/** Торнадо-диаграмма: результат при ±delta по каждому драйверу, отсортировано по размаху */
export function tornado(metricFn, inputs, drivers, delta = 0.1) {
  const base = metricFn(inputs);
  const rows = drivers.map((d) => {
    const dx = d.mode === 'shift' ? delta * (d.shiftScale ?? 10) : delta;
    const low = metricFn(applyDriver(inputs, d, -dx));
    const high = metricFn(applyDriver(inputs, d, dx));
    return { driver: d, low, high, swing: Math.abs(high - low) };
  });
  rows.sort((a, b) => b.swing - a.swing);
  return { base, delta, rows };
}

/**
 * Пороговое значение: насколько (в %) надо изменить драйвер, чтобы метрика стала равна target (обычно 0).
 * Возвращает null, если в диапазоне [-95 %, +300 %] корня нет.
 */
export function switchingValue(metricFn, inputs, driver, target = 0) {
  const f = (x) => metricFn(applyDriver(inputs, driver, x)) - target;
  const scale = driver.mode === 'shift' ? driver.shiftScale ?? 10 : 1;
  let a = -0.95 * scale;
  let b = 3 * scale;
  let fa = f(a);
  let fb = f(b);
  if (!isFinite(fa) || !isFinite(fb)) return null;
  if (fa * fb > 0) {
    // ищем ближайший к нулю интервал на сетке
    const grid = [];
    for (let x = -0.95; x <= 3.0001; x += 0.05) grid.push(x * scale);
    let found = false;
    let best = null;
    for (let i = 0; i < grid.length - 1; i++) {
      const y1 = f(grid[i]);
      const y2 = f(grid[i + 1]);
      if (y1 * y2 <= 0) {
        const cand = [grid[i], grid[i + 1]];
        if (best == null || Math.abs(cand[0]) < Math.abs(best[0])) best = cand;
        found = true;
      }
    }
    if (!found) return null;
    [a, b] = best;
    fa = f(a);
    fb = f(b);
  }
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < 1e-6 || b - a < 1e-6) return m;
    if (fa * fm < 0) {
      b = m;
      fb = fm;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/**
 * Сценарный анализ. scenarios: [{ name, probability, changes: [{ path, mode, value }] }]
 * value: для 'scale' — доля (0.1 = +10 %), для 'shift' — абсолютный сдвиг, для 'set' — новое значение.
 */
export function scenarios(computeFn, inputs, scenarioList, metricKey = 'npv') {
  const results = scenarioList.map((sc) => {
    let inp = deepClone(inputs);
    for (const ch of sc.changes || []) {
      if (ch.mode === 'set') setPath(inp, ch.path, ch.value);
      else inp = applyDriver(inp, { path: ch.path, mode: ch.mode || 'scale', itemKey: ch.itemKey }, Number(ch.value) || 0);
    }
    const res = computeFn(inp);
    return { scenario: sc, inputs: inp, result: res, metric: res.kpi ? res.kpi[metricKey] : res[metricKey] };
  });
  const probs = results.map((r) => Number(r.scenario.probability) || 0);
  const pSum = probs.reduce((a, b) => a + b, 0);
  let expected = null;
  if (pSum > 0) expected = results.reduce((acc, r, i) => acc + (r.metric || 0) * probs[i], 0) / pSum;
  return { results, expected };
}

/** Детерминированный генератор (mulberry32) для воспроизводимости */
export function rng(seed = 42) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleDist(d, rand) {
  const kind = d.dist || 'triangular';
  if (kind === 'uniform') return d.min + (d.max - d.min) * rand();
  if (kind === 'normal') {
    // Бокса–Мюллера
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return (d.mean ?? 0) + (d.sd ?? 0.1) * z;
  }
  // треугольное: min, mode, max
  const { min, max } = d;
  const mode = d.mode ?? (min + max) / 2;
  const u = rand();
  const fc = (mode - min) / (max - min || 1);
  if (u < fc) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * Монте-Карло. vars: [{ driver, dist: 'triangular'|'uniform'|'normal', min, max, mode, mean, sd }]
 * Значения распределений — относительные изменения драйвера (0.1 = +10 %) либо сдвиг для mode 'shift'.
 */
export function monteCarlo(metricFn, inputs, vars, { iterations = 2000, seed = 42, bins = 20 } = {}) {
  const rand = rng(seed);
  const values = [];
  for (let i = 0; i < iterations; i++) {
    let inp = inputs;
    for (const v of vars) {
      const x = sampleDist(v, rand);
      inp = applyDriver(inp, v.driver, x);
    }
    const m = metricFn(inp);
    if (m != null && isFinite(m)) values.push(m);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const below = values.filter((v) => v < 0).length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const hist = new Array(bins).fill(0);
  const width = (max - min) / bins || 1;
  for (const v of values) {
    let b = Math.floor((v - min) / width);
    if (b >= bins) b = bins - 1;
    hist[b]++;
  }
  return {
    iterations: values.length,
    mean: mean(values),
    sd: stdev(values),
    min,
    max,
    p5: quantile(sorted, 0.05),
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    probNegative: values.length ? below / values.length : null,
    histogram: hist.map((count, i) => ({ from: min + i * width, to: min + (i + 1) * width, count })),
  };
}

export { getPath };
