/** Форматирование чисел для интерфейса и отчётов (ru-RU) */

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function fmt(value, kind = 'money', opts = {}) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (!isFinite(value)) return '—';
  if (Math.abs(value) < 1e-9) value = 0;
  switch (kind) {
    case 'money':
      return Math.abs(value) >= 100 || value === 0 ? nf0.format(value) : nf2.format(value);
    case 'num':
      return Math.abs(value) >= 1000 ? nf0.format(value) : nf1.format(value);
    case 'int':
      return nf0.format(Math.round(value));
    case 'pct':
      return `${nf1.format(value * 100)} %`;
    case 'pct2':
      return `${nf2.format(value * 100)} %`;
    case 'ratio':
      return nf2.format(value);
    case 'factor':
      return nf3.format(value);
    case 'years':
      return `${nf1.format(value)} ${opts.unit || 'пер.'}`;
    case 'bool':
      return value ? 'Да' : 'Нет';
    case 'text':
      return String(value);
    default:
      return nf2.format(value);
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Простейший markdown → HTML (заголовки, списки, жирный, код, таблицы) */
export function mdToHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  let html = '';
  let inList = false;
  let inCode = false;
  let inTable = false;
  const inline = (s) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*(?!\s)(.+?)\*/g, '<em>$1</em>');
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('```')) {
      if (inCode) {
        html += '</pre>';
        inCode = false;
      } else {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        html += '<pre>';
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html += escapeHtml(line) + '\n';
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!inTable) {
        html += '<table><tbody>';
        inTable = true;
        html += '<tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>';
      } else html += '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      continue;
    } else if (inTable) {
      html += '</tbody></table>';
      inTable = false;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
      continue;
    }
    const li = line.match(/^\s*[-*•]\s+(.*)/) || line.match(/^\s*\d+[.)]\s+(.*)/);
    if (li) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    if (line.trim() === '') continue;
    html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  if (inCode) html += '</pre>';
  if (inTable) html += '</tbody></table>';
  return html;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export function safeName(s) {
  return String(s || 'model')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .slice(0, 60) || 'model';
}
