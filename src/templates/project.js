/**
 * Шаблоны «Инвестиции → Расчёт инвестиционных показателей»:
 *  - express: экспресс-оценка (уровень 1)
 *  - project: универсальная модель CapEx / Financing / Effect / CF (уровни 2–3)
 */
import { computeProject, expressToProject, DEFAULT_PROJECT_INPUTS } from '../engine/project.js';
import * as F from '../engine/finance.js';
import { deepClone } from '../engine/utils.js';

const PERIOD_OPTIONS = [
  { value: 'год', label: 'Год' },
  { value: 'квартал', label: 'Квартал' },
  { value: 'месяц', label: 'Месяц' },
];

export const PROJECT_DRIVERS = [
  { path: 'effect.revenue', label: 'Выручка', mode: 'scale' },
  { path: 'effect.variableCostPct', label: 'Доля переменных затрат', mode: 'scale' },
  { path: 'effect.fixedCosts', label: 'Постоянные затраты', mode: 'scale' },
  { path: 'capex.items', label: 'Капитальные вложения', mode: 'scale', itemKey: 'amount' },
  { path: 'general.discountRate', label: 'Ставка дисконтирования, п.п.', mode: 'shift', shiftScale: 10 },
  { path: 'general.taxRate', label: 'Ставка налога, п.п.', mode: 'shift', shiftScale: 10 },
  { path: 'effect.wcPctRevenue', label: 'Оборотный капитал, % выручки', mode: 'scale' },
];

export const PROJECT_METRICS = [
  { key: 'npv', label: 'NPV', fmt: 'money' },
  { key: 'irr', label: 'IRR', fmt: 'pct' },
  { key: 'pi', label: 'PI', fmt: 'ratio' },
  { key: 'dpp', label: 'DPP', fmt: 'years' },
  { key: 'npvEquity', label: 'NPV для собственника', fmt: 'money' },
];

function kpiList(res) {
  const k = res.kpi;
  const r = k.discountRate;
  const N = res.N;
  return [
    { key: 'npv', label: 'NPV — чистая приведённая стоимость', value: k.npv, fmt: 'money', good: k.npv > 0, hint: 'Σ дисконтированных FCFF. Проект эффективен при NPV > 0.' },
    { key: 'irr', label: 'IRR — внутренняя норма доходности', value: k.irr, fmt: 'pct', good: k.irr != null ? k.irr > r : null, hint: k.signChanges > 1 ? 'Поток меняет знак несколько раз — IRR может иметь несколько корней, ориентируйтесь на MIRR.' : 'Ставка, при которой NPV = 0. Сравнивайте со ставкой дисконтирования (WACC).' },
    { key: 'mirr', label: 'MIRR — модифицированная IRR', value: k.mirr, fmt: 'pct', good: k.mirr != null ? k.mirr > r : null, hint: `Реинвестирование по ставке ${(k.reinvestRate * 100).toFixed(1)} %.` },
    { key: 'pi', label: 'PI — индекс рентабельности', value: k.pi, fmt: 'ratio', good: k.pi != null ? k.pi > 1 : null, hint: 'PV притоков / PV оттоков. Эффективен при PI > 1.' },
    { key: 'pp', label: 'PP — простой срок окупаемости', value: k.pp, fmt: 'years', good: k.pp != null ? k.pp <= N : false, hint: 'Период, когда накопленный FCFF становится ≥ 0.' },
    { key: 'dpp', label: 'DPP — дисконтированный срок окупаемости', value: k.dpp, fmt: 'years', good: k.dpp != null ? k.dpp <= N : false, hint: 'Период, когда накопленный DCF становится ≥ 0.' },
    { key: 'fundingNeed', label: 'ПФ — потребность в финансировании', value: k.fundingNeed, fmt: 'money', good: null, hint: 'Сумма отрицательных чистых потоков по периодам.' },
    { key: 'fundingNeedDisc', label: 'ДПФ — дисконтированная потребность', value: k.fundingNeedDisc, fmt: 'money', good: null },
    { key: 'maxDrawdown', label: 'Макс. накопленный минус (кассовый разрыв)', value: k.maxDrawdown, fmt: 'money', good: null },
    { key: 'totalInvestment', label: 'Инвестиции всего', value: k.totalInvestment, fmt: 'money', good: null },
    { key: 'arr', label: 'ARR — простая рентабельность инвестиций', value: k.arr, fmt: 'pct', good: null, hint: 'Средняя чистая прибыль / инвестиции.' },
    { key: 'avgEbitdaMargin', label: 'Средняя рентабельность по EBITDA', value: k.avgEbitdaMargin, fmt: 'pct', good: null },
    ...(k.totalDebt > 0
      ? [
          { key: 'npvEquity', label: 'NPV для собственника (FCFE)', value: k.npvEquity, fmt: 'money', good: k.npvEquity > 0, hint: 'Поток на собственный капитал с учётом кредитов, дисконтирован по той же ставке.' },
          { key: 'irrEquity', label: 'IRR собственного капитала', value: k.irrEquity, fmt: 'pct', good: null },
          { key: 'minDscr', label: 'Мин. DSCR — покрытие долга', value: k.minDscr, fmt: 'ratio', good: k.minDscr != null ? k.minDscr >= 1.2 : null, hint: '(EBITDA − налог) / (проценты + погашение). Норматив банков ≥ 1.2–1.3.' },
        ]
      : []),
    ...(k.terminal > 0 ? [{ key: 'pvTerminal', label: 'PV терминальной стоимости', value: k.pvTerminal, fmt: 'money', good: null, hint: k.terminalShare != null ? (k.terminalShare > 1 ? `Без неё NPV = ${formatMoney(k.npv - k.pvTerminal)}` : `Доля в NPV: ${(k.terminalShare * 100).toFixed(0)} %`) : '' }] : []),
  ];
}

function cfTable(res) {
  const s = res.series;
  const rows = [];
  const push = (label, arr, style) => rows.push({ label, values: arr, style });
  push('Выручка', s.revenue);
  push('Переменные затраты', s.varCosts.map((v) => -v));
  push('Постоянные затраты', s.fixedCosts.map((v) => -v));
  if (s.savings.some((v) => v)) push('Экономия / прочие эффекты', s.savings);
  push('EBITDA', s.ebitda, 'subtotal');
  push('Амортизация', s.depreciation.map((v) => -v));
  push('EBIT', s.ebit, 'subtotal');
  push('Налог на прибыль (без учёта процентов)', s.taxUnlev.map((v) => -v));
  push('NOPAT', s.nopat, 'subtotal');
  push('+ Амортизация', s.depreciation);
  push('− Капитальные вложения', s.capex.map((v) => -v));
  push('− Прирост оборотного капитала', s.dWC.map((v) => -v));
  push('+ Ликвидационная / терминальная стоимость', s.terminal);
  push('FCFF — свободный денежный поток проекта', s.fcff, 'total');
  push('Накопленный FCFF', s.cumFcff);
  push('Коэффициент дисконтирования', s.df, 'factor');
  push('DCF — дисконтированный поток', s.dcf, 'total');
  push('Накопленный DCF', s.cumDcf);
  if (res.kpi.totalDebt > 0) {
    push('Получение кредитов', s.drawdown);
    push('Проценты', s.interest.map((v) => -v));
    push('Погашение основного долга', s.principal.map((v) => -v));
    push('Налог на прибыль (с учётом процентов)', s.taxLev.map((v) => -v));
    push('FCFE — поток на собственный капитал', s.fcfe, 'total');
    push('Остаток долга', s.debtBalance);
  }
  return {
    id: 'cf',
    title: 'Лист «CF» — денежные потоки',
    columns: [{ label: 'Показатель', fmt: 'text' }, ...res.labels.map((l) => ({ label: l, fmt: 'money' }))],
    rows: rows.map((r) => ({ cells: [r.label, ...r.values], style: r.style, fmt: r.style === 'factor' ? 'factor' : 'money' })),
    unit: res.inputs.general.unit,
  };
}

function effectTable(res) {
  const s = res.series;
  const rows = [
    { cells: ['Выручка', ...s.revenue] },
    { cells: ['Переменные затраты', ...s.varCosts] },
    { cells: ['Постоянные затраты', ...s.fixedCosts] },
    { cells: ['Экономия / прочие эффекты', ...s.savings] },
    { cells: ['EBITDA', ...s.ebitda], style: 'total' },
    { cells: ['Рентабельность по EBITDA', ...s.ebitdaMargin], fmt: 'pct' },
    { cells: ['Оборотный капитал', ...s.wc] },
    { cells: ['Прирост оборотного капитала', ...s.dWC] },
  ];
  return { id: 'effect', title: 'Лист «Effect» — операционный эффект', columns: [{ label: 'Показатель', fmt: 'text' }, ...res.labels.map((l) => ({ label: l, fmt: 'money' }))], rows, unit: res.inputs.general.unit };
}

function capexTable(res) {
  const rows = res.capexRows.map(({ item, schedule, residual }) => ({
    cells: [`${item.name} (${item.amount}, ${item.method === 'linear' ? 'линейно' : 'ускоренно'}, СПИ ${item.life})`, ...schedule, residual],
  }));
  rows.push({ cells: ['Итого амортизация', ...res.series.depreciation, res.kpi.liquidation], style: 'total' });
  rows.push({ cells: ['Капитальные вложения (график)', ...res.series.capex, null], style: 'subtotal' });
  return {
    id: 'capex',
    title: 'Лист «CapEx» — инвестиции и амортизация',
    columns: [{ label: 'Объект', fmt: 'text' }, ...res.labels.map((l) => ({ label: l, fmt: 'money' })), { label: 'Остаточная стоимость', fmt: 'money' }],
    rows,
    unit: res.inputs.general.unit,
  };
}

function financingTable(res) {
  if (!res.loanRows.length) return null;
  const rows = [];
  for (const { loan, rows: lr } of res.loanRows) {
    rows.push({ cells: [`${loan.name}: ${loan.amount} под ${loan.rate} %, ${loan.term} пер., ${loan.type === 'annuity' ? 'аннуитет' : loan.type === 'equal' ? 'дифференцированный' : 'в конце срока'}`], style: 'header' });
    rows.push({ cells: ['  Получение', ...lr.map((r) => r.drawdown)] });
    rows.push({ cells: ['  Проценты', ...lr.map((r) => r.interest)] });
    rows.push({ cells: ['  Погашение', ...lr.map((r) => r.principal)] });
    rows.push({ cells: ['  Остаток на конец', ...lr.map((r) => r.closing)] });
  }
  rows.push({ cells: ['Итого обслуживание долга', ...res.series.interest.map((v, t) => v + res.series.principal[t])], style: 'total' });
  if (res.kpi.dscr.length) {
    const d = new Array(res.n).fill(null);
    for (const x of res.kpi.dscr) d[x.t] = x.value;
    rows.push({ cells: ['DSCR', ...d], fmt: 'ratio' });
  }
  return { id: 'financing', title: 'Лист «Financing» — кредиты', columns: [{ label: 'Показатель', fmt: 'text' }, ...res.labels.map((l) => ({ label: l, fmt: 'money' }))], rows, unit: res.inputs.general.unit };
}

function charts(res) {
  const s = res.series;
  return [
    {
      id: 'cf',
      title: 'Денежные потоки и накопленный DCF',
      type: 'mixed',
      labels: res.labels,
      datasets: [
        { label: 'FCFF', data: s.fcff, type: 'bar' },
        { label: 'DCF', data: s.dcf, type: 'bar' },
        { label: 'Накопленный DCF', data: s.cumDcf, type: 'line' },
      ],
    },
    {
      id: 'pl',
      title: 'Выручка, затраты и EBITDA',
      type: 'mixed',
      labels: res.labels,
      datasets: [
        { label: 'Выручка', data: s.revenue, type: 'bar' },
        { label: 'Затраты', data: s.varCosts.map((v, t) => v + s.fixedCosts[t]), type: 'bar' },
        { label: 'EBITDA', data: s.ebitda, type: 'line' },
      ],
    },
    {
      id: 'npvProfile',
      title: 'Профиль NPV (зависимость от ставки)',
      type: 'line',
      labels: res.npvProfile.map((p) => `${Math.round(p.rate * 100)} %`),
      datasets: [{ label: 'NPV', data: res.npvProfile.map((p) => p.npv) }],
      zeroLine: true,
    },
  ];
}

export function projectConclusion(res) {
  const k = res.kpi;
  const u = res.inputs.general.unit;
  const r = k.discountRate * 100;
  const out = [];
  const f = (v) => formatMoney(v) + ' ' + u;
  if (k.npv > 0) out.push(`NPV положительный: ${f(k.npv)} при ставке ${r.toFixed(1)} %. Проект создаёт стоимость сверх требуемой доходности.`);
  else out.push(`NPV отрицательный: ${f(k.npv)} при ставке ${r.toFixed(1)} %. В текущих допущениях проект не окупает стоимость капитала.`);
  if (k.irr != null) {
    const diff = (k.irr - k.discountRate) * 100;
    out.push(`IRR = ${(k.irr * 100).toFixed(1)} %, запас по отношению к ставке дисконтирования ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} п.п.${Math.abs(diff) < 3 ? ' Запас небольшой — результат чувствителен к допущениям.' : ''}`);
  } else out.push('IRR не определён (поток не меняет знак или имеет несколько корней). Используйте NPV и MIRR.');
  if (k.signChanges > 1) out.push(`Внимание: чистый поток меняет знак ${k.signChanges} раза — у уравнения IRR может быть несколько корней. MIRR = ${k.mirr != null ? (k.mirr * 100).toFixed(1) + ' %' : '—'}.`);
  if (k.pi != null) out.push(`Индекс рентабельности PI = ${k.pi.toFixed(2)}: на каждый рубль инвестиций проект возвращает ${k.pi.toFixed(2)} руб. приведённых притоков.`);
  if (k.pp != null) out.push(`Простой срок окупаемости ${fmtYears(k.pp, res.inputs.general.periodLabel)}, дисконтированный — ${k.dpp != null ? fmtYears(k.dpp, res.inputs.general.periodLabel) : 'не достигается в горизонте ' + res.N}.`);
  else out.push(`Проект не окупается в горизонте ${res.N} периодов даже без дисконтирования.`);
  out.push(`Потребность в финансировании: ${f(k.fundingNeed)} (дисконтированная ${f(k.fundingNeedDisc)}); максимальный накопленный минус ${f(k.maxDrawdown)}.`);
  if (k.totalDebt > 0) {
    out.push(`С учётом кредитов (${f(k.totalDebt)}) NPV для собственника = ${f(k.npvEquity)}, IRR собственного капитала ${k.irrEquity != null ? (k.irrEquity * 100).toFixed(1) + ' %' : '—'}. Минимальный DSCR ${k.minDscr != null ? k.minDscr.toFixed(2) : '—'}${k.minDscr != null && k.minDscr < 1.2 ? ' — ниже банковского норматива 1.2, есть риск кассового разрыва при обслуживании долга' : ''}.`);
  }
  if (k.terminal > 0 && k.terminalShare != null && k.terminalShare > 0.5) {
    const npvWithout = k.npv - k.pvTerminal;
    out.push(k.terminalShare > 1 ? `Без терминальной стоимости NPV отрицательный (${f(npvWithout)}): весь положительный результат формирует постпрогнозный период — он сильно зависит от допущений о темпе роста и ставке.` : `${(k.terminalShare * 100).toFixed(0)} % NPV формирует терминальная стоимость — результат сильно зависит от допущений о постпрогнозном периоде.`);
  }
  return out;
}

export function formatMoney(v) {
  if (v == null || !isFinite(v)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }).format(v);
}

export function fmtYears(v, unit = 'год') {
  if (v == null) return '—';
  const words = { год: ['года', 'лет'], квартал: ['квартала', 'кварталов'], месяц: ['месяца', 'месяцев'] }[unit] || ['пер.', 'пер.'];
  return `${v.toFixed(1)} ${words[1]}`;
}

/** ---------- Универсальная модель ---------- */
export const projectTemplate = {
  id: 'project',
  category: 'invest',
  subcategory: 'Расчёт инвестиционных показателей',
  title: 'Универсальная модель оценки инвестиционного проекта',
  short: 'CapEx → Financing → Effect → CF → NPV, IRR, PI, DPP, чувствительность',
  description:
    'Методика «Как оценить инвестиционный проект»: четыре расчётных листа и анализ эффективности. Уровень «Базовая» — инвестиции, выручка, затраты; уровень «Расширенная» — кредиты, оборотный капитал, терминальная стоимость, перенос убытков.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['NPV', 'IRR', 'PI', 'DPP', 'DSCR', 'FCFF', 'FCFE'],
  drivers: PROJECT_DRIVERS,
  metrics: PROJECT_METRICS,
  periodsPath: 'general.horizon',
  schema: [
    {
      id: 'general',
      title: 'Общие параметры',
      level: 'basic',
      fields: [
        { key: 'general.name', label: 'Название проекта', type: 'text' },
        { key: 'general.unit', label: 'Единица измерения', type: 'select', options: ['тыс. руб.', 'млн руб.', 'руб.', 'тыс. $', 'тыс. €'].map((v) => ({ value: v, label: v })) },
        { key: 'general.periodLabel', label: 'Период', type: 'select', options: PERIOD_OPTIONS },
        { key: 'general.startYear', label: 'Год старта (t = 0)', type: 'int', min: 2000, max: 2100 },
        { key: 'general.horizon', label: 'Горизонт, периодов', type: 'int', min: 1, max: 40, help: 'Число операционных периодов после старта. Ряды ниже пересчитываются по длине.' },
        { key: 'general.discountRate', label: 'Ставка дисконтирования', type: 'percent', min: 0, max: 100, step: 0.5, help: 'Обычно WACC инвестора. Рассчитать можно шаблоном «Расчёт WACC».' },
        { key: 'general.taxRate', label: 'Налог на прибыль', type: 'percent', min: 0, max: 60 },
        { key: 'general.lossCarryforward', label: 'Переносить убытки на будущие периоды', type: 'bool', level: 'pro' },
        { key: 'general.midYear', label: 'Дисконтировать на середину периода', type: 'bool', level: 'pro' },
        { key: 'general.reinvestRate', label: 'Ставка реинвестирования для MIRR (пусто = ставка дисконтирования)', type: 'percent', level: 'pro', optional: true },
      ],
    },
    {
      id: 'capex',
      title: 'Лист «CapEx» — инвестиции',
      level: 'basic',
      fields: [
        {
          key: 'capex.items',
          label: 'Объекты капитальных вложений',
          type: 'items',
          itemFields: [
            { key: 'name', label: 'Объект', type: 'text' },
            { key: 'amount', label: 'Сумма', type: 'number' },
            { key: 'period', label: 'Период (t)', type: 'int', min: 0 },
            { key: 'life', label: 'СПИ, периодов', type: 'int', min: 1 },
            { key: 'method', label: 'Амортизация', type: 'select', options: [{ value: 'linear', label: 'Линейная' }, { value: 'declining', label: 'Уменьшаемого остатка' }] },
          ],
          newItem: () => ({ name: 'Объект', amount: 0, period: 0, life: 5, method: 'linear' }),
        },
        { key: 'effect.otherCapex', label: 'Прочие инвестиции без амортизации (по периодам)', type: 'series', level: 'pro' },
        { key: 'capex.liquidation.mode', label: 'Ликвидационная стоимость в конце горизонта', type: 'select', level: 'pro', options: [{ value: 'none', label: 'Не учитывать' }, { value: 'residual', label: 'Остаточная стоимость объектов' }, { value: 'value', label: 'Задать сумму' }] },
        { key: 'capex.liquidation.value', label: 'Сумма ликвидационной стоимости', type: 'number', level: 'pro', showIf: { path: 'capex.liquidation.mode', equals: 'value' } },
      ],
    },
    {
      id: 'financing',
      title: 'Лист «Financing» — кредиты',
      level: 'pro',
      fields: [
        {
          key: 'financing.loans',
          label: 'Кредиты и займы',
          type: 'items',
          itemFields: [
            { key: 'name', label: 'Кредит', type: 'text' },
            { key: 'amount', label: 'Сумма', type: 'number' },
            { key: 'rate', label: 'Ставка, % за период', type: 'number', step: 0.5 },
            { key: 'term', label: 'Срок, периодов', type: 'int', min: 1 },
            { key: 'start', label: 'Период выдачи (t)', type: 'int', min: 0 },
            { key: 'grace', label: 'Отсрочка тела, пер.', type: 'int', min: 0 },
            { key: 'type', label: 'Тип', type: 'select', options: [{ value: 'annuity', label: 'Аннуитет' }, { value: 'equal', label: 'Дифференцированный' }, { value: 'bullet', label: 'Погашение в конце' }] },
          ],
          newItem: () => ({ name: 'Кредит', amount: 0, rate: 18, term: 5, start: 0, grace: 0, type: 'annuity' }),
        },
      ],
    },
    {
      id: 'effect',
      title: 'Лист «Effect» — операционный эффект',
      level: 'basic',
      fields: [
        { key: 'effect.revenue', label: 'Выручка (по периодам)', type: 'series' },
        { key: 'effect.variableCostPct', label: 'Переменные затраты, % от выручки', type: 'percent', min: 0, max: 100 },
        { key: 'effect.fixedCosts', label: 'Постоянные затраты (по периодам)', type: 'series' },
        { key: 'effect.savings', label: 'Экономия / прочие эффекты (по периодам)', type: 'series', level: 'pro', help: 'Для проектов замены оборудования и оптимизации: положительный эффект без выручки.' },
        { key: 'effect.wcPctRevenue', label: 'Оборотный капитал, % от выручки', type: 'percent', level: 'pro', min: 0, max: 100 },
        { key: 'effect.releaseWC', label: 'Высвобождать оборотный капитал в конце', type: 'bool', level: 'pro' },
        { key: 'effect.terminal.method', label: 'Терминальная стоимость', type: 'select', level: 'pro', options: [{ value: 'none', label: 'Не учитывать' }, { value: 'gordon', label: 'Модель Гордона (бессрочный рост)' }, { value: 'multiple', label: 'Мультипликатор к EBITDA' }] },
        { key: 'effect.terminal.growth', label: 'Темп роста в постпрогнозном периоде', type: 'percent', level: 'pro', showIf: { path: 'effect.terminal.method', equals: 'gordon' } },
        { key: 'effect.terminal.multiple', label: 'Мультипликатор EV/EBITDA', type: 'number', level: 'pro', showIf: { path: 'effect.terminal.method', equals: 'multiple' } },
      ],
    },
  ],
  samples: [
    { id: 'base', name: 'Базовый пример: новое производство', inputs: deepClone(DEFAULT_PROJECT_INPUTS) },
    {
      id: 'farm',
      name: 'Агрохолдинг: покупка фермы (пример из методики)',
      inputs: {
        general: { name: 'Покупка фермы', unit: 'млн руб.', periodLabel: 'год', startYear: 2026, horizon: 9, discountRate: 15, taxRate: 0, lossCarryforward: true },
        capex: {
          items: [
            { name: 'Ферма', amount: 150, period: 0, life: 20, method: 'linear' },
            { name: 'Поголовье, партия 1', amount: 120, period: 0, life: 20, method: 'linear' },
            { name: 'Поголовье, партия 2', amount: 120, period: 1, life: 20, method: 'linear' },
          ],
          liquidation: { mode: 'none' },
        },
        financing: { loans: [] },
        effect: { revenue: [0, 150, 150, 150, 150, 150, 150, 150, 150, 150], variableCostPct: 0, fixedCosts: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50], savings: [], otherCapex: [], wcPctRevenue: 0, releaseWC: false, terminal: { method: 'none' } },
      },
    },
    {
      id: 'replace',
      name: 'Замена оборудования: эффект от экономии',
      inputs: {
        general: { name: 'Замена линии розлива', unit: 'тыс. руб.', periodLabel: 'год', startYear: 2026, horizon: 6, discountRate: 18, taxRate: 20 },
        capex: { items: [{ name: 'Новая линия', amount: 2400, period: 0, life: 6, method: 'linear' }], liquidation: { mode: 'value', value: 300 } },
        financing: { loans: [] },
        effect: { revenue: [0, 0, 0, 0, 0, 0, 0], variableCostPct: 0, fixedCosts: [0, 120, 125, 130, 135, 140, 145], savings: [0, 900, 950, 1000, 1050, 1100, 1150], otherCapex: [], wcPctRevenue: 0, releaseWC: false, terminal: { method: 'none' } },
      },
    },
    {
      id: 'leveraged',
      name: 'Проект с кредитом и терминальной стоимостью',
      inputs: {
        general: { name: 'Логистический хаб', unit: 'млн руб.', periodLabel: 'год', startYear: 2026, horizon: 7, discountRate: 16, taxRate: 20, lossCarryforward: true },
        capex: { items: [{ name: 'Строительство', amount: 900, period: 0, life: 20, method: 'linear' }, { name: 'Оборудование', amount: 300, period: 1, life: 8, method: 'linear' }], liquidation: { mode: 'none' } },
        financing: { loans: [{ name: 'Проектный кредит', amount: 700, rate: 17, term: 7, start: 0, grace: 1, type: 'annuity' }] },
        effect: { revenue: [0, 350, 600, 720, 780, 820, 860, 900], variableCostPct: 35, fixedCosts: [20, 150, 160, 170, 175, 180, 185, 190], savings: [], otherCapex: [], wcPctRevenue: 8, releaseWC: true, terminal: { method: 'gordon', growth: 3 } },
      },
    },
  ],
  defaultScenarios: () => [
    { name: 'Базовый', probability: 0.5, changes: [] },
    { name: 'Пессимистичный', probability: 0.3, changes: [{ path: 'effect.revenue', mode: 'scale', value: -0.15 }, { path: 'capex.items', mode: 'scale', itemKey: 'amount', value: 0.1 }, { path: 'effect.fixedCosts', mode: 'scale', value: 0.1 }] },
    { name: 'Оптимистичный', probability: 0.2, changes: [{ path: 'effect.revenue', mode: 'scale', value: 0.15 }, { path: 'effect.variableCostPct', mode: 'scale', value: -0.05 }] },
  ],
  defaultMonteCarlo: () => [
    { driver: PROJECT_DRIVERS[0], dist: 'triangular', min: -0.25, mode: 0, max: 0.15 },
    { driver: PROJECT_DRIVERS[1], dist: 'triangular', min: -0.1, mode: 0, max: 0.15 },
    { driver: PROJECT_DRIVERS[3], dist: 'triangular', min: -0.05, mode: 0, max: 0.25 },
    { driver: PROJECT_DRIVERS[4], dist: 'uniform', min: -2, max: 3 },
  ],
  compute(inputs) {
    const res = computeProject(inputs);
    return {
      raw: res,
      kpis: kpiList(res),
      tables: [capexTable(res), financingTable(res), effectTable(res), cfTable(res)].filter(Boolean),
      charts: charts(res),
      conclusion: projectConclusion(res),
      flows: res.series.fcff,
      labels: res.labels,
      unit: res.inputs.general.unit,
      metric: res.kpi,
    };
  },
  metric(inputs, key = 'npv') {
    return computeProject(inputs).kpi[key];
  },
  normalize(inputs) {
    return computeProject(inputs).inputs;
  },
};

/** ---------- Экспресс-оценка ---------- */
export const EXPRESS_DRIVERS = [
  { path: 'annualRevenue', label: 'Выручка', mode: 'scale' },
  { path: 'variableCostPct', label: 'Доля переменных затрат', mode: 'scale' },
  { path: 'fixedCosts', label: 'Постоянные затраты', mode: 'scale' },
  { path: 'investment', label: 'Инвестиции', mode: 'scale' },
  { path: 'discountRate', label: 'Ставка дисконтирования, п.п.', mode: 'shift', shiftScale: 10 },
];

export const expressTemplate = {
  id: 'express',
  category: 'invest',
  subcategory: 'Расчёт инвестиционных показателей',
  title: 'Экспресс-оценка проекта',
  short: 'Семь чисел → NPV, IRR, PI и срок окупаемости за минуту',
  description: 'Верхнеуровневая модель: инвестиции, годовая выручка и её рост, структура затрат, горизонт и ставка. Подходит для первичного отбора идей перед детальным моделированием.',
  levels: ['express'],
  minLevel: 'express',
  tags: ['NPV', 'IRR', 'быстро'],
  drivers: EXPRESS_DRIVERS,
  metrics: PROJECT_METRICS.slice(0, 4),
  schema: [
    {
      id: 'main',
      title: 'Исходные данные',
      level: 'express',
      fields: [
        { key: 'name', label: 'Название', type: 'text' },
        { key: 'unit', label: 'Единица измерения', type: 'select', options: ['тыс. руб.', 'млн руб.', 'руб.'].map((v) => ({ value: v, label: v })) },
        { key: 'investment', label: 'Инвестиции (в момент старта)', type: 'number', min: 0 },
        { key: 'annualRevenue', label: 'Выручка в первый год', type: 'number', min: 0 },
        { key: 'growth', label: 'Рост выручки в год', type: 'percent', min: -50, max: 200 },
        { key: 'variableCostPct', label: 'Переменные затраты, % от выручки', type: 'percent', min: 0, max: 100 },
        { key: 'fixedCosts', label: 'Постоянные затраты в год', type: 'number', min: 0 },
        { key: 'years', label: 'Горизонт, лет', type: 'int', min: 1, max: 30 },
        { key: 'discountRate', label: 'Ставка дисконтирования', type: 'percent', min: 0, max: 100, step: 0.5 },
        { key: 'taxRate', label: 'Налог на прибыль', type: 'percent', min: 0, max: 60 },
        { key: 'wcPctRevenue', label: 'Оборотный капитал, % от выручки', type: 'percent', min: 0, max: 100 },
      ],
    },
  ],
  samples: [
    { id: 'cafe', name: 'Кофейня у метро', inputs: { name: 'Кофейня', unit: 'тыс. руб.', investment: 3500, annualRevenue: 6000, growth: 8, variableCostPct: 45, fixedCosts: 2200, years: 5, discountRate: 20, taxRate: 20, wcPctRevenue: 3 } },
    { id: 'saas', name: 'SaaS-сервис для продаж', inputs: { name: 'SaaS для отдела продаж', unit: 'тыс. руб.', investment: 12000, annualRevenue: 6000, growth: 60, variableCostPct: 25, fixedCosts: 4500, years: 5, discountRate: 30, taxRate: 20, wcPctRevenue: 5 } },
    { id: 'fd', name: 'Пример fd.ru: 1 000 000 → 250 000 × 5 лет', inputs: { name: 'Пример из статьи', unit: 'руб.', investment: 1000000, annualRevenue: 250000, growth: 0, variableCostPct: 0, fixedCosts: 0, years: 5, discountRate: 10, taxRate: 0, wcPctRevenue: 0 } },
  ],
  defaultScenarios: () => [
    { name: 'Базовый', probability: 0.5, changes: [] },
    { name: 'Пессимистичный', probability: 0.3, changes: [{ path: 'annualRevenue', mode: 'scale', value: -0.2 }, { path: 'investment', mode: 'scale', value: 0.1 }] },
    { name: 'Оптимистичный', probability: 0.2, changes: [{ path: 'annualRevenue', mode: 'scale', value: 0.2 }] },
  ],
  defaultMonteCarlo: () => [
    { driver: EXPRESS_DRIVERS[0], dist: 'triangular', min: -0.3, mode: 0, max: 0.2 },
    { driver: EXPRESS_DRIVERS[2], dist: 'triangular', min: -0.1, mode: 0, max: 0.2 },
    { driver: EXPRESS_DRIVERS[3], dist: 'triangular', min: -0.05, mode: 0, max: 0.3 },
  ],
  toProject: (inputs) => expressToProject(inputs),
  compute(inputs) {
    const res = computeProject(expressToProject(inputs));
    const kpis = kpiList(res).filter((k) => ['npv', 'irr', 'pi', 'pp', 'dpp', 'fundingNeed', 'totalInvestment', 'arr'].includes(k.key));
    return {
      raw: res,
      kpis,
      tables: [cfTable(res)],
      charts: charts(res).slice(0, 1).concat(charts(res).slice(2)),
      conclusion: projectConclusion(res),
      flows: res.series.fcff,
      labels: res.labels,
      unit: inputs.unit || 'тыс. руб.',
      metric: res.kpi,
    };
  },
  metric(inputs, key = 'npv') {
    return computeProject(expressToProject(inputs)).kpi[key];
  },
};

export { F };
