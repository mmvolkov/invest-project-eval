/**
 * Шаблоны «Инвестиции»: WACC, кредитный калькулятор, лизинг vs кредит, сравнение проектов.
 */
import * as F from '../engine/finance.js';
import { pct, fitSeries } from '../engine/utils.js';

const m = (label, value, fmt = 'money', good = null, hint) => ({ key: label, label, value, fmt, good, hint });

/** ---------- WACC ---------- */
export const waccTemplate = {
  id: 'wacc',
  category: 'invest',
  subcategory: 'Расчёт инвестиционных показателей',
  title: 'Расчёт WACC и ставки дисконтирования',
  short: 'CAPM + стоимость долга → средневзвешенная стоимость капитала',
  description: 'Стоимость собственного капитала по CAPM (безрисковая ставка, бета, премия за рыночный риск, страновая и специфические премии), стоимость долга с налоговым щитом и итоговый WACC. Дополнительно — реальная ставка по Фишеру.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['WACC', 'CAPM', 'ставка'],
  drivers: [
    { path: 'beta', label: 'Бета', mode: 'scale' },
    { path: 'rf', label: 'Безрисковая ставка, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'mrp', label: 'Премия за рыночный риск, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'costDebt', label: 'Стоимость долга, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'debt', label: 'Долг', mode: 'scale' },
  ],
  metrics: [{ key: 'wacc', label: 'WACC', fmt: 'pct' }, { key: 'costEquity', label: 'Стоимость СК', fmt: 'pct' }],
  schema: [
    {
      id: 'equity',
      title: 'Стоимость собственного капитала (CAPM)',
      level: 'basic',
      fields: [
        { key: 'rf', label: 'Безрисковая ставка (ОФЗ)', type: 'percent', step: 0.1 },
        { key: 'beta', label: 'Бета (с учётом долга)', type: 'number', step: 0.05 },
        { key: 'mrp', label: 'Премия за рыночный риск', type: 'percent', step: 0.1 },
        { key: 'country', label: 'Страновая премия', type: 'percent', step: 0.1, level: 'pro' },
        { key: 'size', label: 'Премия за размер', type: 'percent', step: 0.1, level: 'pro' },
        { key: 'specific', label: 'Специфический риск компании', type: 'percent', step: 0.1, level: 'pro' },
      ],
    },
    {
      id: 'structure',
      title: 'Структура и стоимость долга',
      level: 'basic',
      fields: [
        { key: 'equity', label: 'Собственный капитал (рыночная оценка)', type: 'number', min: 0 },
        { key: 'debt', label: 'Заёмный капитал', type: 'number', min: 0 },
        { key: 'costDebt', label: 'Стоимость долга (ставка по кредитам)', type: 'percent', step: 0.1 },
        { key: 'taxRate', label: 'Налог на прибыль', type: 'percent' },
        { key: 'inflation', label: 'Инфляция (для реальной ставки)', type: 'percent', step: 0.1, level: 'pro' },
      ],
    },
  ],
  samples: [
    { id: 'rf', name: 'Производственная компания, РФ', inputs: { rf: 14, beta: 1.1, mrp: 6, country: 2, size: 1.5, specific: 1, equity: 600, debt: 400, costDebt: 19, taxRate: 20, inflation: 6 } },
    { id: 'it', name: 'ИТ-компания без долга', inputs: { rf: 14, beta: 1.4, mrp: 6, country: 2, size: 3, specific: 2, equity: 1000, debt: 0, costDebt: 0, taxRate: 5, inflation: 6 } },
  ],
  compute(i) {
    const ce = F.capm({ rf: pct(i.rf), beta: Number(i.beta) || 0, mrp: pct(i.mrp), country: pct(i.country), size: pct(i.size), specific: pct(i.specific) });
    const E = Number(i.equity) || 0;
    const D = Number(i.debt) || 0;
    const w = F.wacc({ equity: E, debt: D, costEquity: ce, costDebt: pct(i.costDebt), taxRate: pct(i.taxRate) });
    const real = w != null ? F.fisherReal(w, pct(i.inflation)) : null;
    const total = E + D;
    const rows = [
      { cells: ['Безрисковая ставка', pct(i.rf)] },
      { cells: ['+ Бета × премия за рыночный риск', (Number(i.beta) || 0) * pct(i.mrp)] },
      { cells: ['+ Страновая премия', pct(i.country)] },
      { cells: ['+ Премия за размер', pct(i.size)] },
      { cells: ['+ Специфический риск', pct(i.specific)] },
      { cells: ['= Стоимость собственного капитала', ce], style: 'total' },
      { cells: ['Стоимость долга до налога', pct(i.costDebt)] },
      { cells: ['Стоимость долга после налога', pct(i.costDebt) * (1 - pct(i.taxRate))] },
      { cells: ['Доля собственного капитала', total ? E / total : null] },
      { cells: ['Доля долга', total ? D / total : null] },
      { cells: ['WACC', w], style: 'total' },
      { cells: ['WACC реальный (Фишер)', real] },
    ];
    return {
      kpis: [m('WACC', w, 'pct'), m('Стоимость собственного капитала', ce, 'pct'), m('Стоимость долга после налога', pct(i.costDebt) * (1 - pct(i.taxRate)), 'pct'), m('Доля долга', total ? D / total : null, 'pct'), m('Реальная ставка', real, 'pct')],
      tables: [{ id: 'wacc', title: 'Расчёт WACC', columns: [{ label: 'Компонент', fmt: 'text' }, { label: 'Значение', fmt: 'pct' }], rows }],
      charts: [{ id: 'struct', title: 'Структура капитала', type: 'doughnut', labels: ['Собственный капитал', 'Долг'], datasets: [{ label: 'Доля', data: [E, D] }] }],
      conclusion: [
        `Стоимость собственного капитала по CAPM — ${(ce * 100).toFixed(1)} %, долга после налогового щита — ${(pct(i.costDebt) * (1 - pct(i.taxRate)) * 100).toFixed(1)} %.`,
        w != null ? `WACC = ${(w * 100).toFixed(1)} % — используйте как ставку дисконтирования для проектов с типичным для компании риском; для более рисковых проектов добавляйте премию.` : 'Задайте структуру капитала.',
        real != null ? `В реальном выражении (без инфляции ${i.inflation} %) ставка составляет ${(real * 100).toFixed(1)} % — применяйте её к потокам в постоянных ценах.` : '',
      ].filter(Boolean),
      metric: { wacc: w, costEquity: ce },
    };
  },
  metric(i, key = 'wacc') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Кредитный калькулятор ---------- */
export const loanTemplate = {
  id: 'loan',
  category: 'invest',
  subcategory: 'Расчёт инвестиционных показателей',
  title: 'Кредит: график платежей и реальная ставка',
  short: 'Аннуитет / дифференцированный, комиссии и страховка → эффективная ставка (IRR)',
  description: 'Строит график платежей и считает реальную стоимость кредита с учётом комиссий и страховки через IRR потока, как рекомендует методика проверки банковских предложений.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['аннуитет', 'IRR', 'эффективная ставка'],
  drivers: [
    { path: 'rate', label: 'Ставка, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'insurancePct', label: 'Страховка, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'feePct', label: 'Комиссия, п.п.', mode: 'shift', shiftScale: 10 },
  ],
  metrics: [{ key: 'effRate', label: 'Эффективная ставка', fmt: 'pct' }, { key: 'overpay', label: 'Переплата', fmt: 'money' }],
  schema: [
    {
      id: 'loan',
      title: 'Условия кредита',
      level: 'basic',
      fields: [
        { key: 'amount', label: 'Сумма кредита', type: 'number', min: 0 },
        { key: 'rate', label: 'Ставка, % годовых', type: 'percent', step: 0.1 },
        { key: 'years', label: 'Срок, лет', type: 'number', min: 0.25, step: 0.25 },
        { key: 'perYear', label: 'Платежей в год', type: 'select', options: [{ value: 1, label: '1 (ежегодно)' }, { value: 4, label: '4 (ежеквартально)' }, { value: 12, label: '12 (ежемесячно)' }] },
        { key: 'type', label: 'Тип платежей', type: 'select', options: [{ value: 'annuity', label: 'Аннуитет' }, { value: 'equal', label: 'Дифференцированный' }, { value: 'bullet', label: 'Проценты, тело в конце' }] },
        { key: 'grace', label: 'Отсрочка погашения тела, периодов', type: 'int', min: 0, level: 'pro' },
        { key: 'feePct', label: 'Разовая комиссия, % от суммы', type: 'percent', step: 0.1, level: 'pro' },
        { key: 'insurancePct', label: 'Страховка, % от суммы в год', type: 'percent', step: 0.1, level: 'pro' },
      ],
    },
  ],
  samples: [
    { id: 'fd', name: 'Пример fd.ru: 1 млн на 5 лет под 10 % + страховка 2 %', inputs: { amount: 1000000, rate: 10, years: 5, perYear: 1, type: 'annuity', grace: 0, feePct: 0, insurancePct: 2 } },
    { id: 'monthly', name: 'Оборотный кредит 10 млн, 20 %, 3 года, ежемесячно', inputs: { amount: 10000, rate: 20, years: 3, perYear: 12, type: 'annuity', grace: 0, feePct: 1, insurancePct: 0 } },
  ],
  compute(i) {
    const perYear = Number(i.perYear) || 1;
    const n = Math.max(1, Math.round((Number(i.years) || 1) * perYear));
    const rate = pct(i.rate) / perYear;
    const amount = Number(i.amount) || 0;
    const rows = F.loanSchedule({ amount, rate, term: n, type: i.type || 'annuity', start: 0, grace: Number(i.grace) || 0 }, n);
    const fee = amount * pct(i.feePct);
    const insurance = amount * pct(i.insurancePct); // в год от первоначальной суммы
    const flows = rows.map((r, t) => {
      let cf = r.drawdown - r.payment;
      if (t === 0) cf -= fee;
      if (t > 0 && (t - 1) % perYear === 0) cf -= insurance; // страховка в начале каждого года
      return cf;
    });
    const irrP = F.irr(flows);
    const effRate = irrP != null ? F.effectiveAnnual(irrP, perYear) : null;
    const nominalEff = F.effectiveAnnual(rate, perYear);
    const totalPaid = F.sum(rows.map((r) => r.payment)) + fee + insurance * Math.ceil(n / perYear);
    const overpay = totalPaid - amount;
    const totalInterest = F.sum(rows.map((r) => r.interest));
    const tableRows = rows.slice(1).map((r, idx) => ({ cells: [idx + 1, r.opening, r.payment, r.interest, r.principal, r.closing] }));
    tableRows.push({ cells: ['Итого', null, F.sum(rows.map((r) => r.payment)), totalInterest, F.sum(rows.map((r) => r.principal)), null], style: 'total' });
    return {
      kpis: [
        m('Платёж за период', rows[1] ? rows[1].payment : null, 'money', null, i.type === 'annuity' ? 'Аннуитетный платёж' : 'Первый платёж'),
        m('Эффективная годовая ставка (с комиссиями)', effRate, 'pct', effRate != null ? effRate <= pct(i.rate) + 0.005 : null, 'IRR потока по кредиту, приведённый к году'),
        m('Эффективная ставка без доп. платежей', nominalEff, 'pct'),
        m('Проценты всего', totalInterest, 'money'),
        m('Переплата всего (с комиссиями)', overpay, 'money'),
        m('Всего выплат', totalPaid, 'money'),
      ],
      tables: [{ id: 'schedule', title: 'График платежей', columns: [{ label: '№', fmt: 'int' }, { label: 'Долг на начало', fmt: 'money' }, { label: 'Платёж', fmt: 'money' }, { label: 'Проценты', fmt: 'money' }, { label: 'Тело', fmt: 'money' }, { label: 'Долг на конец', fmt: 'money' }], rows: tableRows }],
      charts: [{ id: 'sched', title: 'Структура платежей', type: 'bar', stacked: true, labels: rows.slice(1).map((_, k) => String(k + 1)), datasets: [{ label: 'Проценты', data: rows.slice(1).map((r) => r.interest) }, { label: 'Тело', data: rows.slice(1).map((r) => r.principal) }] }],
      conclusion: [
        `Номинальная ставка ${i.rate} % при ${perYear} платежах в год эквивалентна ${(nominalEff * 100).toFixed(2)} % эффективных.`,
        effRate != null ? `С учётом комиссии ${i.feePct || 0} % и страховки ${i.insurancePct || 0} % в год реальная стоимость кредита — ${(effRate * 100).toFixed(2)} % годовых (${((effRate - nominalEff) * 100).toFixed(2)} п.п. сверх номинала).` : 'Не удалось рассчитать IRR потока.',
        `Переплата за весь срок — ${Math.round(overpay).toLocaleString('ru-RU')}, из них проценты ${Math.round(totalInterest).toLocaleString('ru-RU')}.`,
      ],
      flows,
      metric: { effRate, overpay },
    };
  },
  metric(i, key = 'effRate') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Лизинг vs кредит ---------- */
export const leasingTemplate = {
  id: 'leasing',
  category: 'invest',
  subcategory: 'Анализ инвестиционных показателей',
  title: 'Лизинг или кредит: сравнение по приведённым затратам',
  short: 'PV затрат с учётом налогового щита, амортизации и выкупа',
  description: 'Сравнивает два способа финансирования актива: кредит (проценты и амортизация уменьшают налог) и лизинг (платежи полностью в расходах, ускоренная амортизация у лизингодателя). Критерий — минимальная приведённая стоимость затрат после налога.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['лизинг', 'кредит', 'налоговый щит'],
  drivers: [
    { path: 'leaseRate', label: 'Удорожание лизинга, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'loanRate', label: 'Ставка кредита, п.п.', mode: 'shift', shiftScale: 10 },
    { path: 'discountRate', label: 'Ставка дисконтирования, п.п.', mode: 'shift', shiftScale: 10 },
  ],
  metrics: [{ key: 'diff', label: 'Выгода лизинга (PV)', fmt: 'money' }],
  schema: [
    {
      id: 'asset',
      title: 'Актив и параметры',
      level: 'basic',
      fields: [
        { key: 'price', label: 'Стоимость актива (без НДС)', type: 'number', min: 0 },
        { key: 'years', label: 'Срок, лет', type: 'int', min: 1, max: 15 },
        { key: 'discountRate', label: 'Ставка дисконтирования', type: 'percent', step: 0.5 },
        { key: 'taxRate', label: 'Налог на прибыль', type: 'percent' },
        { key: 'life', label: 'СПИ актива, лет', type: 'int', min: 1 },
      ],
    },
    {
      id: 'loan',
      title: 'Кредит',
      level: 'basic',
      fields: [
        { key: 'loanRate', label: 'Ставка кредита, % годовых', type: 'percent', step: 0.5 },
        { key: 'advanceLoan', label: 'Собственные средства (первый взнос)', type: 'percent', min: 0, max: 100 },
      ],
    },
    {
      id: 'lease',
      title: 'Лизинг',
      level: 'basic',
      fields: [
        { key: 'leaseRate', label: 'Ставка удорожания лизинга, % годовых', type: 'percent', step: 0.5 },
        { key: 'advanceLease', label: 'Аванс по лизингу', type: 'percent', min: 0, max: 100 },
        { key: 'buyout', label: 'Выкупная стоимость, % от цены', type: 'percent', min: 0, max: 100 },
        { key: 'accel', label: 'Коэффициент ускоренной амортизации у лизинга', type: 'number', min: 1, max: 3, step: 0.5, level: 'pro' },
      ],
    },
  ],
  samples: [{ id: 'truck', name: 'Грузовик 12 млн, 4 года', inputs: { price: 12000, years: 4, discountRate: 18, taxRate: 20, life: 7, loanRate: 19, advanceLoan: 20, leaseRate: 16, advanceLease: 20, buyout: 1, accel: 3 } }],
  compute(i) {
    const price = Number(i.price) || 0;
    const N = Math.max(1, Math.round(Number(i.years) || 1));
    const r = pct(i.discountRate);
    const tax = pct(i.taxRate);
    const n = N + 1;
    // --- Кредит ---
    const loanAmt = price * (1 - pct(i.advanceLoan));
    const sched = F.loanSchedule({ amount: loanAmt, rate: pct(i.loanRate), term: N, type: 'annuity', start: 0 }, N);
    const depr = F.depreciationSchedule({ amount: price, period: 0, life: Number(i.life) || N }, N).schedule;
    const loanFlows = new Array(n).fill(0);
    loanFlows[0] = -(price - loanAmt);
    for (let t = 1; t < n; t++) {
      const shield = (sched[t].interest + depr[t]) * tax;
      loanFlows[t] = -sched[t].payment + shield;
    }
    // --- Лизинг ---
    const advance = price * pct(i.advanceLease);
    const buyout = price * pct(i.buyout);
    const financed = price - advance;
    const leasePay = F.annuityPayment(financed, pct(i.leaseRate), N); // упрощённо: аннуитет по ставке удорожания
    const leaseFlows = new Array(n).fill(0);
    leaseFlows[0] = -advance + advance * tax; // аванс в расходах (упрощение: равномерно – здесь сразу)
    for (let t = 1; t < n; t++) leaseFlows[t] = -leasePay + leasePay * tax;
    leaseFlows[N] += -buyout;
    const pvLoan = F.npv(r, loanFlows);
    const pvLease = F.npv(r, leaseFlows);
    const diff = pvLease - pvLoan; // >0 → лизинг дешевле (затраты отрицательные)
    const labels = Array.from({ length: n }, (_, t) => (t === 0 ? 'Старт' : `Год ${t}`));
    const rows = [
      { cells: ['Кредит: платежи', ...sched.map((s, t) => (t === 0 ? -(price - loanAmt) : -s.payment))] },
      { cells: ['Кредит: налоговый щит (проценты + амортизация)', ...sched.map((s, t) => (t === 0 ? 0 : (s.interest + depr[t]) * tax))] },
      { cells: ['Кредит: поток после налога', ...loanFlows], style: 'total' },
      { cells: ['Лизинг: платежи', ...leaseFlows.map((_, t) => (t === 0 ? -advance : -leasePay - (t === N ? buyout : 0)))] },
      { cells: ['Лизинг: налоговый щит', ...leaseFlows.map((_, t) => (t === 0 ? advance * tax : leasePay * tax))] },
      { cells: ['Лизинг: поток после налога', ...leaseFlows], style: 'total' },
    ];
    return {
      kpis: [m('PV затрат — кредит', -pvLoan, 'money'), m('PV затрат — лизинг', -pvLease, 'money'), m('Выгода лизинга относительно кредита', diff, 'money', diff > 0), m('Лизинговый платёж в год', leasePay, 'money'), m('Платёж по кредиту в год', sched[1]?.payment, 'money')],
      tables: [{ id: 'cmp', title: 'Потоки после налога', columns: [{ label: 'Показатель', fmt: 'text' }, ...labels.map((l) => ({ label: l, fmt: 'money' }))], rows }],
      charts: [{ id: 'cmp', title: 'Приведённые затраты', type: 'bar', labels: ['Кредит', 'Лизинг'], datasets: [{ label: 'PV затрат', data: [-pvLoan, -pvLease] }] }],
      conclusion: [
        diff > 0 ? `Лизинг дешевле кредита на ${Math.round(diff).toLocaleString('ru-RU')} в приведённой оценке (${((diff / -pvLoan) * 100).toFixed(1)} % затрат).` : `Кредит дешевле лизинга на ${Math.round(-diff).toLocaleString('ru-RU')} в приведённой оценке.`,
        'Результат чувствителен к ставке дисконтирования: чем она выше, тем выгоднее схема с отложенными платежами. Проверьте вкладку «Чувствительность».',
        'Упрощения: НДС не учитывается, аванс по лизингу списывается сразу, лизинговый платёж аннуитетный по ставке удорожания.',
      ],
      metric: { diff },
    };
  },
  metric(i, key = 'diff') {
    return this.compute(i).metric[key];
  },
};

/** ---------- Сравнение проектов ---------- */
export const compareTemplate = {
  id: 'compare',
  category: 'invest',
  subcategory: 'Анализ инвестиционных показателей',
  title: 'Сравнительный анализ инвестиционных проектов',
  short: 'До 6 проектов: NPV, IRR, PI, DPP, ранжирование и приростной IRR',
  description: 'Введите чистые денежные потоки альтернативных проектов (t = 0..N). Сервис рассчитает показатели, отранжирует проекты по каждому критерию и покажет приростной поток для пары лидеров — чтобы выбрать между взаимоисключающими проектами.',
  levels: ['basic', 'pro'],
  minLevel: 'basic',
  tags: ['сравнение', 'ранжирование', 'NPV', 'IRR'],
  drivers: [{ path: 'discountRate', label: 'Ставка дисконтирования, п.п.', mode: 'shift', shiftScale: 10 }],
  metrics: [{ key: 'bestNpv', label: 'Лучший NPV', fmt: 'money' }],
  schema: [
    {
      id: 'p',
      title: 'Параметры',
      level: 'basic',
      fields: [
        { key: 'discountRate', label: 'Ставка дисконтирования', type: 'percent', step: 0.5 },
        { key: 'horizon', label: 'Горизонт, периодов', type: 'int', min: 1, max: 30 },
        { key: 'budget', label: 'Бюджет капвложений (для отбора портфеля)', type: 'number', min: 0, level: 'pro' },
        {
          key: 'projects',
          label: 'Проекты и чистые потоки (t = 0 … N)',
          type: 'items',
          itemFields: [
            { key: 'name', label: 'Проект', type: 'text' },
            { key: 'flows', label: 'Потоки', type: 'series', lengthFrom: 'horizon', plusOne: true },
          ],
          newItem: () => ({ name: 'Проект', flows: [-100, 30, 30, 30, 30, 30] }),
        },
      ],
    },
  ],
  periodsPath: 'horizon',
  samples: [
    {
      id: 'abc',
      name: 'Три альтернативных проекта',
      inputs: {
        discountRate: 15,
        horizon: 5,
        budget: 1500,
        projects: [
          { name: 'A — модернизация цеха', flows: [-1000, 350, 350, 350, 350, 350] },
          { name: 'B — новая линия', flows: [-800, 150, 250, 350, 400, 450] },
          { name: 'C — склад', flows: [-600, 300, 300, 200, 100, 50] },
        ],
      },
    },
  ],
  compute(i) {
    const r = pct(i.discountRate);
    const N = Math.max(1, Math.round(Number(i.horizon) || 5));
    const projects = (i.projects || []).map((p) => ({ name: p.name, flows: fitSeries(p.flows, N + 1) }));
    const res = projects.map((p) => {
      const flows = p.flows;
      const inv = -Math.min(0, ...flows.filter((v) => v < 0)) ? F.fundingNeed(flows) : 0;
      return { name: p.name, flows, npv: F.npv(r, flows), irr: F.irr(flows), mirr: F.mirr(flows, r, r), pi: F.profitabilityIndex(r, flows), pp: F.paybackPeriod(flows), dpp: F.paybackPeriod(flows, r), inv, npvPerInv: inv ? F.npv(r, flows) / inv : null };
    });
    const rank = (key, desc = true) => {
      const sorted = [...res].filter((x) => x[key] != null).sort((a, b) => (desc ? b[key] - a[key] : a[key] - b[key]));
      const map = {};
      sorted.forEach((x, idx) => (map[x.name] = idx + 1));
      return map;
    };
    const rNpv = rank('npv');
    const rIrr = rank('irr');
    const rPi = rank('pi');
    const rDpp = rank('dpp', false);
    const rows = res.map((x) => ({ cells: [x.name, x.inv, x.npv, x.irr, x.mirr, x.pi, x.pp, x.dpp, x.npvPerInv, `${rNpv[x.name] ?? '—'} / ${rIrr[x.name] ?? '—'} / ${rPi[x.name] ?? '—'} / ${rDpp[x.name] ?? '—'}`] }));
    const colFmts = ['text', 'money', 'money', 'pct', 'pct', 'ratio', 'years', 'years', 'ratio', 'text'];
    // приростной анализ для двух лучших по NPV
    const byNpv = [...res].sort((a, b) => b.npv - a.npv);
    let incremental = null;
    if (byNpv.length >= 2) {
      const a = byNpv[0];
      const b = byNpv[1];
      const inc = a.flows.map((v, t) => v - b.flows[t]);
      incremental = { a: a.name, b: b.name, flows: inc, irr: F.irr(inc), npv: F.npv(r, inc) };
    }
    // портфель по бюджету: жадный отбор по PI
    let portfolio = null;
    const budget = Number(i.budget) || 0;
    if (budget > 0) {
      const sortedPi = [...res].filter((x) => x.pi != null && x.npv > 0).sort((a, b) => b.pi - a.pi);
      let left = budget;
      const chosen = [];
      for (const x of sortedPi) {
        if (x.inv <= left) {
          chosen.push(x);
          left -= x.inv;
        }
      }
      portfolio = { chosen, left, npv: F.sum(chosen.map((x) => x.npv)) };
    }
    const conclusion = [];
    if (byNpv.length) conclusion.push(`По NPV лидирует «${byNpv[0].name}» (${Math.round(byNpv[0].npv).toLocaleString('ru-RU')}). NPV — главный критерий для взаимоисключающих проектов одного масштаба.`);
    const bestIrr = [...res].filter((x) => x.irr != null).sort((a, b) => b.irr - a.irr)[0];
    if (bestIrr && byNpv[0] && bestIrr.name !== byNpv[0].name) conclusion.push(`Конфликт критериев: по IRR лучше «${bestIrr.name}» (${(bestIrr.irr * 100).toFixed(1)} %). При разном масштабе инвестиций ориентируйтесь на NPV и приростной IRR.`);
    if (incremental) conclusion.push(`Приростной поток «${incremental.a}» − «${incremental.b}»: IRR ${incremental.irr != null ? (incremental.irr * 100).toFixed(1) + ' %' : '—'}, NPV ${Math.round(incremental.npv).toLocaleString('ru-RU')}. ${incremental.irr != null && incremental.irr > r ? `Дополнительные вложения в «${incremental.a}» оправданы.` : `Дополнительные вложения в «${incremental.a}» не окупают ставку ${(r * 100).toFixed(1)} %.`}`);
    if (portfolio) conclusion.push(`При бюджете ${budget.toLocaleString('ru-RU')} по индексу PI отбираются: ${portfolio.chosen.map((x) => x.name).join(', ') || 'ни один проект'}; суммарный NPV ${Math.round(portfolio.npv).toLocaleString('ru-RU')}, остаток бюджета ${Math.round(portfolio.left).toLocaleString('ru-RU')}.`);
    const labels = Array.from({ length: N + 1 }, (_, t) => (t === 0 ? 'Старт' : `Период ${t}`));
    const tables = [
      { id: 'cmp', title: 'Показатели проектов (ранг: NPV / IRR / PI / DPP)', columns: ['Проект', 'Инвестиции', 'NPV', 'IRR', 'MIRR', 'PI', 'PP', 'DPP', 'NPV / инвестиции', 'Ранги'].map((l, k) => ({ label: l, fmt: colFmts[k] })), rows },
      { id: 'flows', title: 'Чистые потоки', columns: [{ label: 'Проект', fmt: 'text' }, ...labels.map((l) => ({ label: l, fmt: 'money' }))], rows: res.map((x) => ({ cells: [x.name, ...x.flows] })).concat(incremental ? [{ cells: [`Приростной: ${incremental.a} − ${incremental.b}`, ...incremental.flows], style: 'total' }] : []) },
    ];
    return {
      kpis: [m('Лучший NPV', byNpv[0]?.npv, 'money', byNpv[0]?.npv > 0, byNpv[0]?.name), m('Лучший IRR', bestIrr?.irr, 'pct', null, bestIrr?.name), m('Проектов с NPV > 0', res.filter((x) => x.npv > 0).length, 'int'), ...(incremental ? [m('Приростной IRR', incremental.irr, 'pct', incremental.irr != null ? incremental.irr > r : null)] : [])],
      tables,
      charts: [
        { id: 'npv', title: 'NPV проектов', type: 'bar', labels: res.map((x) => x.name), datasets: [{ label: 'NPV', data: res.map((x) => x.npv) }] },
        { id: 'cum', title: 'Накопленный дисконтированный поток', type: 'line', labels, datasets: res.map((x) => ({ label: x.name, data: F.cumulative(x.flows.map((v, t) => v / Math.pow(1 + r, t))) })) },
      ],
      conclusion,
      metric: { bestNpv: byNpv[0]?.npv ?? null },
    };
  },
  metric(i, key = 'bestNpv') {
    return this.compute(i).metric[key];
  },
};
