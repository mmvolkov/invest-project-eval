/** Рендер результатов: KPI-карточки, заключение, графики, таблицы */
import { fmt, escapeHtml } from './format.js';
import { renderChart } from './charts.js';

export function renderKpis(container, kpis, unit, periodUnit) {
  container.innerHTML = kpis
    .map((k) => {
      const cls = k.good === true ? 'good' : k.good === false ? 'bad' : '';
      const v = fmt(k.value, k.fmt, { unit: periodWord(periodUnit) });
      return `<div class="kpi ${cls}" title="${escapeHtml(k.hint || '')}"><div class="v">${escapeHtml(v)}${k.fmt === 'money' && unit && k.value != null ? ` <small class="muted" style="font-size:0.7rem">${escapeHtml(unit)}</small>` : ''}</div><div class="l">${escapeHtml(k.label)}</div>${k.hint ? `<div class="h">${escapeHtml(k.hint)}</div>` : ''}</div>`;
    })
    .join('');
}

function periodWord(p) {
  return { год: 'лет', квартал: 'кв.', месяц: 'мес.' }[p] || 'пер.';
}

export function renderConclusion(container, lines, title = 'Заключение (алгоритмическая оценка)') {
  container.innerHTML = `<h3>${escapeHtml(title)}</h3><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
}

export function renderCharts(container, specs) {
  container.innerHTML = '';
  for (const spec of specs) {
    const box = document.createElement('div');
    box.className = 'chart-box';
    box.innerHTML = `<h4>${escapeHtml(spec.title)}</h4><canvas data-title="${escapeHtml(spec.title)}" data-id="${escapeHtml(spec.id)}"></canvas>`;
    container.appendChild(box);
    renderChart(box.querySelector('canvas'), spec);
  }
}

export function tableHtml(table, { maxRows = Infinity } = {}) {
  const cols = table.columns;
  let html = `<table class="data"><thead><tr>${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>`;
  const rows = table.rows.slice(0, maxRows);
  for (const r of rows) {
    const cls = r.style ? ` class="${r.style}"` : '';
    html += `<tr${cls}>`;
    r.cells.forEach((cell, i) => {
      const f = i === 0 ? cols[0].fmt || 'text' : r.fmt || cols[i]?.fmt || 'money';
      const isNum = typeof cell === 'number';
      const neg = isNum && cell < -1e-9 && f !== 'factor';
      html += `<td class="${isNum ? 'num' : ''}${neg ? ' neg' : ''}">${escapeHtml(fmt(cell, f))}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

export function renderTables(container, tables, { onCsv } = {}) {
  container.innerHTML = '';
  for (const t of tables) {
    const box = document.createElement('div');
    box.className = 'table-box';
    box.innerHTML = `<div class="table-head"><h4>${escapeHtml(t.title)}${t.unit ? ` <small class="muted">(${escapeHtml(t.unit)})</small>` : ''}</h4><button class="btn small csv" type="button">CSV</button></div><div class="table-scroll">${tableHtml(t)}</div>`;
    box.querySelector('.csv').addEventListener('click', () => onCsv && onCsv(t));
    container.appendChild(box);
  }
}
