/** Экспорт в Excel (SheetJS) и импорт рядов из xlsx/csv */
import { downloadBlob, safeName } from '../ui/format.js';
import { flattenFields, seriesLength } from '../ui/forms.js';
import { getPath } from '../engine/utils.js';

export function hasXlsx() {
  return typeof window !== 'undefined' && typeof window.XLSX !== 'undefined';
}

const FMT = { money: '#,##0.00', num: '#,##0.00', int: '0', pct: '0.0%', pct2: '0.00%', ratio: '0.00', factor: '0.000', years: '0.0' };

function cellFmt(f) {
  return FMT[f] || '#,##0.00';
}

/** Лист «Исходные данные» */
function inputsSheet(XLSX, template, inputs, levelId) {
  const rows = [['Шаблон', template.title], ['Уровень', levelId], ['Дата', new Date().toLocaleString('ru-RU')], []];
  for (const f of flattenFields(template)) {
    const v = getPath(inputs, f.key);
    if (f.type === 'series') rows.push([f.label, ...(Array.isArray(v) ? v : [])]);
    else if (f.type === 'items') {
      rows.push([f.label]);
      rows.push(['', ...f.itemFields.map((c) => c.label)]);
      for (const it of v || []) rows.push(['', ...f.itemFields.map((c) => (Array.isArray(it[c.key]) ? it[c.key].join('; ') : it[c.key]))]);
    } else rows.push([f.label, v === null || v === undefined ? '' : v, f.type === 'percent' ? '%' : f.unit || '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 44 }, { wch: 16 }, { wch: 12 }];
  return ws;
}

/** Таблица результатов → лист. Для листа CF добавляем формулы DF / DCF / NPV / IRR. */
function tableSheet(XLSX, table, { withFormulas = false, rate = null } = {}) {
  const aoa = [[table.title], [...table.columns.map((c) => c.label)]];
  for (const r of table.rows) aoa.push(r.cells.map((c) => (c === undefined ? null : c)));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // форматы
  for (let ri = 0; ri < table.rows.length; ri++) {
    const r = table.rows[ri];
    for (let ci = 1; ci < r.cells.length; ci++) {
      const addr = XLSX.utils.encode_cell({ r: ri + 2, c: ci });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') cell.z = cellFmt(r.fmt || table.columns[ci]?.fmt || 'money');
    }
  }
  ws['!cols'] = [{ wch: 46 }, ...table.columns.slice(1).map(() => ({ wch: 13 }))];
  if (withFormulas && rate != null) {
    const n = table.columns.length - 1;
    const rowIdx = (label) => table.rows.findIndex((r) => String(r.cells[0]).startsWith(label));
    const rFcff = rowIdx('FCFF');
    const rDf = rowIdx('Коэффициент дисконтирования');
    const rDcf = rowIdx('DCF');
    const base = table.rows.length + 4;
    XLSX.utils.sheet_add_aoa(ws, [['Ставка дисконтирования', rate]], { origin: { r: base, c: 0 } });
    const rateAddr = XLSX.utils.encode_cell({ r: base, c: 1 });
    ws[rateAddr].z = '0.0%';
    XLSX.utils.sheet_add_aoa(ws, [['Номер периода t', ...Array.from({ length: n }, (_, t) => t)]], { origin: { r: base + 1, c: 0 } });
    if (rFcff >= 0 && rDf >= 0 && rDcf >= 0) {
      for (let t = 0; t < n; t++) {
        const col = XLSX.utils.encode_col(t + 1);
        const tAddr = `${col}${base + 2}`;
        ws[`${col}${rDf + 3}`] = { t: 'n', f: `1/(1+$${XLSX.utils.encode_col(1)}$${base + 1})^${tAddr}`, z: '0.000' };
        ws[`${col}${rDcf + 3}`] = { t: 'n', f: `${col}${rFcff + 3}*${col}${rDf + 3}`, z: '#,##0.00' };
      }
      const c1 = XLSX.utils.encode_col(1);
      const cn = XLSX.utils.encode_col(n);
      XLSX.utils.sheet_add_aoa(ws, [['NPV (формула)'], ['IRR (формула)'], ['PI (формула)']], { origin: { r: base + 3, c: 0 } });
      ws[`B${base + 4}`] = { t: 'n', f: `SUM(${c1}${rDcf + 3}:${cn}${rDcf + 3})`, z: '#,##0.00' };
      ws[`B${base + 5}`] = { t: 'n', f: `IFERROR(IRR(${c1}${rFcff + 3}:${cn}${rFcff + 3}),"н/д")`, z: '0.0%' };
      ws[`B${base + 6}`] = { t: 'n', f: `IFERROR(SUMIF(${c1}${rDcf + 3}:${cn}${rDcf + 3},">0")/-SUMIF(${c1}${rDcf + 3}:${cn}${rDcf + 3},"<0"),"н/д")`, z: '0.00' };
      const range = XLSX.utils.decode_range(ws['!ref']);
      range.e.r = Math.max(range.e.r, base + 6);
      ws['!ref'] = XLSX.utils.encode_range(range);
    }
  }
  return ws;
}

function kpiSheet(XLSX, kpis, unit) {
  const aoa = [['Показатель', 'Значение', 'Ед.', 'Оценка', 'Комментарий']];
  for (const k of kpis) aoa.push([k.label, k.value ?? '', k.fmt === 'pct' ? '%' : k.fmt === 'money' ? unit || '' : '', k.good === true ? 'ОК' : k.good === false ? 'Внимание' : '', k.hint || '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  kpis.forEach((k, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 1 })];
    if (cell && typeof cell.v === 'number') cell.z = cellFmt(k.fmt);
  });
  ws['!cols'] = [{ wch: 48 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 60 }];
  return ws;
}

export function exportXlsx({ template, inputs, levelId, result, extra = {} }) {
  if (!hasXlsx()) throw new Error('Библиотека XLSX не загружена');
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, inputsSheet(XLSX, template, inputs, levelId), 'Исходные данные');
  XLSX.utils.book_append_sheet(wb, kpiSheet(XLSX, result.kpis, result.unit), 'Показатели');
  const rate = result.raw && result.raw.kpi ? result.raw.kpi.discountRate : null;
  const used = new Set();
  for (const t of result.tables) {
    let name = sheetName(t.title);
    let k = 2;
    while (used.has(name)) name = sheetName(t.title).slice(0, 28) + ' ' + k++;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, tableSheet(XLSX, t, { withFormulas: t.id === 'cf' && rate != null, rate }), name);
  }
  if (extra.sensitivity) XLSX.utils.book_append_sheet(wb, tableSheet(XLSX, extra.sensitivity), 'Чувствительность');
  if (extra.scenarios) XLSX.utils.book_append_sheet(wb, tableSheet(XLSX, extra.scenarios), 'Сценарии');
  if (extra.monteCarlo) XLSX.utils.book_append_sheet(wb, tableSheet(XLSX, extra.monteCarlo), 'Монте-Карло');
  const concl = [['Заключение'], ...result.conclusion.map((l) => [l])];
  if (extra.aiConclusion) concl.push([], ['Заключение ИИ-ассистента'], ...String(extra.aiConclusion).split('\n').map((l) => [l]));
  const wsC = XLSX.utils.aoa_to_sheet(concl);
  wsC['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsC, 'Заключение');
  const name = `${safeName(inputs?.general?.name || inputs?.name || template.title)}.xlsx`;
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  return name;
}

function sheetName(title) {
  return String(title)
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/Лист «(.+?)» — .*/, '$1')
    .slice(0, 31)
    .trim();
}

/** Табличный экспорт в CSV (разделитель ; и запятая в дробях — формат русского Excel) */
export function exportCsv(table, filename) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 10000) / 10000).replace('.', ',');
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [table.columns.map((c) => esc(c.label)).join(';')];
  for (const r of table.rows) lines.push(r.cells.map(esc).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename || `${safeName(table.title)}.csv`);
}

/** Чтение файла xlsx/csv → массив строк (первая ячейка — подпись, далее числа) */
export async function readTabular(file) {
  if (!hasXlsx()) throw new Error('Библиотека XLSX не загружена');
  const XLSX = window.XLSX;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', raw: true, codepage: 65001 });
  const out = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    aoa.forEach((row, idx) => {
      if (!row || !row.length) return;
      const label = row[0];
      const nums = row.slice(1).map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : null));
      const valid = nums.filter((v) => v !== null && isFinite(v));
      if (valid.length >= 2 && label !== null && label !== undefined && String(label).trim() !== '') out.push({ sheet: name, row: idx + 1, label: String(label), values: nums.map((v) => (v === null || !isFinite(v) ? 0 : v)) });
    });
  }
  return out;
}

/** Подбор строки файла под поле-ряд по совпадению подписи */
export function guessMapping(template, inputs, rows) {
  const fields = flattenFields(template).filter((f) => f.type === 'series');
  const norm = (s) => String(s).toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();
  return fields.map((f) => {
    const fl = norm(f.label);
    let best = null;
    let bestScore = 0;
    rows.forEach((r, i) => {
      const rl = norm(r.label);
      const words = fl.split(' ').filter((w) => w.length > 3);
      const score = words.filter((w) => rl.includes(w)).length + (rl === fl ? 5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return { field: f, rowIndex: best, length: seriesLength(template, f, inputs) };
  });
}
