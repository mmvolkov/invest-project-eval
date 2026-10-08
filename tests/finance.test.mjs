import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/engine/finance.js';
import { computeProject, expressToProject } from '../src/engine/project.js';
import { tornado, switchingValue, monteCarlo, scenarios, sensitivityTable } from '../src/engine/analysis.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('NPV: пример fd.ru — 1 000 000 инвестиций, 250 000 × 5 лет, 10 % → −52 303', () => {
  const flows = [-1000000, 250000, 250000, 250000, 250000, 250000];
  close(F.npv(0.1, flows), -52303, 1);
  assert.ok(F.irr(flows) < 0.1);
  close(F.irr(flows), 0.0793, 0.001);
});

test('Аннуитет: 1 000 000 на 5 лет под 10 % → 263 797', () => {
  close(F.annuityPayment(1000000, 0.1, 5), 263797.48, 0.01);
  close(F.annuityPayment(1000000, 0.1 / 12, 60), 21247.04, 0.01);
});

test('График аннуитетного кредита закрывается в ноль, NPV по ставке кредита = 0', () => {
  const rows = F.loanSchedule({ amount: 1000, rate: 0.1, term: 5, type: 'annuity', start: 0 }, 5);
  close(rows[5].closing, 0, 1e-6);
  const flows = rows.map((r) => r.drawdown - r.payment);
  close(F.npv(0.1, flows), 0, 1e-6);
  close(F.irr(flows), 0.1, 1e-5);
});

test('Срок окупаемости: пример агрохолдинга (fd.ru) — PP 6 лет, DPP 9 лет (в нумерации статьи)', () => {
  // В статье период 1 = t0. Потоки: -320, -20, 100 × 8
  const flows = [-320, -20, 100, 100, 100, 100, 100, 100, 100, 100];
  const cum = F.cumulative(flows);
  assert.equal(cum[5], 60); // в 6-м периоде накопленный поток впервые положителен
  const pp = F.paybackPeriod(flows, 0);
  assert.ok(pp > 4 && pp <= 5); // t=4.4 → 6-й период по нумерации статьи
  const dpp = F.paybackPeriod(flows, 0.15);
  assert.ok(dpp > 7 && dpp <= 8); // 9-й период
  close(F.fundingNeed(flows), 340, 1e-9);
  close(F.fundingNeed(flows, 0.15), 337.39, 0.01);
});

test('IRR не определён при двух сменах знака — сигнализируем', () => {
  const flows = [-125, 55, 55, 55, -45, 55, 55, 55, 55, 55];
  assert.equal(F.signChanges(flows), 3);
  assert.ok(F.mirr(flows, 0.15, 0.15) != null);
});

test('PI и MIRR', () => {
  const flows = [-100, 60, 60];
  const r = 0.1;
  close(F.profitabilityIndex(r, flows), (60 / 1.1 + 60 / 1.21) / 100, 1e-9);
  const m = F.mirr(flows, r, r);
  close(m, Math.sqrt((60 * 1.1 + 60) / 100) - 1, 1e-9);
});

test('WACC и CAPM', () => {
  close(F.capm({ rf: 0.08, beta: 1.2, mrp: 0.06 }), 0.152, 1e-9);
  close(F.wacc({ equity: 60, debt: 40, costEquity: 0.2, costDebt: 0.15, taxRate: 0.2 }), 0.6 * 0.2 + 0.4 * 0.15 * 0.8, 1e-9);
});

test('Амортизация линейная и остаток', () => {
  const { schedule, residual } = F.depreciationSchedule({ amount: 100, period: 0, life: 4 }, 3);
  assert.deepEqual(schedule, [0, 25, 25, 25]);
  close(residual, 25, 1e-9);
});

test('Проект: базовый расчёт согласован (NPV = Σ DCF, FCFF = NOPAT + D − CapEx − ΔWC + TV)', () => {
  const res = computeProject({
    general: { horizon: 5, discountRate: 15, taxRate: 20, startYear: 2026 },
    capex: { items: [{ name: 'A', amount: 1000, period: 0, life: 5 }], liquidation: { mode: 'residual' } },
    financing: { loans: [{ name: 'Банк', amount: 500, rate: 18, term: 5, type: 'annuity', start: 0 }] },
    effect: {
      revenue: [0, 600, 700, 800, 850, 900],
      variableCostPct: 40,
      fixedCosts: [0, 100, 105, 110, 115, 120],
      wcPctRevenue: 10,
      releaseWC: true,
      terminal: { method: 'none' },
    },
  });
  const s = res.series;
  close(res.kpi.npv, F.sum(s.dcf), 1e-9);
  for (let t = 0; t < res.n; t++) close(s.fcff[t], s.nopat[t] + s.depreciation[t] - s.capex[t] - s.dWC[t] + s.terminal[t], 1e-9);
  assert.ok(res.kpi.irr > res.kpi.discountRate, 'IRR > ставки при положительном NPV');
  assert.ok(res.kpi.npv > 0);
  assert.ok(res.kpi.pi > 1);
  assert.ok(res.kpi.minDscr != null);
  close(s.debtBalance[5], 0, 1e-6);
  // оборотный капитал высвобождается в последнем периоде
  close(s.terminal[5], s.wc[5] + res.kpi.liquidation, 1e-9);
});

test('Экспресс-оценка → проект', () => {
  const inp = expressToProject({ investment: 1000, annualRevenue: 800, growth: 5, variableCostPct: 50, fixedCosts: 100, years: 5, discountRate: 15, taxRate: 20 });
  const res = computeProject(inp);
  assert.equal(res.N, 5);
  assert.ok(isFinite(res.kpi.npv));
  assert.equal(res.series.revenue[0], 0);
  close(res.series.revenue[2], 800 * 1.05, 1e-9);
});

test('Анализ чувствительности: торнадо, порог, сценарии, Монте-Карло', () => {
  const base = expressToProject({ investment: 1000, annualRevenue: 800, growth: 0, variableCostPct: 50, fixedCosts: 100, years: 5, discountRate: 15, taxRate: 20 });
  const metric = (inp) => computeProject(inp).kpi.npv;
  const drivers = [
    { path: 'effect.revenue', label: 'Выручка', mode: 'scale' },
    { path: 'capex.items', label: 'CapEx', mode: 'scale', itemKey: 'amount' },
    { path: 'general.discountRate', label: 'Ставка', mode: 'shift' },
  ];
  const t = tornado(metric, base, drivers, 0.1);
  assert.equal(t.rows.length, 3);
  assert.ok(t.rows[0].swing >= t.rows[1].swing);
  const st = sensitivityTable(metric, base, drivers);
  assert.equal(st.rows[0].values.length, 5);
  const sv = switchingValue(metric, base, drivers[0]);
  const baseNpv = metric(base);
  assert.ok(sv != null && Math.sign(sv) === -Math.sign(baseNpv), `switching value ${sv} при NPV ${baseNpv}`);
  close(metric({ ...base, effect: { ...base.effect, revenue: base.effect.revenue.map((v) => v * (1 + sv)) } }), 0, 1e-3);
  const sc = scenarios(computeProject, base, [
    { name: 'База', probability: 0.5, changes: [] },
    { name: 'Пессимистичный', probability: 0.3, changes: [{ path: 'effect.revenue', mode: 'scale', value: -0.2 }] },
    { name: 'Оптимистичный', probability: 0.2, changes: [{ path: 'effect.revenue', mode: 'scale', value: 0.2 }] },
  ]);
  assert.equal(sc.results.length, 3);
  assert.ok(sc.results[1].metric < sc.results[0].metric);
  const mc = monteCarlo(metric, base, [{ driver: drivers[0], dist: 'triangular', min: -0.3, mode: 0, max: 0.3 }], { iterations: 500 });
  assert.equal(mc.iterations, 500);
  assert.ok(mc.p10 <= mc.p50 && mc.p50 <= mc.p90);
});
