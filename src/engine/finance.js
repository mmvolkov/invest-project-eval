/**
 * Базовые финансовые функции (чистые, без зависимостей).
 * Все потоки задаются массивом по периодам, индекс 0 — период t=0 (не дисконтируется).
 * Ставки задаются в долях (0.15 = 15 %).
 */

export const EPS = 1e-9;

export function sum(arr) {
  let s = 0;
  for (const v of arr) s += Number(v) || 0;
  return s;
}

/** Коэффициенты дисконтирования 1/(1+r)^t для t = 0..n-1 */
export function discountFactors(rate, n, { midYear = false } = {}) {
  const out = new Array(n);
  for (let t = 0; t < n; t++) {
    const exp = midYear && t > 0 ? t - 0.5 : t;
    out[t] = 1 / Math.pow(1 + rate, exp);
  }
  return out;
}

/** Чистая приведённая стоимость. flows[0] относится к t=0. */
export function npv(rate, flows, { midYear = false } = {}) {
  let v = 0;
  for (let t = 0; t < flows.length; t++) {
    const cf = Number(flows[t]) || 0;
    const exp = midYear && t > 0 ? t - 0.5 : t;
    v += cf / Math.pow(1 + rate, exp);
  }
  return v;
}

/** Количество смен знака в потоке (для диагностики множественных IRR) */
export function signChanges(flows) {
  let prev = 0;
  let changes = 0;
  for (const f of flows) {
    const v = Number(f) || 0;
    if (v === 0) continue;
    const s = Math.sign(v);
    if (prev !== 0 && s !== prev) changes++;
    prev = s;
  }
  return changes;
}

/**
 * Внутренняя норма доходности. Возвращает null, если корень не найден
 * (нет смены знака или не сходится). Метод: поиск интервала + бисекция.
 */
export function irr(flows, { lo = -0.99, hi = 10, tol = 1e-7, maxIter = 300 } = {}) {
  const f = (r) => npv(r, flows);
  if (signChanges(flows) === 0) return null;
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (!isFinite(fa) || !isFinite(fb)) return null;
  if (fa * fb > 0) {
    // попробуем найти интервал со сменой знака на сетке
    const grid = [-0.9, -0.5, -0.2, 0, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5, 10];
    let found = false;
    for (let i = 0; i < grid.length - 1; i++) {
      const x = f(grid[i]);
      const y = f(grid[i + 1]);
      if (x * y <= 0) {
        a = grid[i];
        b = grid[i + 1];
        fa = x;
        fb = y;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  for (let i = 0; i < maxIter; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < tol || (b - a) / 2 < tol) return m;
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

/** Модифицированная внутренняя норма доходности */
export function mirr(flows, financeRate, reinvestRate) {
  const n = flows.length - 1;
  if (n <= 0) return null;
  let pvOut = 0;
  let fvIn = 0;
  for (let t = 0; t <= n; t++) {
    const cf = Number(flows[t]) || 0;
    if (cf < 0) pvOut += cf / Math.pow(1 + financeRate, t);
    else fvIn += cf * Math.pow(1 + reinvestRate, n - t);
  }
  if (pvOut >= 0 || fvIn <= 0) return null;
  return Math.pow(fvIn / -pvOut, 1 / n) - 1;
}

/** Индекс рентабельности: PV притоков / PV оттоков (по знаку чистого потока периода) */
export function profitabilityIndex(rate, flows) {
  let pvIn = 0;
  let pvOut = 0;
  for (let t = 0; t < flows.length; t++) {
    const cf = (Number(flows[t]) || 0) / Math.pow(1 + rate, t);
    if (cf >= 0) pvIn += cf;
    else pvOut += -cf;
  }
  if (pvOut < EPS) return null;
  return pvIn / pvOut;
}

/** Накопленный поток */
export function cumulative(flows) {
  const out = [];
  let c = 0;
  for (const f of flows) {
    c += Number(f) || 0;
    out.push(c);
  }
  return out;
}

/**
 * Срок окупаемости (в периодах, дробный, с линейной интерполяцией внутри периода).
 * rate > 0 — дисконтированный срок окупаемости. null — проект не окупается в горизонте.
 */
export function paybackPeriod(flows, rate = 0) {
  const disc = rate ? flows.map((f, t) => (Number(f) || 0) / Math.pow(1 + rate, t)) : flows.map((f) => Number(f) || 0);
  const cum = cumulative(disc);
  // первый момент, после которого накопленный поток остаётся >= 0
  let lastNeg = -1;
  for (let t = 0; t < cum.length; t++) if (cum[t] < -EPS) lastNeg = t;
  if (lastNeg === cum.length - 1) return null;
  if (lastNeg < 0) return 0;
  const t = lastNeg;
  const prev = cum[t];
  const next = cum[t + 1];
  const inflow = next - prev;
  if (inflow <= EPS) return t + 1;
  return t + -prev / inflow;
}

/** Потребность в дополнительном финансировании (сумма отрицательных чистых потоков) */
export function fundingNeed(flows, rate = 0) {
  let need = 0;
  for (let t = 0; t < flows.length; t++) {
    const cf = Number(flows[t]) || 0;
    if (cf < 0) need += rate ? -cf / Math.pow(1 + rate, t) : -cf;
  }
  return need;
}

/** Максимальный «кассовый разрыв»: минимум накопленного потока */
export function maxDrawdown(flows) {
  const cum = cumulative(flows);
  let m = 0;
  for (const c of cum) if (c < m) m = c;
  return -m;
}

/** Аннуитетный платёж */
export function annuityPayment(principal, rate, n) {
  if (n <= 0) return 0;
  if (Math.abs(rate) < EPS) return principal / n;
  return (principal * rate) / (1 - Math.pow(1 + rate, -n));
}

/**
 * График кредита. Возвращает массив по периодам 0..horizon:
 * { opening, interest, principal, payment, closing, drawdown }
 */
export function loanSchedule({ amount, rate, term, type = 'annuity', start = 0, grace = 0 }, horizon) {
  const n = horizon + 1;
  const rows = [];
  let balance = 0;
  const payPeriods = Math.max(1, term - grace);
  const annuity = annuityPayment(amount, rate, payPeriods);
  for (let t = 0; t < n; t++) {
    const row = { opening: balance, interest: 0, principal: 0, payment: 0, closing: balance, drawdown: 0 };
    if (t === start) {
      row.drawdown = amount;
      balance += amount;
      row.closing = balance;
    }
    const k = t - start; // номер периода с момента выдачи
    if (k >= 1 && balance > EPS) {
      row.interest = row.opening * rate;
      if (k > grace) {
        if (type === 'annuity') {
          row.principal = Math.min(balance, annuity - row.interest);
        } else if (type === 'equal') {
          row.principal = Math.min(balance, amount / payPeriods);
        } else if (type === 'bullet') {
          row.principal = k === term ? balance : 0;
        }
        if (k === term) row.principal = balance; // досрочно закрыть остаток
      }
      row.principal = Math.max(0, row.principal);
      balance -= row.principal;
      row.payment = row.interest + row.principal;
      row.closing = balance;
    }
    rows.push(row);
  }
  return rows;
}

/** Амортизация объекта: линейная или уменьшаемого остатка (коэф. 2) */
export function depreciationSchedule({ amount, period = 0, life = 5, method = 'linear' }, horizon) {
  const n = horizon + 1;
  const out = new Array(n).fill(0);
  let nbv = amount;
  const lifeN = Math.max(1, Math.round(life));
  for (let t = period + 1; t < n && t <= period + lifeN; t++) {
    let d = 0;
    if (method === 'declining') {
      d = Math.min(nbv, nbv * (2 / lifeN));
      if (t === period + lifeN) d = nbv;
    } else {
      d = amount / lifeN;
    }
    d = Math.min(d, nbv);
    nbv -= d;
    out[t] = d;
  }
  return { schedule: out, residual: nbv };
}

/** Модель CAPM: стоимость собственного капитала */
export function capm({ rf, beta, mrp, country = 0, size = 0, specific = 0 }) {
  return rf + beta * mrp + country + size + specific;
}

/** Средневзвешенная стоимость капитала */
export function wacc({ equity, debt, costEquity, costDebt, taxRate, preferred = 0, costPreferred = 0 }) {
  const total = equity + debt + preferred;
  if (total <= 0) return null;
  return (equity / total) * costEquity + (debt / total) * costDebt * (1 - taxRate) + (preferred / total) * costPreferred;
}

/** Терминальная стоимость по Гордону (на конец последнего периода) */
export function gordonTerminalValue(lastCf, growth, rate) {
  if (rate - growth <= EPS) return null;
  return (lastCf * (1 + growth)) / (rate - growth);
}

/** Реальная ставка по формуле Фишера */
export function fisherReal(nominal, inflation) {
  return (1 + nominal) / (1 + inflation) - 1;
}

/** Эффективная годовая ставка из периодической */
export function effectiveAnnual(periodicRate, periodsPerYear) {
  return Math.pow(1 + periodicRate, periodsPerYear) - 1;
}

/** Равномерный ряд: base, base*(1+g), ... */
export function growthSeries(base, growth, n, { startAt = 1, zeroBefore = true } = {}) {
  const out = new Array(n).fill(0);
  for (let t = 0; t < n; t++) {
    if (t < startAt) {
      out[t] = zeroBefore ? 0 : base;
      continue;
    }
    out[t] = base * Math.pow(1 + growth, t - startAt);
  }
  return out;
}

/** Линейная интерполяция квантиля отсортированного массива */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function mean(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}

export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

/** Безопасное деление */
export function div(a, b) {
  return Math.abs(b) < EPS ? null : a / b;
}
