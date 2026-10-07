/** Утилиты работы с вложенными объектами и рядами */

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function getPath(obj, path) {
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/** Приводит ряд к длине n (дополняет последним значением или нулями) */
export function fitSeries(arr, n, { fillLast = false } = {}) {
  const src = Array.isArray(arr) ? arr.map((v) => Number(v) || 0) : [];
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i < src.length) out[i] = src[i];
    else out[i] = fillLast && src.length ? src[src.length - 1] : 0;
  }
  return out;
}

export function pct(v) {
  return (Number(v) || 0) / 100;
}

export function round(v, d = 2) {
  if (v == null || !isFinite(v)) return v;
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

/**
 * Применяет изменение драйвера к копии входных данных.
 * mode 'scale' — умножает значение (или каждый элемент ряда) на (1 + x);
 * mode 'shift' — прибавляет x (в тех же единицах, что и поле, напр. п.п.).
 */
export function applyDriver(inputs, driver, x) {
  const out = deepClone(inputs);
  const cur = getPath(out, driver.path);
  if (cur == null) return out;
  const apply = (v) => (driver.mode === 'shift' ? (Number(v) || 0) + x : (Number(v) || 0) * (1 + x));
  if (Array.isArray(cur)) {
    setPath(
      out,
      driver.path,
      cur.map((v) => (v && typeof v === 'object' ? { ...v, [driver.itemKey || 'amount']: apply(v[driver.itemKey || 'amount']) } : apply(v)))
    );
  } else if (typeof cur === 'object') {
    // объект с полем itemKey
    const k = driver.itemKey || 'amount';
    setPath(out, `${driver.path}.${k}`, apply(cur[k]));
  } else {
    setPath(out, driver.path, apply(cur));
  }
  return out;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
