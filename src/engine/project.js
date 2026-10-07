/**
 * Универсальная модель оценки инвестиционного проекта.
 * Структура повторяет методику «Как оценить инвестиционный проект»
 * (Система Финансовый директор): листы CapEx → Financing → Effect → CF → Анализ эффективности.
 *
 * Периоды: t = 0..N, где t=0 — момент старта (инвестиционный период, не дисконтируется),
 * t = 1..N — операционные периоды (годы/кварталы/месяцы по выбору пользователя).
 */
import * as F from './finance.js';
import { fitSeries, pct } from './utils.js';

export const DEFAULT_PROJECT_INPUTS = {
  general: {
    name: 'Новый проект',
    unit: 'тыс. руб.',
    periodLabel: 'год',
    startYear: new Date().getFullYear(),
    horizon: 5,
    discountRate: 15,
    taxRate: 20,
    lossCarryforward: true,
    midYear: false,
    reinvestRate: null,
  },
  capex: {
    items: [{ name: 'Оборудование', amount: 1000, period: 0, life: 5, method: 'linear' }],
    liquidation: { mode: 'residual', value: 0 },
  },
  financing: {
    loans: [],
  },
  effect: {
    revenue: [0, 600, 700, 800, 850, 900],
    variableCostPct: 40,
    fixedCosts: [0, 100, 105, 110, 115, 120],
    savings: [0, 0, 0, 0, 0, 0],
    otherCapex: [0, 0, 0, 0, 0, 0],
    wcPctRevenue: 10,
    releaseWC: true,
    terminal: { method: 'none', growth: 2, multiple: 5 },
  },
};

/** Нормализация входных данных: длины рядов, числа */
export function normalizeProjectInputs(raw) {
  const inp = JSON.parse(JSON.stringify(raw || {}));
  inp.general = { ...DEFAULT_PROJECT_INPUTS.general, ...(inp.general || {}) };
  inp.capex = { ...DEFAULT_PROJECT_INPUTS.capex, ...(inp.capex || {}) };
  inp.financing = { ...DEFAULT_PROJECT_INPUTS.financing, ...(inp.financing || {}) };
  inp.effect = { ...DEFAULT_PROJECT_INPUTS.effect, ...(inp.effect || {}) };
  const N = Math.max(1, Math.min(60, Math.round(Number(inp.general.horizon) || 5)));
  inp.general.horizon = N;
  const n = N + 1;
  for (const k of ['revenue', 'fixedCosts', 'savings', 'otherCapex']) inp.effect[k] = fitSeries(inp.effect[k], n);
  inp.capex.items = (inp.capex.items || []).map((it) => ({
    name: it.name || 'Объект',
    amount: Number(it.amount) || 0,
    period: Math.max(0, Math.min(N, Math.round(Number(it.period) || 0))),
    life: Math.max(1, Number(it.life) || 5),
    method: it.method === 'declining' ? 'declining' : 'linear',
  }));
  inp.financing.loans = (inp.financing.loans || []).map((l) => ({
    name: l.name || 'Кредит',
    amount: Number(l.amount) || 0,
    rate: Number(l.rate) || 0,
    term: Math.max(1, Math.round(Number(l.term) || 1)),
    type: ['annuity', 'equal', 'bullet'].includes(l.type) ? l.type : 'annuity',
    start: Math.max(0, Math.min(N, Math.round(Number(l.start) || 0))),
    grace: Math.max(0, Math.round(Number(l.grace) || 0)),
  }));
  inp.capex.liquidation = { mode: 'residual', value: 0, ...(inp.capex.liquidation || {}) };
  inp.effect.terminal = { method: 'none', growth: 2, multiple: 5, ...(inp.effect.terminal || {}) };
  return inp;
}

/** Расчёт модели. Возвращает подробные ряды и показатели. */
export function computeProject(raw) {
  const inp = normalizeProjectInputs(raw);
  const g = inp.general;
  const N = g.horizon;
  const n = N + 1;
  const r = pct(g.discountRate);
  const tax = pct(g.taxRate);
  const zeros = () => new Array(n).fill(0);

  // ---- Лист CapEx ----
  const capexSeries = zeros();
  const deprSeries = zeros();
  const capexRows = [];
  let residualTotal = 0;
  for (const it of inp.capex.items) {
    capexSeries[it.period] += it.amount;
    const { schedule, residual } = F.depreciationSchedule(it, N);
    residualTotal += residual;
    for (let t = 0; t < n; t++) deprSeries[t] += schedule[t];
    capexRows.push({ item: it, schedule, residual });
  }
  for (let t = 0; t < n; t++) capexSeries[t] += inp.effect.otherCapex[t];
  const totalInvestment = F.sum(capexSeries);

  let liquidation = 0;
  if (inp.capex.liquidation.mode === 'residual') liquidation = residualTotal;
  else if (inp.capex.liquidation.mode === 'value') liquidation = Number(inp.capex.liquidation.value) || 0;

  // ---- Лист Financing ----
  const loanRows = inp.financing.loans.map((l) => ({ loan: l, rows: F.loanSchedule({ ...l, rate: pct(l.rate) }, N) }));
  const drawdown = zeros();
  const interest = zeros();
  const principal = zeros();
  const debtBalance = zeros();
  for (const { rows } of loanRows) {
    for (let t = 0; t < n; t++) {
      drawdown[t] += rows[t].drawdown;
      interest[t] += rows[t].interest;
      principal[t] += rows[t].principal;
      debtBalance[t] += rows[t].closing;
    }
  }
  const totalDebt = F.sum(drawdown);

  // ---- Лист Effect ----
  const revenue = inp.effect.revenue;
  const vcp = pct(inp.effect.variableCostPct);
  const varCosts = revenue.map((v) => v * vcp);
  const fixedCosts = inp.effect.fixedCosts;
  const savings = inp.effect.savings;
  const ebitda = zeros();
  for (let t = 0; t < n; t++) ebitda[t] = revenue[t] - varCosts[t] - fixedCosts[t] + savings[t];
  const wcPct = pct(inp.effect.wcPctRevenue);
  const wc = revenue.map((v) => v * wcPct);
  const dWC = zeros();
  for (let t = 0; t < n; t++) dWC[t] = wc[t] - (t > 0 ? wc[t - 1] : 0);
  const wcRelease = inp.effect.releaseWC ? wc[N] : 0;

  // ---- Лист CF ----
  const ebit = ebitda.map((v, t) => v - deprSeries[t]);
  const ebt = ebit.map((v, t) => v - interest[t]);
  const taxUnlev = zeros();
  const taxLev = zeros();
  let lossU = 0;
  let lossL = 0;
  for (let t = 0; t < n; t++) {
    // налог без учёта процентов (для FCFF) и с учётом (для FCFE)
    if (g.lossCarryforward) {
      let baseU = ebit[t] - lossU;
      if (baseU < 0) {
        lossU = -baseU;
        baseU = 0;
      } else lossU = 0;
      taxUnlev[t] = baseU * tax;
      let baseL = ebt[t] - lossL;
      if (baseL < 0) {
        lossL = -baseL;
        baseL = 0;
      } else lossL = 0;
      taxLev[t] = baseL * tax;
    } else {
      taxUnlev[t] = Math.max(0, ebit[t]) * tax;
      taxLev[t] = Math.max(0, ebt[t]) * tax;
    }
  }
  const netIncome = ebt.map((v, t) => v - taxLev[t]);
  const nopat = ebit.map((v, t) => v - taxUnlev[t]);

  // терминальная стоимость
  let terminal = 0;
  const tm = inp.effect.terminal;
  const fcffPre = zeros();
  for (let t = 0; t < n; t++) fcffPre[t] = nopat[t] + deprSeries[t] - capexSeries[t] - dWC[t];
  if (tm.method === 'gordon') {
    const tv = F.gordonTerminalValue(fcffPre[N], pct(tm.growth), r);
    terminal = tv == null ? 0 : tv;
  } else if (tm.method === 'multiple') {
    terminal = ebitda[N] * (Number(tm.multiple) || 0);
  }

  const terminalSeries = zeros();
  terminalSeries[N] = liquidation + wcRelease + terminal;

  const fcff = fcffPre.map((v, t) => v + terminalSeries[t]);
  const fcfe = zeros();
  for (let t = 0; t < n; t++) {
    fcfe[t] = ebitda[t] - interest[t] - taxLev[t] - capexSeries[t] - dWC[t] + drawdown[t] - principal[t] + terminalSeries[t];
  }
  const df = F.discountFactors(r, n, { midYear: g.midYear });
  const dcf = fcff.map((v, t) => v * df[t]);
  const cumFcff = F.cumulative(fcff);
  const cumDcf = F.cumulative(dcf);
  const dcfe = fcfe.map((v, t) => v * df[t]);

  // ---- Анализ эффективности ----
  const npv = F.sum(dcf);
  const irr = F.irr(fcff);
  const reinvest = g.reinvestRate == null || g.reinvestRate === '' ? r : pct(g.reinvestRate);
  const mirr = F.mirr(fcff, r, reinvest);
  const pi = F.profitabilityIndex(r, fcff);
  const pp = F.paybackPeriod(fcff, 0);
  const dpp = F.paybackPeriod(fcff, r);
  const fundingNeed = F.fundingNeed(fcff);
  const fundingNeedDisc = F.fundingNeed(fcff, r);
  const maxDrawdown = F.maxDrawdown(fcff);
  const npvEquity = F.sum(dcfe);
  const irrEquity = F.irr(fcfe);
  const signCh = F.signChanges(fcff);
  const pvTerminal = terminal * df[N];
  const avgNI = F.sum(netIncome.slice(1)) / N;
  const arr = totalInvestment > 0 ? avgNI / totalInvestment : null;
  // DSCR
  const dscr = [];
  for (let t = 1; t < n; t++) {
    const service = interest[t] + principal[t];
    if (service > F.EPS) dscr.push({ t, value: (ebitda[t] - taxLev[t]) / service });
  }
  const minDscr = dscr.length ? Math.min(...dscr.map((d) => d.value)) : null;
  const ebitdaMargin = revenue.map((v, t) => (v > F.EPS ? ebitda[t] / v : null));

  // профиль NPV для графика
  const npvProfile = [];
  for (let rr = 0; rr <= 0.6 + 1e-9; rr += 0.05) npvProfile.push({ rate: rr, npv: F.npv(rr, fcff) });

  return {
    inputs: inp,
    N,
    n,
    periods: Array.from({ length: n }, (_, t) => t),
    labels: Array.from({ length: n }, (_, t) => periodLabel(g, t)),
    series: {
      revenue,
      varCosts,
      fixedCosts,
      savings,
      ebitda,
      ebitdaMargin,
      depreciation: deprSeries,
      ebit,
      interest,
      ebt,
      taxUnlev,
      taxLev,
      netIncome,
      nopat,
      capex: capexSeries,
      wc,
      dWC,
      terminal: terminalSeries,
      fcff,
      fcfe,
      df,
      dcf,
      dcfe,
      cumFcff,
      cumDcf,
      drawdown,
      principal,
      debtBalance,
    },
    capexRows,
    loanRows,
    kpi: {
      npv,
      irr,
      mirr,
      pi,
      pp,
      dpp,
      fundingNeed,
      fundingNeedDisc,
      maxDrawdown,
      totalInvestment,
      totalDebt,
      npvEquity,
      irrEquity,
      liquidation,
      terminal,
      pvTerminal,
      terminalShare: npv !== 0 ? pvTerminal / npv : null,
      arr,
      minDscr,
      dscr,
      signChanges: signCh,
      discountRate: r,
      reinvestRate: reinvest,
      sumFcff: F.sum(fcff),
      avgEbitdaMargin: avgOf(ebitdaMargin),
    },
    npvProfile,
  };
}

function avgOf(arr) {
  const v = arr.filter((x) => x != null);
  return v.length ? F.sum(v) / v.length : null;
}

export function periodLabel(general, t) {
  const pl = general.periodLabel || 'год';
  if (pl === 'год' && general.startYear) return String((Number(general.startYear) || 0) + t);
  if (t === 0) return 'Старт';
  return `${pl} ${t}`;
}

/**
 * Экспресс-оценка: минимальный набор входов → канонические входы проекта.
 */
export function expressToProject(e) {
  const N = Math.max(1, Math.round(Number(e.years) || 5));
  const n = N + 1;
  const revenue = F.growthSeries(Number(e.annualRevenue) || 0, pct(e.growth), n);
  const fixed = F.growthSeries(Number(e.fixedCosts) || 0, pct(e.costGrowth ?? 0), n);
  return normalizeProjectInputs({
    general: {
      name: e.name || 'Экспресс-оценка',
      unit: e.unit || 'тыс. руб.',
      horizon: N,
      discountRate: Number(e.discountRate) || 0,
      taxRate: Number(e.taxRate) || 0,
      startYear: e.startYear || new Date().getFullYear(),
    },
    capex: {
      items: [{ name: 'Инвестиции', amount: Number(e.investment) || 0, period: 0, life: N, method: 'linear' }],
      liquidation: { mode: 'residual' },
    },
    financing: { loans: [] },
    effect: {
      revenue,
      variableCostPct: Number(e.variableCostPct) || 0,
      fixedCosts: fixed,
      savings: new Array(n).fill(0),
      otherCapex: new Array(n).fill(0),
      wcPctRevenue: Number(e.wcPctRevenue) || 0,
      releaseWC: true,
      terminal: { method: 'none' },
    },
  });
}
