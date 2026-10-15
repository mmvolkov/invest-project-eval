/**
 * Шаблон «Экономическая добавленная стоимость (EVA)».
 * Методика: Система «Финансовый директор», «EVA: как рассчитать экономическую добавленную стоимость»
 * (М. Верхотурова) и Excel-модель к ней (листы «ПиУ», «Баланс», «EVA», 14 корректировок Stern Stewart).
 *
 *   EVA = NOPATскорр − WACC × ICскорр = (ROIC − WACC) × ICскорр
 *   NOPATскорр = (EBIT + корректировки прибыли) × (1 − T)
 *   ICскорр    = Собственный капитал + Процентный долг + корректировки капитала (среднегодовая величина)
 *   Факторный анализ ΔEVA методом цепных подстановок: влияние IC, ROIC и WACC.
 *   Стоимость бизнеса (формула 3 методики): NA0 + Σ EVAt / (1+d)^t + EVAn·(1+g) / ((d−g)(1+d)^n).
 *
 * Уровни:
 *   express — три ряда чисел: NOPAT, инвестированный капитал и WACC по годам (пример «Гамма» из статьи);
 *   basic   — отчёт о прибылях и убытках, баланс и ставки по капиталу: NOPAT, IC и WACC считает сервис;
 *   pro     — корректировки NOPAT и IC по методике EVA, оценка бизнеса дисконтированной EVA.
 */
import { pct, fitSeries } from '../engine/utils.js';

const m = (label, value, fmt = 'money', good = null, hint) => ({ key: label, label, value, fmt, good, hint });
const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
const fmtMoney = (v) => Math.round(v).toLocaleString('ru-RU');
const fmtPct = (v) => `${(v * 100).toFixed(1)} %`;

const ST = { path: 'inputMode', equals: 'statements' };
const DI = { path: 'inputMode', equals: 'direct' };

/** Накопленная амортизация капитализированных расходов: каждый годовой транш амортизируется линейно amortYears лет */
function accumulatedAmortization(capitalized, amortYears) {
  const N = capitalized.length;
  const years = Math.max(1, Math.round(amortYears) || 5);
  const amort = new Array(N).fill(0); // амортизация за год t
  for (let k = 0; k < N; k++) {
    const tranche = Number(capitalized[k]) || 0;
    if (!tranche) continue;
    for (let t = k; t < N && t < k + years; t++) amort[t] += tranche / years;
  }
  const acc = [];
  let a = 0;
  for (let t = 0; t < N; t++) {
    a += amort[t];
    acc.push(a);
  }
  return { amort, acc };
}

export const evaTemplate = {
  id: 'eva',
  category: 'reports',
  subcategory: 'Отчёты для оценки бизнеса',
  title: 'Экономическая добавленная стоимость (EVA)',
  short: 'NOPAT → инвестированный капитал → WACC → EVA, факторный анализ, стоимость бизнеса',
  description:
    'Показывает, сколько компания заработала сверх платы за весь капитал, собственный и заёмный. Экспресс: три ряда чисел. Базовая: отчёт о прибылях и убытках, баланс и ставки по капиталу. Расширенная: 14 корректировок отчётности по методике Stern Stewart (капитализация расходов, отложенные налоги, резервы, гудвилл, аренда, неработающие активы) и оценка стоимости бизнеса дисконтированной EVA.',
  levels: ['express', 'basic', 'pro'],
  minLevel: 'express',
  tags: ['EVA', 'NOPAT', 'ROIC', 'WACC'],
  drivers: [
    { path: 'nopat', label: 'NOPAT (экспресс)', mode: 'scale' },
    { path: 'ic', label: 'Инвестированный капитал (экспресс)', mode: 'scale' },
    { path: 'wacc', label: 'WACC, п.п. (экспресс)', mode: 'shift', shiftScale: 10 },
    { path: 'revenue', label: 'Выручка', mode: 'scale' },
    { path: 'cogs', label: 'Себестоимость', mode: 'scale' },
    { path: 'opex', label: 'Операционные расходы', mode: 'scale' },
    { path: 're', label: 'Ставка по собственному капиталу, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'rd', label: 'Ставка по заёмному капиталу, п.п.', mode: 'shift', shiftScale: 10 },
  ],
  metrics: [
    { key: 'eva', label: 'EVA последнего года', fmt: 'money' },
    { key: 'spread', label: 'Спред ROIC − WACC', fmt: 'pct' },
    { key: 'evaTotal', label: 'EVA за все годы', fmt: 'money' },
  ],
  schema: [
    {
      id: 'g',
      title: 'Общие параметры',
      level: 'express',
      fields: [
        { key: 'name', label: 'Компания', type: 'text' },
        { key: 'unit', label: 'Единица измерения', type: 'select', options: ['тыс. руб.', 'млн руб.', 'руб.'].map((v) => ({ value: v, label: v })) },
        { key: 'startYear', label: 'Первый год расчёта', type: 'int', min: 2000, max: 2100 },
        { key: 'years', label: 'Число лет (1–5)', type: 'int', min: 1, max: 5 },
        {
          key: 'inputMode',
          label: 'Источник данных',
          type: 'select',
          level: 'basic',
          options: [
            { value: 'direct', label: 'Готовые NOPAT, капитал и WACC по годам (экспресс)' },
            { value: 'statements', label: 'Отчёт о прибылях и убытках, баланс и ставки по капиталу' },
          ],
        },
        { key: 'taxRate', label: 'Ставка налога на прибыль', type: 'percent', min: 0, max: 60, showIf: ST },
      ],
    },
    {
      id: 'direct',
      title: 'Готовые показатели по годам',
      level: 'express',
      fields: [
        { key: 'nopat', label: 'Чистая операционная прибыль после налогов NOPAT (по годам)', type: 'series', lengthFrom: 'years', showIf: DI, help: 'EBIT минус налог на прибыль по действующей ставке. Для динамики возьмите 3–5 лет.' },
        { key: 'ic', label: 'Инвестированный капитал IC, среднегодовой (по годам)', type: 'series', lengthFrom: 'years', showIf: DI, help: 'Собственный капитал плюс платные кредиты и займы: среднее на начало и конец года. Кредиторскую задолженность не включайте.' },
        { key: 'wacc', label: 'Средневзвешенная стоимость капитала WACC, % (по годам)', type: 'series', lengthFrom: 'years', showIf: DI },
      ],
    },
    {
      id: 'pl',
      title: 'Отчёт о прибылях и убытках (за год)',
      level: 'basic',
      fields: [
        { key: 'revenue', label: 'Выручка', type: 'series', lengthFrom: 'years', showIf: ST },
        { key: 'cogs', label: 'Себестоимость (положительное число)', type: 'series', lengthFrom: 'years', showIf: ST },
        { key: 'otherOpIncome', label: 'Прочие операционные доходы', type: 'series', lengthFrom: 'years', showIf: ST },
        { key: 'opex', label: 'Операционные расходы без амортизации (положительное число)', type: 'series', lengthFrom: 'years', showIf: ST, help: 'Оплата труда, маркетинг, коммерческие и управленческие расходы, прочие операционные расходы.' },
        { key: 'depreciation', label: 'Амортизация (положительное число)', type: 'series', lengthFrom: 'years', showIf: ST },
      ],
    },
    {
      id: 'bs',
      title: 'Баланс (на начало первого года и на конец каждого года)',
      level: 'basic',
      fields: [
        { key: 'equity', label: 'Собственный капитал (капитал и резервы)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST },
        { key: 'longDebt', label: 'Долгосрочные кредиты и займы', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST },
        { key: 'shortDebt', label: 'Краткосрочные кредиты и займы', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST, help: 'Платный краткосрочный долг. В Excel-модели методики входит в инвестированный капитал; если хотите считать только по долгосрочному долгу, оставьте нули.' },
      ],
    },
    {
      id: 'rates',
      title: 'Стоимость капитала',
      level: 'basic',
      fields: [
        { key: 're', label: 'Стоимость собственного капитала, % (по годам)', type: 'series', lengthFrom: 'years', showIf: ST, help: 'По CAPM или методу сопоставимых проектов: безрисковая ставка (ОФЗ) плюс премии за рыночный риск, размер и специфические риски. Для подбора используйте шаблон «Расчёт WACC и ставки дисконтирования».' },
        { key: 'rd', label: 'Стоимость заёмного капитала, % (по годам)', type: 'series', lengthFrom: 'years', showIf: ST, help: 'Средневзвешенная ставка по кредитам и займам с учётом комиссий, оценки и страхования залога.' },
        {
          key: 'taxShield',
          label: 'Налоговый щит в WACC',
          type: 'select',
          showIf: ST,
          options: [
            { value: 'debt', label: 'Только по заёмному капиталу: Wd·Rd·(1−T) + We·Re (стандарт)' },
            { value: 'all', label: 'Ко всей ставке: (Wd·Rd + We·Re)·(1−T) (как в Excel-модели методики)' },
          ],
        },
      ],
    },
    {
      id: 'adjNopat',
      title: 'Корректировки прибыли NOPAT (методика EVA)',
      level: 'pro',
      fields: [
        { key: 'capitalizedOpex', label: 'Операционные расходы, капитализируемые в НМА (маркетинг, НИОКР, реструктуризация, развитие персонала), по годам', type: 'series', lengthFrom: 'years', showIf: ST, help: 'Корректировки 1–4: расходы с долгосрочным эффектом прибавляются к прибыли и капитализируются, затем амортизируются обратно в расходы. Берите только существенные статьи (например, больше 5 % выручки).' },
        { key: 'amortYears', label: 'Срок амортизации капитализированных расходов, лет', type: 'int', min: 1, max: 15, showIf: ST },
        { key: 'otherIncome', label: 'Прочие доходы, не учтённые в EBIT (корректировка 7), по годам', type: 'series', lengthFrom: 'years', showIf: ST },
        { key: 'leaseExpense', label: 'Расходы по операционной аренде, учтённые в затратах (корректировка 12), по годам', type: 'series', lengthFrom: 'years', showIf: ST, help: 'Прибавляются к прибыли; вместо них вычитается амортизация капитализированных арендных обязательств (см. баланс ниже). Если компания уже применяет ФСБУ 25/2018, оставьте нули.' },
        { key: 'leaseYears', label: 'Средний срок аренды, лет', type: 'int', min: 1, max: 30, showIf: ST },
      ],
    },
    {
      id: 'adjIc',
      title: 'Корректировки инвестированного капитала (на начало первого года и на конец каждого года)',
      level: 'pro',
      fields: [
        { key: 'deferredTaxNet', label: 'Отложенные налоги нетто: ОНО − ОНА (корректировка 5)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST, help: 'Сальдо прибавляется к капиталу, прирост за год к прибыли.' },
        { key: 'goodwillAmort', label: 'Накопленная амортизация гудвилла (корректировка 6, только РСБУ)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST },
        { key: 'reserves', label: 'Накопленные резервы: сомнительные долги, обесценение запасов и продукции, резерв LIFO (корректировки 8–11)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST, help: 'Сальдо резервов восстанавливается в капитале, их изменение за год в прибыли.' },
        { key: 'leaseObligation', label: 'Приведённая стоимость обязательств по операционной аренде (корректировка 12)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST },
        { key: 'nonOperatingAssets', label: 'Активы, не создающие прибыль: ликвидные ценные бумаги, незавершённое строительство (корректировки 7, 13)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST, help: 'Вычитаются из инвестированного капитала.' },
        { key: 'extraordinary', label: 'Накопленные чрезвычайные убытки (+) или прибыли (−) (корректировка 14)', type: 'series', lengthFrom: 'years', plusOne: true, showIf: ST },
      ],
    },
    {
      id: 'val',
      title: 'Оценка стоимости бизнеса дисконтированной EVA',
      level: 'pro',
      fields: [
        { key: 'valuationOn', label: 'Рассчитать стоимость бизнеса (формула 3 методики)', type: 'bool' },
        { key: 'netAssets0', label: 'Чистые активы на начало первого года (0 = взять инвестированный капитал на начало)', type: 'number', showIf: { path: 'valuationOn', equals: true } },
        { key: 'discountRate', label: 'Ставка дисконтирования', type: 'percent', step: 0.5, showIf: { path: 'valuationOn', equals: true } },
        { key: 'growth', label: 'Темп роста EVA в постпрогнозном периоде', type: 'percent', step: 0.5, showIf: { path: 'valuationOn', equals: true } },
      ],
    },
  ],
  samples: [
    {
      id: 'gamma',
      name: 'Компания «Гамма» (пример из статьи, 5 лет)',
      inputs: {
        name: 'Гамма',
        unit: 'руб.',
        startYear: 2021,
        years: 5,
        inputMode: 'direct',
        taxRate: 20,
        nopat: [3531842, 7063684, 8829605, 13584007, 20249429],
        ic: [12732542, 16976723, 22635630, 30180840, 40759507],
        wacc: [23.17, 18.22, 23.18, 20.36, 16.83],
        revenue: [], cogs: [], otherOpIncome: [], opex: [], depreciation: [], equity: [], longDebt: [], shortDebt: [], re: [], rd: [], taxShield: 'debt',
        capitalizedOpex: [], amortYears: 5, otherIncome: [], leaseExpense: [], leaseYears: 10,
        deferredTaxNet: [], goodwillAmort: [], reserves: [], leaseObligation: [], nonOperatingAssets: [], extraordinary: [],
        valuationOn: false, netAssets0: 0, discountRate: 17, growth: 3,
      },
    },
    {
      id: 'excel',
      name: 'Пример из Excel-модели методики (2019–2023, с корректировками)',
      inputs: {
        name: 'Производственная компания',
        unit: 'тыс. руб.',
        startYear: 2019,
        years: 5,
        inputMode: 'statements',
        taxRate: 20,
        nopat: [], ic: [], wacc: [],
        revenue: [750000, 800000, 820000, 830000, 850000],
        cogs: [412000, 440000, 451000, 456000, 467000],
        otherOpIncome: [15000, 15000, 15000, 15000, 15000],
        opex: [280000, 301000, 306000, 309000, 317000],
        depreciation: [9000, 9000, 10000, 11000, 13000],
        equity: [160000, 207000, 255000, 305000, 356000, 406000],
        longDebt: [50000, 50000, 50000, 50000, 50000, 50000],
        shortDebt: [10000, 10000, 10000, 10000, 10000, 10000],
        re: [15, 15, 15, 15, 15],
        rd: [16, 16, 14, 12.5, 12],
        taxShield: 'all',
        capitalizedOpex: [49000, 53000, 54000, 59000, 61000],
        amortYears: 5,
        otherIncome: [0, 0, 0, 0, 0],
        leaseExpense: [2200, 2000, 1800, 1600, 1500],
        leaseYears: 10,
        deferredTaxNet: [6000, 8000, 5000, 2000, 1000, 1000],
        goodwillAmort: [4500, 5000, 5500, 6000, 6500, 7000],
        reserves: [0, 4000, 5000, 4000, 4000, 7000],
        leaseObligation: [0, 7600, 7800, 8200, 8600, 8700],
        nonOperatingAssets: [25000, 30000, 55000, 55000, 60000, 75000],
        extraordinary: [0, 0, 0, 0, 0, 0],
        valuationOn: true,
        netAssets0: 0,
        discountRate: 15,
        growth: 3,
      },
    },
    {
      id: 'trade',
      name: 'Торговая компания без корректировок (3 года)',
      inputs: {
        name: 'Торговый дом',
        unit: 'млн руб.',
        startYear: 2024,
        years: 3,
        inputMode: 'statements',
        taxRate: 25,
        nopat: [], ic: [], wacc: [],
        revenue: [4800, 5400, 6100],
        cogs: [3600, 4020, 4520],
        otherOpIncome: [20, 20, 25],
        opex: [760, 840, 930],
        depreciation: [90, 100, 110],
        equity: [900, 1040, 1210, 1420],
        longDebt: [400, 400, 350, 300],
        shortDebt: [300, 350, 380, 400],
        re: [24, 23, 22],
        rd: [19, 18, 16],
        taxShield: 'debt',
        capitalizedOpex: [0, 0, 0], amortYears: 5, otherIncome: [0, 0, 0], leaseExpense: [0, 0, 0], leaseYears: 10,
        deferredTaxNet: [0, 0, 0, 0], goodwillAmort: [0, 0, 0, 0], reserves: [0, 0, 0, 0], leaseObligation: [0, 0, 0, 0], nonOperatingAssets: [0, 0, 0, 0], extraordinary: [0, 0, 0, 0],
        valuationOn: false, netAssets0: 0, discountRate: 20, growth: 4,
      },
    },
  ],
  normalize(i) {
    const out = { ...i };
    if (!out.inputMode) out.inputMode = Array.isArray(out.nopat) && out.nopat.length && !(Array.isArray(out.revenue) && out.revenue.length) ? 'direct' : 'statements';
    if (!out.taxShield) out.taxShield = 'debt';
    if (!out.amortYears) out.amortYears = 5;
    if (!out.leaseYears) out.leaseYears = 10;
    if (!out.unit) out.unit = 'тыс. руб.';
    if (!out.startYear) out.startYear = new Date().getFullYear() - 1;
    return out;
  },
  compute(i) {
    const N = Math.min(5, Math.max(1, Math.round(Number(i.years) || 1)));
    const T = pct(i.taxRate);
    const y0 = Math.round(Number(i.startYear)) || new Date().getFullYear() - 1;
    const labels = Array.from({ length: N }, (_, t) => String(y0 + t));
    const direct = i.inputMode === 'direct';
    const unit = i.unit || 'тыс. руб.';

    let nopat, icAvg, wacc, ebit, corrNopat, icEnd, corrIc, equity, debt, nopatRows = [], icRows = [];
    if (direct) {
      nopat = fitSeries(i.nopat, N);
      icAvg = fitSeries(i.ic, N);
      wacc = fitSeries(i.wacc, N).map((v) => v / 100);
    } else {
      const revenue = fitSeries(i.revenue, N);
      const cogs = fitSeries(i.cogs, N);
      const other = fitSeries(i.otherOpIncome, N);
      const opex = fitSeries(i.opex, N);
      const dep = fitSeries(i.depreciation, N);
      ebit = revenue.map((r, t) => r - cogs[t] + other[t] - opex[t] - dep[t]);
      equity = fitSeries(i.equity, N + 1);
      debt = fitSeries(i.longDebt, N + 1).map((v, t) => v + fitSeries(i.shortDebt, N + 1)[t]);
      // --- корректировки прибыли ---
      const capOpex = fitSeries(i.capitalizedOpex, N);
      const { amort: capAmort, acc: capAcc } = accumulatedAmortization(capOpex, Number(i.amortYears) || 5);
      const otherInc = fitSeries(i.otherIncome, N);
      const leaseExp = fitSeries(i.leaseExpense, N);
      const leaseObl = fitSeries(i.leaseObligation, N + 1);
      const leaseYears = Math.max(1, Math.round(Number(i.leaseYears) || 10));
      const leaseAmort = leaseObl.slice(1).map((v) => v / leaseYears);
      const dtax = fitSeries(i.deferredTaxNet, N + 1);
      const gw = fitSeries(i.goodwillAmort, N + 1);
      const res = fitSeries(i.reserves, N + 1);
      const nonOp = fitSeries(i.nonOperatingAssets, N + 1);
      const extra = fitSeries(i.extraordinary, N + 1);
      const dTax = dtax.slice(1).map((v, t) => Math.max(0, v - dtax[t])); // по методике учитывается прирост
      const dGw = gw.slice(1).map((v, t) => v - gw[t]);
      const dRes = res.slice(1).map((v, t) => v - res[t]);
      nopatRows = [
        ['Капитализация операционных расходов (1–4)', capOpex],
        ['Амортизация капитализированных расходов (1–4)', capAmort.map((v) => -v)],
        ['Прирост отложенных налогов (5)', dTax],
        ['Амортизация гудвилла за год (6)', dGw],
        ['Прочие доходы, не учтённые в EBIT (7)', otherInc],
        ['Изменение резервов за год (8–11)', dRes],
        ['Расходы по операционной аренде (12)', leaseExp],
        ['Амортизация арендных обязательств (12)', leaseAmort.map((v) => -v)],
      ];
      corrNopat = labels.map((_, t) => nopatRows.reduce((s, r) => s + r[1][t], 0));
      nopat = ebit.map((e, t) => {
        const base = e + corrNopat[t];
        return base - (base > 0 ? base * T : 0);
      });
      // --- корректировки капитала (сальдо на t0..tN) ---
      const capNet = [0, ...capOpex.map((_, t) => sum(capOpex.slice(0, t + 1)) - capAcc[t])];
      icRows = [
        ['Капитализированные расходы за вычетом амортизации (1–4)', capNet],
        ['Отложенные налоги нетто (5)', dtax],
        ['Накопленная амортизация гудвилла (6)', gw],
        ['Накопленные резервы (8–11)', res],
        ['Обязательства по операционной аренде (12)', leaseObl],
        ['Неработающие активы (7, 13)', nonOp.map((v) => -v)],
        ['Чрезвычайные убытки / прибыли (14)', extra],
      ];
      corrIc = Array.from({ length: N + 1 }, (_, t) => icRows.reduce((s, r) => s + r[1][t], 0));
      icEnd = equity.map((e, t) => e + debt[t] + corrIc[t]);
      icAvg = labels.map((_, t) => (icEnd[t] + icEnd[t + 1]) / 2);
      // --- WACC по структуре капитала на начало года ---
      const re = fitSeries(i.re, N).map((v) => v / 100);
      const rd = fitSeries(i.rd, N).map((v) => v / 100);
      wacc = labels.map((_, t) => {
        const base = equity[t] + debt[t];
        const wd = base > 0 ? debt[t] / base : 0;
        const we = 1 - wd;
        return i.taxShield === 'all' ? (wd * rd[t] + we * re[t]) * (1 - T) : wd * rd[t] * (1 - T) + we * re[t];
      });
    }
    const roic = nopat.map((n, t) => (icAvg[t] ? n / icAvg[t] : 0));
    const spread = roic.map((r, t) => r - wacc[t]);
    const eva = nopat.map((n, t) => n - wacc[t] * icAvg[t]);
    const evaTotal = sum(eva);
    const last = N - 1;
    // --- факторный анализ ΔEVA (цепные подстановки: IC → ROIC → WACC) ---
    const factors = labels.slice(1).map((_, k) => {
      const t = k + 1;
      const dIc = (icAvg[t] - icAvg[t - 1]) * (roic[t] - wacc[t]);
      const dRoic = icAvg[t - 1] * (roic[t] - roic[t - 1]);
      const dWacc = -icAvg[t - 1] * (wacc[t] - wacc[t - 1]);
      return { year: labels[t], prev: eva[t - 1], dIc, dRoic, dWacc, cur: eva[t] };
    });
    // --- оценка бизнеса дисконтированной EVA ---
    let valuation = null;
    if (i.valuationOn) {
      const d = pct(i.discountRate);
      const g = pct(i.growth);
      const na0 = Number(i.netAssets0) || (icEnd ? icEnd[0] : icAvg[0]) || 0;
      const pv = eva.map((v, t) => v / Math.pow(1 + d, t + 1));
      const tv = d > g ? (eva[last] * (1 + g)) / (d - g) : 0;
      const pvTv = tv / Math.pow(1 + d, N);
      valuation = { na0, pv, pvSum: sum(pv), tv, pvTv, value: na0 + sum(pv) + pvTv, d, g };
    }
    // --- вывод ---
    const colsYears = labels.map((l) => ({ label: l, fmt: 'money' }));
    const tables = [
      {
        id: 'eva',
        title: 'Расчёт экономической добавленной стоимости по годам',
        columns: [{ label: 'Показатель', fmt: 'text' }, ...colsYears],
        rows: [
          ...(direct ? [] : [{ cells: ['EBIT', ...ebit] }, { cells: ['Корректировки прибыли', ...corrNopat] }]),
          { cells: ['NOPAT скорректированная', ...nopat], style: 'subtotal' },
          { cells: ['Инвестированный капитал, среднегодовой', ...icAvg] },
          { cells: ['ROIC', ...roic], fmt: 'pct' },
          { cells: ['WACC', ...wacc], fmt: 'pct' },
          { cells: ['Спред ROIC − WACC', ...spread], fmt: 'pct' },
          { cells: ['Плата за капитал (WACC × IC)', ...wacc.map((w, t) => w * icAvg[t])] },
          { cells: ['EVA', ...eva], style: 'total' },
          ...(N > 1 ? [{ cells: ['Темп прироста EVA', null, ...eva.slice(1).map((v, k) => (eva[k] ? (v - eva[k]) / Math.abs(eva[k]) : null))], fmt: 'pct' }] : []),
        ],
      },
    ];
    if (factors.length) {
      tables.push({
        id: 'factors',
        title: 'Факторный анализ изменения EVA (цепные подстановки)',
        columns: [{ label: 'Год', fmt: 'text' }, { label: 'EVA прошлого года', fmt: 'money' }, { label: 'Влияние капитала IC', fmt: 'money' }, { label: 'Влияние ROIC', fmt: 'money' }, { label: 'Влияние WACC', fmt: 'money' }, { label: 'EVA отчётного года', fmt: 'money' }, { label: 'Изменение', fmt: 'money' }],
        rows: factors.map((f) => ({ cells: [f.year, f.prev, f.dIc, f.dRoic, f.dWacc, f.cur, f.cur - f.prev] })),
      });
    }
    if (!direct) {
      tables.push({
        id: 'ic',
        title: 'Инвестированный капитал на конец года',
        columns: [{ label: 'Показатель', fmt: 'text' }, { label: `Начало ${labels[0]}`, fmt: 'money' }, ...colsYears],
        rows: [
          { cells: ['Собственный капитал', ...equity] },
          { cells: ['Процентный заёмный капитал', ...debt] },
          { cells: ['Корректировки капитала', ...corrIc] },
          { cells: ['Инвестированный капитал скорректированный', ...icEnd], style: 'total' },
        ],
      });
      const anyNopatAdj = nopatRows.some((r) => r[1].some((v) => v));
      const anyIcAdj = icRows.some((r) => r[1].some((v) => v));
      if (anyNopatAdj) tables.push({ id: 'adjNopat', title: 'Корректировки прибыли NOPAT по методике EVA', columns: [{ label: 'Корректировка', fmt: 'text' }, ...colsYears], rows: [...nopatRows.filter((r) => r[1].some((v) => v)).map((r) => ({ cells: [r[0], ...r[1]] })), { cells: ['Итого корректировки прибыли', ...corrNopat], style: 'total' }] });
      if (anyIcAdj) tables.push({ id: 'adjIc', title: 'Корректировки инвестированного капитала по методике EVA', columns: [{ label: 'Корректировка', fmt: 'text' }, { label: `Начало ${labels[0]}`, fmt: 'money' }, ...colsYears], rows: [...icRows.filter((r) => r[1].some((v) => v)).map((r) => ({ cells: [r[0], ...r[1]] })), { cells: ['Итого корректировки капитала', ...corrIc], style: 'total' }] });
    }
    if (valuation) {
      tables.push({
        id: 'valuation',
        title: 'Стоимость бизнеса по дисконтированной EVA',
        columns: [{ label: 'Компонент', fmt: 'text' }, { label: 'Сумма', fmt: 'money' }],
        rows: [
          { cells: ['Чистые активы на начало первого года', valuation.na0] },
          ...labels.map((l, t) => ({ cells: [`PV EVA ${l}`, valuation.pv[t]] })),
          { cells: ['Сумма PV EVA прогнозного периода', valuation.pvSum], style: 'subtotal' },
          { cells: [`Терминальная EVA (рост ${i.growth} %, ставка ${i.discountRate} %)`, valuation.tv] },
          { cells: ['PV терминальной EVA', valuation.pvTv] },
          { cells: ['Стоимость бизнеса', valuation.value], style: 'total' },
        ],
      });
    }
    const charts = [
      { id: 'eva', title: 'EVA по годам и спред ROIC − WACC', type: 'mixed', labels, datasets: [{ label: 'EVA', data: eva, type: 'bar' }, { label: 'Плата за капитал', data: wacc.map((w, t) => w * icAvg[t]), type: 'bar' }], zeroLine: true },
      { id: 'rates', title: 'ROIC против WACC', type: 'line', labels, datasets: [{ label: 'ROIC, %', data: roic.map((v) => v * 100) }, { label: 'WACC, %', data: wacc.map((v) => v * 100) }] },
    ];
    if (factors.length) {
      const f = factors[factors.length - 1];
      charts.push({ id: 'factors', title: `Факторы изменения EVA: ${labels[last - 1]} → ${labels[last]}`, type: 'waterfall', labels: [`EVA ${labels[last - 1]}`, 'Капитал IC', 'ROIC', 'WACC', `EVA ${labels[last]}`], datasets: [{ label: 'EVA', data: [f.prev, f.dIc, f.dRoic, f.dWacc, f.cur] }] });
    }
    const kpis = [
      m(`EVA ${labels[last]}`, eva[last], 'money', eva[last] > 0, eva[last] > 0 ? 'Бизнес зарабатывает больше платы за капитал' : 'Доход ниже платы за капитал: стоимость разрушается'),
      m('ROIC', roic[last], 'pct', roic[last] > wacc[last], 'NOPAT / среднегодовой инвестированный капитал'),
      m('WACC', wacc[last], 'pct', null, direct ? 'Введено' : `Структура капитала на начало ${labels[last]}`),
      m('Спред ROIC − WACC', spread[last], 'pct', spread[last] > 0),
      m('NOPAT', nopat[last], 'money'),
      m('Инвестированный капитал', icAvg[last], 'money', null, 'среднегодовой, с корректировками'),
      ...(N > 1 ? [m('EVA за все годы', evaTotal, 'money', evaTotal > 0), m('Изменение EVA за год', eva[last] - eva[last - 1], 'money', eva[last] - eva[last - 1] > 0)] : []),
      ...(valuation ? [m('Стоимость бизнеса по EVA', valuation.value, 'money', valuation.value > 0)] : []),
    ];
    const conclusion = [
      `EVA за ${labels[last]}: ${fmtMoney(eva[last])} ${unit}. ROIC ${fmtPct(roic[last])} против WACC ${fmtPct(wacc[last])}, спред ${fmtPct(spread[last])}. ${eva[last] > 0 ? 'Компания создаёт стоимость для собственников: доходность капитала выше его цены.' : 'Компания не покрывает стоимость капитала: инвесторы получили бы больше в альтернативных вложениях с тем же риском.'}`,
    ];
    if (N > 1) {
      const pos = eva.filter((v) => v > 0).length;
      conclusion.push(`За ${N} лет EVA положительна в ${pos} из ${N} периодов, накопленная EVA ${fmtMoney(evaTotal)} ${unit}. ${eva[last] > eva[0] ? 'Тренд растущий, рыночная ценность бизнеса увеличивается.' : 'Тренд не растёт, проверьте, что сдерживает ROIC или удорожает капитал.'}`);
      const f = factors[factors.length - 1];
      const parts = [['изменение капитала', f.dIc], ['изменение ROIC', f.dRoic], ['изменение WACC', f.dWacc]].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      conclusion.push(`Изменение EVA в ${labels[last]} (${fmtMoney(f.cur - f.prev)}): главный фактор ${parts[0][0]} (${fmtMoney(parts[0][1])}), далее ${parts[1][0]} (${fmtMoney(parts[1][1])}) и ${parts[2][0]} (${fmtMoney(parts[2][1])}).`);
    }
    if (!direct && corrNopat.some((v) => v)) conclusion.push(`Корректировки по методике EVA меняют NOPAT ${labels[last]} на ${fmtMoney(corrNopat[last])} ${unit} и инвестированный капитал на ${fmtMoney(corrIc[N])} ${unit}. Без них показатель отражал бы бухгалтерскую, а не экономическую прибыль.`);
    if (valuation) conclusion.push(`Стоимость бизнеса по дисконтированной EVA: ${fmtMoney(valuation.value)} ${unit}, из них терминальная часть ${fmtMoney(valuation.pvTv)} ${unit} (${valuation.value ? ((valuation.pvTv / valuation.value) * 100).toFixed(0) : 0} %). Сопоставьте с оценкой DCF: расхождение указывает на чувствительность к корректировкам и ставке.`);
    conclusion.push('EVA не учитывает фактор времени, поэтому в инвестиционном анализе используйте её вместе с NPV и DCF. В KPI менеджеров включайте не саму EVA, а её драйверы: выручку, затраты, объём инвестиций и стоимость капитала.');
    return {
      kpis,
      tables,
      charts,
      conclusion,
      unit,
      metric: { eva: eva[last], spread: spread[last], evaTotal },
      series: { labels, nopat, icAvg, wacc, roic, eva },
    };
  },
  metric(i, key = 'eva') {
    return this.compute(i).metric[key];
  },
};
