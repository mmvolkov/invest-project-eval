/**
 * Шаблоны «Анализ»: безубыточность (CVP), факторный анализ прибыли, план-факт, финансовые коэффициенты.
 * Шаблоны «Бюджеты» и «Отчёты»: БДР/БДДС на 12 месяцев, оценка бизнеса DCF.
 */
import * as F from '../engine/finance.js';
import { pct, fitSeries } from '../engine/utils.js';

const m = (label, value, fmt = 'money', good = null, hint) => ({ key: label, label, value, fmt, good, hint });
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/** ---------- Точка безубыточности ---------- */
export const breakevenTemplate = {
  id: 'breakeven',
  category: 'analysis',
  subcategory: 'Анализ прибыли',
  title: 'Точка безубыточности и запас прочности (CVP)',
  short: 'Безубыточный объём, маржинальность, операционный рычаг, целевая прибыль',
  description: 'Классический CVP-анализ: маржинальный доход, точка безубыточности в единицах и деньгах, запас финансовой прочности, сила операционного рычага и объём для целевой прибыли.',
  levels: ['express', 'basic', 'pro'],
  minLevel: 'express',
  tags: ['безубыточность', 'маржа', 'рычаг'],
  drivers: [
    { path: 'price', label: 'Цена', mode: 'scale' },
    { path: 'unitVar', label: 'Переменные на единицу', mode: 'scale' },
    { path: 'fixed', label: 'Постоянные затраты', mode: 'scale' },
    { path: 'volume', label: 'Объём продаж', mode: 'scale' },
  ],
  metrics: [{ key: 'profit', label: 'Прибыль', fmt: 'money' }, { key: 'beUnits', label: 'Точка безубыточности, ед.', fmt: 'num' }, { key: 'safety', label: 'Запас прочности', fmt: 'pct' }],
  schema: [
    {
      id: 'cvp',
      title: 'Исходные данные',
      level: 'express',
      fields: [
        { key: 'price', label: 'Цена за единицу', type: 'number', min: 0 },
        { key: 'unitVar', label: 'Переменные затраты на единицу', type: 'number', min: 0 },
        { key: 'fixed', label: 'Постоянные затраты за период', type: 'number', min: 0 },
        { key: 'volume', label: 'Плановый объём продаж, ед.', type: 'number', min: 0 },
        { key: 'targetProfit', label: 'Целевая прибыль', type: 'number', min: 0, level: 'basic' },
        { key: 'taxRate', label: 'Налог на прибыль (для целевой чистой прибыли)', type: 'percent', level: 'pro' },
      ],
    },
  ],
  samples: [
    { id: 'bakery', name: 'Пекарня', inputs: { price: 120, unitVar: 55, fixed: 450000, volume: 9000, targetProfit: 200000, taxRate: 20 } },
    { id: 'b2b', name: 'B2B-сервис (подписка)', inputs: { price: 15000, unitVar: 4000, fixed: 1800000, volume: 220, targetProfit: 600000, taxRate: 20 } },
  ],
  compute(i) {
    const p = Number(i.price) || 0;
    const v = Number(i.unitVar) || 0;
    const fx = Number(i.fixed) || 0;
    const q = Number(i.volume) || 0;
    const cm = p - v;
    const cmr = p ? cm / p : null;
    const beUnits = cm > 0 ? fx / cm : null;
    const beRevenue = cmr ? fx / cmr : null;
    const revenue = p * q;
    const profit = cm * q - fx;
    const safety = revenue && beRevenue != null ? (revenue - beRevenue) / revenue : null;
    const dol = profit ? (cm * q) / profit : null;
    const target = Number(i.targetProfit) || 0;
    const tax = pct(i.taxRate);
    const targetPre = tax < 1 ? target / (1 - tax) : target;
    const qTarget = cm > 0 ? (fx + targetPre) / cm : null;
    const pts = [];
    const maxQ = Math.max(q, beUnits || 0) * 1.5 || 100;
    for (let k = 0; k <= 10; k++) {
      const qq = (maxQ * k) / 10;
      pts.push({ q: qq, revenue: p * qq, total: fx + v * qq, profit: cm * qq - fx });
    }
    return {
      kpis: [
        m('Маржинальный доход на единицу', cm, 'money', cm > 0),
        m('Коэффициент маржинального дохода', cmr, 'pct'),
        m('Точка безубыточности, ед.', beUnits, 'num', beUnits != null ? beUnits <= q : false),
        m('Точка безубыточности, деньги', beRevenue, 'money'),
        m('Прибыль при плановом объёме', profit, 'money', profit > 0),
        m('Запас финансовой прочности', safety, 'pct', safety != null ? safety > 0.2 : null, 'Норма > 20–30 %'),
        m('Сила операционного рычага', dol, 'ratio', null, 'На сколько % изменится прибыль при изменении выручки на 1 %'),
        m('Объём для целевой чистой прибыли, ед.', qTarget, 'num'),
      ],
      tables: [{ id: 'cvp', title: 'Зависимость от объёма', columns: [{ label: 'Объём, ед.', fmt: 'num' }, { label: 'Выручка', fmt: 'money' }, { label: 'Полные затраты', fmt: 'money' }, { label: 'Прибыль', fmt: 'money' }], rows: pts.map((x) => ({ cells: [x.q, x.revenue, x.total, x.profit] })) }],
      charts: [{ id: 'cvp', title: 'График безубыточности', type: 'line', labels: pts.map((x) => Math.round(x.q).toString()), datasets: [{ label: 'Выручка', data: pts.map((x) => x.revenue) }, { label: 'Полные затраты', data: pts.map((x) => x.total) }, { label: 'Постоянные', data: pts.map(() => fx) }] }],
      conclusion: [
        beUnits != null ? `Точка безубыточности — ${Math.ceil(beUnits).toLocaleString('ru-RU')} ед. (${Math.round(beRevenue).toLocaleString('ru-RU')} в деньгах). Плановый объём ${q.toLocaleString('ru-RU')} ед. ${q >= beUnits ? 'выше' : 'НИЖЕ'} порога.` : 'Цена не покрывает переменные затраты — безубыточность недостижима.',
        safety != null ? `Запас прочности ${(safety * 100).toFixed(1)} %: выручка может упасть на столько, прежде чем бизнес уйдёт в убыток.${safety < 0.2 ? ' Это мало — бизнес уязвим к падению спроса.' : ''}` : '',
        dol != null ? `Операционный рычаг ${dol.toFixed(2)}: падение выручки на 10 % изменит прибыль на ${(dol * 10).toFixed(0)} %.` : '',
        qTarget != null ? `Для чистой прибыли ${target.toLocaleString('ru-RU')} нужно продать ${Math.ceil(qTarget).toLocaleString('ru-RU')} ед.` : '',
      ].filter(Boolean),
      metric: { profit, beUnits, safety },
    };
  },
  metric(i, key = 'profit') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Факторный анализ прибыли ---------- */
export const factorTemplate = {
  id: 'factor',
  category: 'analysis',
  subcategory: 'Факторный анализ',
  title: 'Факторный анализ прибыли (цепные подстановки)',
  short: 'Влияние объёма, цены, переменных и постоянных затрат на отклонение прибыли',
  description: 'Раскладывает отклонение прибыли факт − план на влияние факторов методом цепных подстановок: объём продаж, цена, удельные переменные затраты, постоянные затраты. Сумма влияний равна общему отклонению.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['план-факт', 'факторы', 'прибыль'],
  drivers: [],
  metrics: [{ key: 'delta', label: 'Отклонение прибыли', fmt: 'money' }],
  schema: [
    { id: 'plan', title: 'План', level: 'basic', fields: [{ key: 'plan.volume', label: 'Объём, ед.', type: 'number' }, { key: 'plan.price', label: 'Цена', type: 'number' }, { key: 'plan.unitVar', label: 'Переменные на единицу', type: 'number' }, { key: 'plan.fixed', label: 'Постоянные затраты', type: 'number' }] },
    { id: 'fact', title: 'Факт', level: 'basic', fields: [{ key: 'fact.volume', label: 'Объём, ед.', type: 'number' }, { key: 'fact.price', label: 'Цена', type: 'number' }, { key: 'fact.unitVar', label: 'Переменные на единицу', type: 'number' }, { key: 'fact.fixed', label: 'Постоянные затраты', type: 'number' }] },
  ],
  samples: [{ id: 'q', name: 'Квартал: рост цены, падение объёма', inputs: { plan: { volume: 10000, price: 500, unitVar: 300, fixed: 1200000 }, fact: { volume: 9200, price: 540, unitVar: 315, fixed: 1260000 } }, }],
  compute(i) {
    const P = i.plan || {};
    const Fh = i.fact || {};
    const profit = (q, p, v, f) => (Number(q) || 0) * ((Number(p) || 0) - (Number(v) || 0)) - (Number(f) || 0);
    const p0 = profit(P.volume, P.price, P.unitVar, P.fixed);
    const s1 = profit(Fh.volume, P.price, P.unitVar, P.fixed);
    const s2 = profit(Fh.volume, Fh.price, P.unitVar, P.fixed);
    const s3 = profit(Fh.volume, Fh.price, Fh.unitVar, P.fixed);
    const p1 = profit(Fh.volume, Fh.price, Fh.unitVar, Fh.fixed);
    const eff = [
      { name: 'Объём продаж', value: s1 - p0 },
      { name: 'Цена', value: s2 - s1 },
      { name: 'Удельные переменные затраты', value: s3 - s2 },
      { name: 'Постоянные затраты', value: p1 - s3 },
    ];
    const delta = p1 - p0;
    const rows = [
      { cells: ['Прибыль план', p0], style: 'subtotal' },
      ...eff.map((e) => ({ cells: [`Влияние: ${e.name}`, e.value] })),
      { cells: ['Прибыль факт', p1], style: 'total' },
      { cells: ['Отклонение всего', delta], style: 'total' },
    ];
    const sorted = [...eff].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return {
      kpis: [m('Прибыль план', p0), m('Прибыль факт', p1), m('Отклонение', delta, 'money', delta >= 0), m('Отклонение, %', p0 ? delta / Math.abs(p0) : null, 'pct'), ...eff.map((e) => m(`Влияние: ${e.name}`, e.value, 'money', e.value >= 0))],
      tables: [
        { id: 'factor', title: 'Разложение отклонения прибыли', columns: [{ label: 'Показатель', fmt: 'text' }, { label: 'Сумма', fmt: 'money' }], rows },
        { id: 'pf', title: 'План и факт', columns: [{ label: 'Показатель', fmt: 'text' }, { label: 'План', fmt: 'num' }, { label: 'Факт', fmt: 'num' }, { label: 'Отклонение', fmt: 'num' }, { label: '%', fmt: 'pct' }], rows: ['volume', 'price', 'unitVar', 'fixed'].map((k, idx) => ({ cells: [['Объём', 'Цена', 'Переменные на ед.', 'Постоянные'][idx], Number(P[k]) || 0, Number(Fh[k]) || 0, (Number(Fh[k]) || 0) - (Number(P[k]) || 0), P[k] ? ((Number(Fh[k]) || 0) - Number(P[k])) / Number(P[k]) : null] })) },
      ],
      charts: [{ id: 'wf', title: 'Влияние факторов (водопад)', type: 'waterfall', labels: ['План', ...eff.map((e) => e.name), 'Факт'], datasets: [{ label: 'Прибыль', data: [p0, ...eff.map((e) => e.value), p1] }] }],
      conclusion: [
        `Прибыль изменилась на ${Math.round(delta).toLocaleString('ru-RU')} (${p0 ? ((delta / Math.abs(p0)) * 100).toFixed(1) : '—'} %).`,
        `Главный фактор — «${sorted[0].name}»: ${Math.round(sorted[0].value).toLocaleString('ru-RU')}. Второй — «${sorted[1].name}»: ${Math.round(sorted[1].value).toLocaleString('ru-RU')}.`,
        'Сумма влияний факторов равна общему отклонению — проверка метода цепных подстановок выполнена.',
      ],
      metric: { delta },
    };
  },
  metric(i, key = 'delta') {
    return this.compute(i).metric[key];
  },
};

/** ---------- План-факт анализ ---------- */
export const planfactTemplate = {
  id: 'planfact',
  category: 'analysis',
  subcategory: 'План-факт анализ',
  title: 'План-факт анализ бюджета',
  short: 'Отклонения по статьям, существенность, ABC-ранжирование причин',
  description: 'Сравнивает план и факт по статьям доходов и расходов, считает абсолютные и относительные отклонения, помечает существенные (по заданному порогу) и ранжирует статьи по вкладу в итоговое отклонение.',
  levels: ['express', 'basic', 'pro'],
  minLevel: 'express',
  tags: ['бюджет', 'отклонения'],
  drivers: [],
  metrics: [{ key: 'delta', label: 'Отклонение результата', fmt: 'money' }],
  schema: [
    {
      id: 'pf',
      title: 'Статьи бюджета',
      level: 'express',
      fields: [
        { key: 'threshold', label: 'Порог существенности отклонения', type: 'percent', min: 0, max: 100 },
        {
          key: 'items',
          label: 'Статьи',
          type: 'items',
          itemFields: [
            { key: 'name', label: 'Статья', type: 'text' },
            { key: 'kind', label: 'Тип', type: 'select', options: [{ value: 'income', label: 'Доход' }, { value: 'expense', label: 'Расход' }] },
            { key: 'plan', label: 'План', type: 'number' },
            { key: 'fact', label: 'Факт', type: 'number' },
          ],
          newItem: () => ({ name: 'Статья', kind: 'expense', plan: 0, fact: 0 }),
        },
      ],
    },
  ],
  samples: [
    {
      id: 'month',
      name: 'Отчёт за месяц',
      inputs: {
        threshold: 5,
        items: [
          { name: 'Выручка — опт', kind: 'income', plan: 12000, fact: 11300 },
          { name: 'Выручка — розница', kind: 'income', plan: 8000, fact: 8900 },
          { name: 'Себестоимость', kind: 'expense', plan: 11000, fact: 11200 },
          { name: 'ФОТ', kind: 'expense', plan: 3200, fact: 3350 },
          { name: 'Аренда', kind: 'expense', plan: 900, fact: 900 },
          { name: 'Маркетинг', kind: 'expense', plan: 1200, fact: 1650 },
          { name: 'Логистика', kind: 'expense', plan: 700, fact: 640 },
        ],
      },
    },
  ],
  compute(i) {
    const th = pct(i.threshold);
    const items = (i.items || []).map((it) => {
      const plan = Number(it.plan) || 0;
      const fact = Number(it.fact) || 0;
      const sign = it.kind === 'income' ? 1 : -1;
      const dev = fact - plan;
      const effect = dev * sign; // влияние на результат
      return { ...it, plan, fact, dev, devPct: plan ? dev / Math.abs(plan) : null, effect, significant: plan ? Math.abs(dev / plan) >= th : Math.abs(dev) > 0 };
    });
    const incomeP = F.sum(items.filter((x) => x.kind === 'income').map((x) => x.plan));
    const incomeF = F.sum(items.filter((x) => x.kind === 'income').map((x) => x.fact));
    const expP = F.sum(items.filter((x) => x.kind !== 'income').map((x) => x.plan));
    const expF = F.sum(items.filter((x) => x.kind !== 'income').map((x) => x.fact));
    const resP = incomeP - expP;
    const resF = incomeF - expF;
    const delta = resF - resP;
    const ranked = [...items].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
    let cum = 0;
    const totalAbs = F.sum(ranked.map((x) => Math.abs(x.effect))) || 1;
    const abc = ranked.map((x) => {
      cum += Math.abs(x.effect) / totalAbs;
      return { ...x, cum, cls: cum <= 0.8 ? 'A' : cum <= 0.95 ? 'B' : 'C' };
    });
    const rows = items.map((x) => ({ cells: [x.name, x.kind === 'income' ? 'Доход' : 'Расход', x.plan, x.fact, x.dev, x.devPct, x.effect, x.significant ? '⚠ существенно' : ''], style: x.significant ? 'warn' : undefined }));
    rows.push({ cells: ['Доходы итого', '', incomeP, incomeF, incomeF - incomeP, incomeP ? (incomeF - incomeP) / incomeP : null, incomeF - incomeP, ''], style: 'subtotal' });
    rows.push({ cells: ['Расходы итого', '', expP, expF, expF - expP, expP ? (expF - expP) / expP : null, -(expF - expP), ''], style: 'subtotal' });
    rows.push({ cells: ['Финансовый результат', '', resP, resF, delta, resP ? delta / Math.abs(resP) : null, delta, ''], style: 'total' });
    return {
      kpis: [m('Результат план', resP), m('Результат факт', resF), m('Отклонение результата', delta, 'money', delta >= 0), m('Выполнение плана по доходам', incomeP ? incomeF / incomeP : null, 'pct', incomeP ? incomeF >= incomeP : null), m('Исполнение бюджета расходов', expP ? expF / expP : null, 'pct', expP ? expF <= expP : null), m('Существенных отклонений', items.filter((x) => x.significant).length, 'int')],
      tables: [
        { id: 'pf', title: 'План-факт по статьям', columns: ['Статья', 'Тип', 'План', 'Факт', 'Отклонение', 'Откл., %', 'Влияние на результат', 'Признак'].map((l, k) => ({ label: l, fmt: ['text', 'text', 'money', 'money', 'money', 'pct', 'money', 'text'][k] })), rows },
        { id: 'abc', title: 'ABC-ранжирование статей по вкладу в отклонение', columns: ['Статья', 'Влияние', 'Накопленная доля', 'Класс'].map((l, k) => ({ label: l, fmt: ['text', 'money', 'pct', 'text'][k] })), rows: abc.map((x) => ({ cells: [x.name, x.effect, x.cum, x.cls] })) },
      ],
      charts: [{ id: 'dev', title: 'Влияние статей на результат', type: 'horizontalBar', labels: ranked.map((x) => x.name), datasets: [{ label: 'Влияние', data: ranked.map((x) => x.effect) }] }],
      conclusion: [
        `Финансовый результат ${delta >= 0 ? 'лучше' : 'хуже'} плана на ${Math.abs(Math.round(delta)).toLocaleString('ru-RU')} (${resP ? ((delta / Math.abs(resP)) * 100).toFixed(1) : '—'} %).`,
        `Наибольшее влияние: ${abc.filter((x) => x.cls === 'A').map((x) => `${x.name} (${Math.round(x.effect).toLocaleString('ru-RU')})`).join(', ')}.`,
        `Существенных отклонений (порог ${i.threshold} %): ${items.filter((x) => x.significant).length}. По ним нужны пояснения ответственных и корректирующие меры.`,
      ],
      metric: { delta },
    };
  },
  metric(i, key = 'delta') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Финансовые коэффициенты ---------- */
export const ratiosTemplate = {
  id: 'ratios',
  category: 'reports',
  subcategory: 'Отчёты для оценки бизнеса',
  title: 'Анализ ключевых финансовых отчётов (коэффициенты)',
  short: 'Ликвидность, устойчивость, рентабельность, оборачиваемость по балансу и ОПУ',
  description: 'Вводите агрегаты баланса и отчёта о прибылях и убытках — получите набор коэффициентов с нормативами и диагностикой: ликвидность, финансовая устойчивость, рентабельность, деловая активность, финансовый цикл.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['коэффициенты', 'ликвидность', 'оборачиваемость'],
  drivers: [],
  metrics: [{ key: 'roe', label: 'ROE', fmt: 'pct' }],
  schema: [
    { id: 'bs', title: 'Баланс (на конец периода)', level: 'basic', fields: [{ key: 'cash', label: 'Денежные средства', type: 'number' }, { key: 'receivables', label: 'Дебиторская задолженность', type: 'number' }, { key: 'inventory', label: 'Запасы', type: 'number' }, { key: 'otherCurrent', label: 'Прочие оборотные активы', type: 'number' }, { key: 'fixedAssets', label: 'Внеоборотные активы', type: 'number' }, { key: 'payables', label: 'Кредиторская задолженность', type: 'number' }, { key: 'shortDebt', label: 'Краткосрочные кредиты', type: 'number' }, { key: 'longDebt', label: 'Долгосрочные кредиты', type: 'number' }, { key: 'equity', label: 'Собственный капитал', type: 'number' }] },
    { id: 'pl', title: 'Отчёт о прибылях и убытках (за период)', level: 'basic', fields: [{ key: 'revenue', label: 'Выручка', type: 'number' }, { key: 'cogs', label: 'Себестоимость', type: 'number' }, { key: 'ebitda', label: 'EBITDA', type: 'number' }, { key: 'ebit', label: 'EBIT (операционная прибыль)', type: 'number' }, { key: 'interest', label: 'Проценты к уплате', type: 'number' }, { key: 'netIncome', label: 'Чистая прибыль', type: 'number' }, { key: 'days', label: 'Дней в периоде', type: 'int', min: 1 }] },
  ],
  samples: [{ id: 'trade', name: 'Торговая компания, год', inputs: { cash: 1200, receivables: 4800, inventory: 6500, otherCurrent: 300, fixedAssets: 9000, payables: 5200, shortDebt: 3000, longDebt: 4000, equity: 9600, revenue: 48000, cogs: 36000, ebitda: 5200, ebit: 4300, interest: 1100, netIncome: 2500, days: 365 } }],
  compute(i) {
    const n = (k) => Number(i[k]) || 0;
    const ca = n('cash') + n('receivables') + n('inventory') + n('otherCurrent');
    const cl = n('payables') + n('shortDebt');
    const assets = ca + n('fixedAssets');
    const debt = n('shortDebt') + n('longDebt');
    const days = n('days') || 365;
    const r = [
      ['Ликвидность', 'Текущая ликвидность', F.div(ca, cl), 'ratio', '1.5–2.5', (v) => v >= 1.5 && v <= 3],
      ['Ликвидность', 'Быстрая ликвидность', F.div(ca - n('inventory'), cl), 'ratio', '≥ 0.8–1', (v) => v >= 0.8],
      ['Ликвидность', 'Абсолютная ликвидность', F.div(n('cash'), cl), 'ratio', '≥ 0.2', (v) => v >= 0.2],
      ['Устойчивость', 'Автономия (СК / активы)', F.div(n('equity'), assets), 'pct', '≥ 0.4–0.5', (v) => v >= 0.4],
      ['Устойчивость', 'Долг / собственный капитал', F.div(debt, n('equity')), 'ratio', '≤ 1–1.5', (v) => v <= 1.5],
      ['Устойчивость', 'Чистый долг / EBITDA', F.div(debt - n('cash'), n('ebitda')), 'ratio', '≤ 2.5–3', (v) => v <= 3],
      ['Устойчивость', 'Покрытие процентов (EBIT / %)', F.div(n('ebit'), n('interest')), 'ratio', '≥ 3', (v) => v >= 3],
      ['Рентабельность', 'Валовая рентабельность', F.div(n('revenue') - n('cogs'), n('revenue')), 'pct', 'отраслевая', null],
      ['Рентабельность', 'Рентабельность по EBITDA', F.div(n('ebitda'), n('revenue')), 'pct', 'отраслевая', null],
      ['Рентабельность', 'Рентабельность продаж (ROS)', F.div(n('netIncome'), n('revenue')), 'pct', '> 0', (v) => v > 0],
      ['Рентабельность', 'Рентабельность активов (ROA)', F.div(n('netIncome'), assets), 'pct', '> стоимости долга', null],
      ['Рентабельность', 'Рентабельность капитала (ROE)', F.div(n('netIncome'), n('equity')), 'pct', '> стоимости СК', null],
      ['Оборачиваемость', 'Оборачиваемость ДЗ, дней', F.div(n('receivables') * days, n('revenue')), 'num', 'по договорам', null],
      ['Оборачиваемость', 'Оборачиваемость запасов, дней', F.div(n('inventory') * days, n('cogs')), 'num', 'отраслевая', null],
      ['Оборачиваемость', 'Оборачиваемость КЗ, дней', F.div(n('payables') * days, n('cogs')), 'num', 'по договорам', null],
      ['Оборачиваемость', 'Оборачиваемость активов, раз', F.div(n('revenue'), assets), 'ratio', '', null],
    ];
    const dso = r[12][2];
    const dio = r[13][2];
    const dpo = r[14][2];
    const ccc = dso != null && dio != null && dpo != null ? dso + dio - dpo : null;
    r.push(['Оборачиваемость', 'Финансовый цикл, дней', ccc, 'num', 'чем короче, тем лучше', null]);
    const rows = r.map((x) => ({ cells: [x[0], x[1], x[2], x[4], x[5] && x[2] != null ? (x[5](x[2]) ? '✓ в норме' : '⚠ вне нормы') : ''], fmt: x[3], style: x[5] && x[2] != null && !x[5](x[2]) ? 'warn' : undefined }));
    const alerts = r.filter((x) => x[5] && x[2] != null && !x[5](x[2])).map((x) => x[1]);
    // DuPont
    const ros = F.div(n('netIncome'), n('revenue'));
    const at = F.div(n('revenue'), assets);
    const lev = F.div(assets, n('equity'));
    return {
      kpis: [m('Текущая ликвидность', r[0][2], 'ratio', r[0][5](r[0][2] || 0)), m('Чистый долг / EBITDA', r[5][2], 'ratio', r[5][2] != null ? r[5][2] <= 3 : null), m('ROE', r[11][2], 'pct'), m('Рентабельность по EBITDA', r[8][2], 'pct'), m('Финансовый цикл, дней', ccc, 'num'), m('Автономия', r[3][2], 'pct', r[3][2] != null ? r[3][2] >= 0.4 : null)],
      tables: [
        { id: 'ratios', title: 'Коэффициенты', columns: ['Группа', 'Показатель', 'Значение', 'Норматив', 'Оценка'].map((l, k) => ({ label: l, fmt: ['text', 'text', 'ratio', 'text', 'text'][k] })), rows },
        { id: 'dupont', title: 'Модель Дюпон: ROE = ROS × оборачиваемость активов × финансовый рычаг', columns: ['Компонент', 'Значение'].map((l, k) => ({ label: l, fmt: ['text', 'ratio'][k] })), rows: [{ cells: ['Рентабельность продаж (ROS)', ros], fmt: 'pct' }, { cells: ['Оборачиваемость активов', at] }, { cells: ['Финансовый рычаг (активы / СК)', lev] }, { cells: ['ROE', ros != null && at != null && lev != null ? ros * at * lev : null], fmt: 'pct', style: 'total' }] },
      ],
      charts: [{ id: 'struct', title: 'Структура активов и пассивов', type: 'bar', stacked: true, labels: ['Активы', 'Пассивы'], datasets: [{ label: 'Оборотные / Краткосрочные обязательства', data: [ca, cl] }, { label: 'Внеоборотные / Долгосрочный долг', data: [n('fixedAssets'), n('longDebt')] }, { label: '— / Собственный капитал', data: [0, n('equity')] }] }],
      conclusion: [
        alerts.length ? `Вне нормативов: ${alerts.join(', ')}.` : 'Все контролируемые коэффициенты в пределах нормативов.',
        ccc != null ? `Финансовый цикл ${Math.round(ccc)} дней: деньги «заморожены» в запасах и дебиторке ${Math.round(dso + dio)} дней, отсрочка от поставщиков покрывает ${Math.round(dpo)} дней.` : '',
        ros != null && at != null && lev != null ? `По Дюпону ROE ${(ros * at * lev * 100).toFixed(1)} % = ROS ${(ros * 100).toFixed(1)} % × оборачиваемость ${at.toFixed(2)} × рычаг ${lev.toFixed(2)}.` : '',
      ].filter(Boolean),
      metric: { roe: r[11][2] },
    };
  },
  metric(i, key = 'roe') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Бюджет: БДР / БДДС на 12 месяцев ---------- */
export const budgetTemplate = {
  id: 'budget',
  category: 'budget',
  subcategory: 'Бюджеты в целом',
  title: 'Финансовая модель компании: БДР, БДДС и прогнозный баланс',
  short: 'План продаж → затраты → ПДР, ПДДС, баланс на 12 месяцев',
  description: 'Пошаговая модель из методики «Как построить финансовую модель в Excel»: план продаж по продуктам, переменные затраты как доля выручки, постоянные расходы, лаги оплаты → план доходов и расходов, план движения денежных средств и прогнозный баланс с проверкой актив = пассив.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['БДР', 'БДДС', 'баланс', 'бюджет'],
  drivers: [
    { path: 'products', label: 'План продаж', mode: 'scale', itemKey: 'base' },
    { path: 'varPct', label: 'Доля переменных затрат', mode: 'scale' },
    { path: 'fixed', label: 'Постоянные расходы', mode: 'scale', itemKey: 'amount' },
  ],
  metrics: [{ key: 'profit', label: 'Прибыль за год', fmt: 'money' }, { key: 'minCash', label: 'Мин. остаток денег', fmt: 'money' }],
  schema: [
    {
      id: 'sales',
      title: 'Шаг 1. План продаж',
      level: 'basic',
      fields: [
        {
          key: 'products',
          label: 'Продукты / услуги (выручка в январе и рост в месяц)',
          type: 'items',
          itemFields: [
            { key: 'name', label: 'Продукт', type: 'text' },
            { key: 'base', label: 'Выручка в янв.', type: 'number' },
            { key: 'growth', label: 'Рост в месяц, %', type: 'number', step: 0.5 },
          ],
          newItem: () => ({ name: 'Продукт', base: 100, growth: 3 }),
        },
        { key: 'receivableLag', label: 'Отсрочка оплаты покупателями, мес. (0 — по факту)', type: 'int', min: 0, max: 3, level: 'pro' },
      ],
    },
    {
      id: 'costs',
      title: 'Шаг 2. Затраты',
      level: 'basic',
      fields: [
        { key: 'varPct', label: 'Переменные затраты (зарплата и т.п.), % от выручки', type: 'percent', min: 0, max: 100 },
        { key: 'varLag', label: 'Оплата переменных затрат, лаг мес.', type: 'int', min: 0, max: 2, level: 'pro' },
        {
          key: 'fixed',
          label: 'Постоянные расходы в месяц',
          type: 'items',
          itemFields: [
            { key: 'name', label: 'Статья', type: 'text' },
            { key: 'amount', label: 'Сумма в мес.', type: 'number' },
            { key: 'lag', label: 'Лаг оплаты, мес.', type: 'int', min: 0, max: 2 },
          ],
          newItem: () => ({ name: 'Статья', amount: 0, lag: 0 }),
        },
        { key: 'openingCash', label: 'Остаток денег на 1 января', type: 'number' },
        { key: 'taxRate', label: 'Налог на прибыль (платится в следующем месяце)', type: 'percent', level: 'pro' },
      ],
    },
  ],
  samples: [
    {
      id: 'fd',
      name: 'Пример fd.ru: сервисная компания',
      inputs: { products: [{ name: 'Услуга 1', base: 30, growth: 5.1 }, { name: 'Услуга 2', base: 30, growth: 6.1 }, { name: 'Услуга 3', base: 65, growth: 5.7 }], receivableLag: 0, varPct: 30, varLag: 1, fixed: [{ name: 'Аренда', amount: 30, lag: 1 }, { name: 'Управленческие расходы', amount: 50, lag: 0 }], openingCash: 10, taxRate: 0 },
    },
    {
      id: 'agency',
      name: 'Маркетинговое агентство',
      inputs: { products: [{ name: 'Performance', base: 1200, growth: 4 }, { name: 'SMM', base: 600, growth: 6 }, { name: 'Консалтинг', base: 300, growth: 2 }], receivableLag: 1, varPct: 45, varLag: 0, fixed: [{ name: 'Офис', amount: 250, lag: 1 }, { name: 'Административный персонал', amount: 400, lag: 0 }, { name: 'ПО и сервисы', amount: 120, lag: 0 }], openingCash: 900, taxRate: 20 },
    },
  ],
  compute(i) {
    const M = 12;
    const products = (i.products || []).map((p) => ({ name: p.name, series: F.growthSeries(Number(p.base) || 0, pct(p.growth), M, { startAt: 0 }) }));
    const revenue = new Array(M).fill(0);
    for (const p of products) for (let t = 0; t < M; t++) revenue[t] += p.series[t];
    const varCost = revenue.map((v) => v * pct(i.varPct));
    const fixedItems = (i.fixed || []).map((f) => ({ name: f.name, amount: Number(f.amount) || 0, lag: Number(f.lag) || 0 }));
    const fixedTotal = new Array(M).fill(0);
    for (const f of fixedItems) for (let t = 0; t < M; t++) fixedTotal[t] += f.amount;
    const opProfit = revenue.map((v, t) => v - varCost[t] - fixedTotal[t]);
    const taxRate = pct(i.taxRate);
    const tax = opProfit.map((v) => Math.max(0, v) * taxRate);
    const netProfit = opProfit.map((v, t) => v - tax[t]);
    // ПДДС
    const lagPay = (series, lag) => series.map((_, t) => (t - lag >= 0 ? series[t - lag] : 0));
    const receipts = lagPay(revenue, Number(i.receivableLag) || 0);
    const varPaid = lagPay(varCost, Number(i.varLag) || 0);
    const fixedPaid = new Array(M).fill(0);
    for (const f of fixedItems) for (let t = 0; t < M; t++) if (t - f.lag >= 0) fixedPaid[t] += f.amount;
    const taxPaid = lagPay(tax, 1);
    const opFlow = receipts.map((v, t) => v - varPaid[t] - fixedPaid[t] - taxPaid[t]);
    const cash = [];
    let c = Number(i.openingCash) || 0;
    const cashOpen = [];
    for (let t = 0; t < M; t++) {
      cashOpen.push(c);
      c += opFlow[t];
      cash.push(c);
    }
    // баланс
    const recv = revenue.map((_, t) => F.sum(revenue.slice(0, t + 1)) - F.sum(receipts.slice(0, t + 1)));
    const pay = revenue.map((_, t) => F.sum(varCost.slice(0, t + 1)) + F.sum(fixedTotal.slice(0, t + 1)) + F.sum(tax.slice(0, t + 1)) - F.sum(varPaid.slice(0, t + 1)) - F.sum(fixedPaid.slice(0, t + 1)) - F.sum(taxPaid.slice(0, t + 1)));
    const equity = revenue.map((_, t) => (Number(i.openingCash) || 0) + F.sum(netProfit.slice(0, t + 1)));
    const assets = cash.map((v, t) => v + recv[t]);
    const liab = pay.map((v, t) => v + equity[t]);
    const check = assets.every((v, t) => Math.abs(v - liab[t]) < 1e-6);
    const cols = [{ label: 'Показатель', fmt: 'text' }, ...MONTHS.map((l) => ({ label: l, fmt: 'money' })), { label: 'Итого', fmt: 'money' }];
    const withTotal = (arr) => [...arr, F.sum(arr)];
    const pdr = {
      id: 'pdr',
      title: 'План доходов и расходов (БДР)',
      columns: cols,
      rows: [
        { cells: ['Операционные доходы', ...withTotal(revenue)], style: 'subtotal' },
        ...products.map((p) => ({ cells: [`  ${p.name}`, ...withTotal(p.series)] })),
        { cells: ['Операционные расходы', ...withTotal(varCost.map((v, t) => v + fixedTotal[t]))], style: 'subtotal' },
        { cells: ['  Переменные (зарплата)', ...withTotal(varCost)] },
        ...fixedItems.map((f) => ({ cells: [`  ${f.name}`, ...withTotal(new Array(M).fill(f.amount))] })),
        { cells: ['Операционная прибыль', ...withTotal(opProfit)], style: 'total' },
        { cells: ['Рентабельность', ...revenue.map((v, t) => (v ? opProfit[t] / v : null)), F.sum(revenue) ? F.sum(opProfit) / F.sum(revenue) : null], fmt: 'pct' },
        { cells: ['Налог на прибыль', ...withTotal(tax)] },
        { cells: ['Чистая прибыль', ...withTotal(netProfit)], style: 'total' },
        { cells: ['Прибыль нарастающим итогом', ...F.cumulative(netProfit), null] },
      ],
    };
    const pdds = {
      id: 'pdds',
      title: 'План движения денежных средств (БДДС)',
      columns: cols,
      rows: [
        { cells: ['Поступления от покупателей', ...withTotal(receipts)] },
        { cells: ['Платежи: переменные затраты', ...withTotal(varPaid.map((v) => -v))] },
        { cells: ['Платежи: постоянные расходы', ...withTotal(fixedPaid.map((v) => -v))] },
        { cells: ['Платежи: налог', ...withTotal(taxPaid.map((v) => -v))] },
        { cells: ['Сальдо по операционной деятельности', ...withTotal(opFlow)], style: 'total' },
        { cells: ['Остаток на начало', ...cashOpen, null] },
        { cells: ['Остаток на конец', ...cash, null], style: 'total' },
      ],
    };
    const bal = {
      id: 'balance',
      title: 'Прогнозный баланс (на конец месяца)',
      columns: [{ label: 'Статья', fmt: 'text' }, ...MONTHS.map((l) => ({ label: l, fmt: 'money' }))],
      rows: [
        { cells: ['Денежные средства', ...cash] },
        { cells: ['Дебиторская задолженность', ...recv] },
        { cells: ['АКТИВЫ', ...assets], style: 'total' },
        { cells: ['Кредиторская задолженность', ...pay] },
        { cells: ['Капитал (с нераспределённой прибылью)', ...equity] },
        { cells: ['ПАССИВЫ', ...liab], style: 'total' },
        { cells: ['Проверка: актив − пассив', ...assets.map((v, t) => v - liab[t])], style: check ? undefined : 'warn' },
      ],
    };
    const minCash = Math.min(...cash);
    const minIdx = cash.indexOf(minCash);
    return {
      kpis: [m('Выручка за год', F.sum(revenue)), m('Чистая прибыль за год', F.sum(netProfit), 'money', F.sum(netProfit) > 0), m('Рентабельность за год', F.sum(revenue) ? F.sum(netProfit) / F.sum(revenue) : null, 'pct'), m('Денежный поток за год', F.sum(opFlow), 'money', F.sum(opFlow) > 0), m('Минимальный остаток денег', minCash, 'money', minCash >= 0, `${MONTHS[minIdx]}`), m('Остаток денег на конец года', cash[M - 1]), m('Баланс сходится', check ? 1 : 0, 'bool', check)],
      tables: [pdr, pdds, bal],
      charts: [
        { id: 'pl', title: 'Выручка, расходы и прибыль по месяцам', type: 'mixed', labels: MONTHS, datasets: [{ label: 'Выручка', data: revenue, type: 'bar' }, { label: 'Расходы', data: varCost.map((v, t) => v + fixedTotal[t]), type: 'bar' }, { label: 'Чистая прибыль', data: netProfit, type: 'line' }] },
        { id: 'cash', title: 'Остаток денежных средств', type: 'line', labels: MONTHS, datasets: [{ label: 'Остаток на конец', data: cash }], zeroLine: true },
      ],
      conclusion: [
        `Годовая выручка ${Math.round(F.sum(revenue)).toLocaleString('ru-RU')}, чистая прибыль ${Math.round(F.sum(netProfit)).toLocaleString('ru-RU')} (рентабельность ${F.sum(revenue) ? ((F.sum(netProfit) / F.sum(revenue)) * 100).toFixed(1) : '—'} %).`,
        minCash < 0 ? `Кассовый разрыв в ${MONTHS[minIdx]}: остаток денег ${Math.round(minCash).toLocaleString('ru-RU')}. Нужны овердрафт, отсрочка платежей или перенос расходов.` : `Денежный остаток положителен весь год, минимум ${Math.round(minCash).toLocaleString('ru-RU')} в ${MONTHS[minIdx]}.`,
        check ? 'Прогнозный баланс сходится: активы равны пассивам в каждом месяце — модель корректна.' : 'Внимание: баланс не сходится, проверьте лаги оплаты.',
      ],
      metric: { profit: F.sum(netProfit), minCash },
    };
  },
  metric(i, key = 'profit') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Оценка бизнеса DCF ---------- */
export const valuationTemplate = {
  id: 'valuation',
  category: 'reports',
  subcategory: 'Отчёты для оценки бизнеса',
  title: 'Оценка стоимости бизнеса методом DCF',
  short: 'Прогноз FCF → терминальная стоимость → EV → стоимость капитала',
  description: 'Доходный подход: свободный денежный поток на прогнозный период, терминальная стоимость по Гордону или мультипликатору, вычет чистого долга. Дополнительно — чувствительность к WACC и темпу роста.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['DCF', 'EV', 'Гордон'],
  periodsPath: 'years',
  drivers: [
    { path: 'fcf', label: 'Свободный поток', mode: 'scale' },
    { path: 'wacc', label: 'WACC, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'growth', label: 'Рост в постпрогнозном периоде, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'netDebt', label: 'Чистый долг', mode: 'scale' },
  ],
  metrics: [{ key: 'equity', label: 'Стоимость капитала', fmt: 'money' }, { key: 'ev', label: 'EV', fmt: 'money' }],
  schema: [
    {
      id: 'v',
      title: 'Прогноз',
      level: 'basic',
      fields: [
        { key: 'years', label: 'Прогнозный период, лет', type: 'int', min: 1, max: 15 },
        { key: 'fcf', label: 'Свободный денежный поток по годам (1 … N)', type: 'series', lengthFrom: 'years' },
        { key: 'wacc', label: 'WACC', type: 'percent', step: 0.5 },
        { key: 'terminalMethod', label: 'Терминальная стоимость', type: 'select', options: [{ value: 'gordon', label: 'Модель Гордона' }, { value: 'multiple', label: 'Мультипликатор к FCF последнего года' }, { value: 'none', label: 'Не учитывать' }] },
        { key: 'growth', label: 'Долгосрочный рост', type: 'percent', step: 0.5, showIf: { path: 'terminalMethod', equals: 'gordon' } },
        { key: 'multiple', label: 'Мультипликатор', type: 'number', showIf: { path: 'terminalMethod', equals: 'multiple' } },
        { key: 'netDebt', label: 'Чистый долг (долг − деньги)', type: 'number' },
        { key: 'midYear', label: 'Дисконтировать на середину года', type: 'bool', level: 'pro' },
        { key: 'shares', label: 'Количество акций / долей (для цены за штуку)', type: 'number', level: 'pro', optional: true },
      ],
    },
  ],
  samples: [{ id: 'mid', name: 'Производственная компания', inputs: { years: 5, fcf: [420, 480, 540, 590, 630], wacc: 17, terminalMethod: 'gordon', growth: 4, multiple: 8, netDebt: 900, midYear: false, shares: 1000 } }],
  compute(i) {
    const N = Math.max(1, Math.round(Number(i.years) || 5));
    const fcf = fitSeries(i.fcf, N);
    const r = pct(i.wacc);
    const g = pct(i.growth);
    const flows = [0, ...fcf];
    const pvFlows = F.npv(r, flows, { midYear: !!i.midYear });
    let tv = 0;
    if (i.terminalMethod === 'gordon') tv = F.gordonTerminalValue(fcf[N - 1], g, r) || 0;
    else if (i.terminalMethod === 'multiple') tv = fcf[N - 1] * (Number(i.multiple) || 0);
    const pvTv = tv / Math.pow(1 + r, N);
    const ev = pvFlows + pvTv;
    const equity = ev - (Number(i.netDebt) || 0);
    const shares = Number(i.shares) || 0;
    // матрица чувствительности WACC × g
    const waccs = [-2, -1, 0, 1, 2].map((d) => r + d / 100);
    const gs = [-1, -0.5, 0, 0.5, 1].map((d) => g + d / 100);
    const matrix = waccs.map((w) => ({ cells: [w, ...gs.map((gg) => {
      const t = i.terminalMethod === 'gordon' ? F.gordonTerminalValue(fcf[N - 1], gg, w) || 0 : tv;
      return F.npv(w, flows, { midYear: !!i.midYear }) + t / Math.pow(1 + w, N) - (Number(i.netDebt) || 0);
    })] }));
    const labels = Array.from({ length: N }, (_, t) => `Год ${t + 1}`);
    const df = F.discountFactors(r, N + 1, { midYear: !!i.midYear }).slice(1);
    return {
      kpis: [m('Стоимость бизнеса (EV)', ev), m('Стоимость собственного капитала', equity, 'money', equity > 0), m('PV прогнозных потоков', pvFlows), m('PV терминальной стоимости', pvTv, 'money', null, ev ? `Доля в EV ${((pvTv / ev) * 100).toFixed(0)} %` : ''), ...(shares ? [m('Стоимость одной доли / акции', equity / shares)] : [])],
      tables: [
        { id: 'dcf', title: 'Дисконтирование потоков', columns: [{ label: 'Показатель', fmt: 'text' }, ...labels.map((l) => ({ label: l, fmt: 'money' }))], rows: [{ cells: ['FCF', ...fcf] }, { cells: ['Коэффициент дисконтирования', ...df], fmt: 'factor' }, { cells: ['PV FCF', ...fcf.map((v, t) => v * df[t])], style: 'total' }] },
        { id: 'bridge', title: 'Мост к стоимости капитала', columns: [{ label: 'Компонент', fmt: 'text' }, { label: 'Сумма', fmt: 'money' }], rows: [{ cells: ['PV прогнозных потоков', pvFlows] }, { cells: ['Терминальная стоимость (на конец периода)', tv] }, { cells: ['PV терминальной стоимости', pvTv] }, { cells: ['EV', ev], style: 'subtotal' }, { cells: ['− Чистый долг', -(Number(i.netDebt) || 0)] }, { cells: ['Стоимость собственного капитала', equity], style: 'total' }] },
        { id: 'matrix', title: 'Чувствительность стоимости капитала: WACC (строки) × рост g (столбцы)', columns: [{ label: 'WACC \\ g', fmt: 'pct' }, ...gs.map((gg) => ({ label: `${(gg * 100).toFixed(1)} %`, fmt: 'money' }))], rows: matrix },
      ],
      charts: [{ id: 'bridge', title: 'Состав стоимости', type: 'bar', labels: ['PV потоков', 'PV терминальной', 'EV', 'Чистый долг', 'Капитал'], datasets: [{ label: 'Сумма', data: [pvFlows, pvTv, ev, -(Number(i.netDebt) || 0), equity] }] }],
      conclusion: [
        `EV = ${Math.round(ev).toLocaleString('ru-RU')}, стоимость собственного капитала ${Math.round(equity).toLocaleString('ru-RU')} при WACC ${i.wacc} %${i.terminalMethod === 'gordon' ? ` и росте ${i.growth} %` : ''}.`,
        ev && pvTv / ev > 0.6 ? `Терминальная стоимость формирует ${((pvTv / ev) * 100).toFixed(0)} % EV — оценка чувствительна к g и WACC, см. матрицу.` : 'Основная часть стоимости формируется в прогнозном периоде.',
        `Диапазон стоимости капитала при WACC ±2 п.п. и g ±1 п.п.: от ${Math.round(Math.min(...matrix.flatMap((x) => x.cells.slice(1)))).toLocaleString('ru-RU')} до ${Math.round(Math.max(...matrix.flatMap((x) => x.cells.slice(1)))).toLocaleString('ru-RU')}.`,
      ],
      flows: [-(Number(i.netDebt) || 0), ...fcf],
      metric: { equity, ev },
    };
  },
  metric(i, key = 'equity') {
    return this.compute(i).metric[key];
  },
};
