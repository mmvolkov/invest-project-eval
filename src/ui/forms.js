/**
 * Рендер формы по декларативной схеме шаблона.
 * Поддерживаемые типы полей: text, number, int, percent, select, bool, series, items.
 */
import { getPath, setPath } from '../engine/utils.js';
import { escapeHtml } from './format.js';
import { levelRank } from '../templates/index.js';
import { periodLabel } from '../engine/project.js';

export function seriesLength(template, field, inputs) {
  if (field.lengthFrom) {
    const n = Math.max(1, Math.round(Number(getPath(inputs, field.lengthFrom)) || 1));
    return n + (field.plusOne ? 1 : 0);
  }
  if (field.length) return field.length;
  if (template.periodsPath) {
    const n = Math.max(1, Math.round(Number(getPath(inputs, template.periodsPath)) || 1));
    return n + 1;
  }
  const cur = getPath(inputs, field.key);
  return Array.isArray(cur) && cur.length ? cur.length : 5;
}

export function seriesLabels(template, field, inputs, n) {
  if (template.id === 'project' || template.id === 'express') {
    const g = inputs.general || {};
    return Array.from({ length: n }, (_, t) => periodLabel(g, t));
  }
  if (field.plusOne || (template.periodsPath && !field.lengthFrom)) return Array.from({ length: n }, (_, t) => (t === 0 ? 't0' : `t${t}`));
  return Array.from({ length: n }, (_, t) => `${t + 1}`);
}

function fieldVisible(field, group, levelId, inputs) {
  const lvl = field.level || group.level || 'basic';
  if (levelRank(lvl) > levelRank(levelId)) return false;
  if (field.showIf) {
    const v = getPath(inputs, field.showIf.path);
    if (field.showIf.equals !== undefined && v !== field.showIf.equals) return false;
  }
  return true;
}

/**
 * Рендерит форму в контейнер. onChange(path, value, {structural}) вызывается при каждом изменении.
 */
export function renderForm(container, template, inputs, levelId, onChange) {
  container.innerHTML = '';
  for (const group of template.schema) {
    if (levelRank(group.level || 'basic') > levelRank(levelId)) continue;
    const visibleFields = group.fields.filter((f) => fieldVisible(f, group, levelId, inputs));
    if (!visibleFields.length) continue;
    const g = document.createElement('section');
    g.className = 'group';
    const badge = group.level && group.level !== 'basic' ? `<span class="badge ${group.level}">${group.level === 'pro' ? 'расширенная' : 'экспресс'}</span>` : '';
    g.innerHTML = `<h3>${escapeHtml(group.title)}${badge}</h3>`;
    const fields = document.createElement('div');
    fields.className = 'fields';
    for (const field of visibleFields) fields.appendChild(renderField(template, field, inputs, onChange));
    g.appendChild(fields);
    container.appendChild(g);
  }
}

function renderField(template, field, inputs, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field' + (field.type === 'series' || field.type === 'items' ? ' wide' : '');
  const id = 'f_' + field.key.replace(/[^a-z0-9]/gi, '_');
  const label = `<label for="${id}">${escapeHtml(field.label)}</label>`;
  const help = field.help ? `<div class="help">${escapeHtml(field.help)}</div>` : '';
  const value = getPath(inputs, field.key);
  switch (field.type) {
    case 'text': {
      wrap.innerHTML = `${label}<input class="input" id="${id}" type="text" value="${escapeHtml(value ?? '')}" />${help}`;
      wrap.querySelector('input').addEventListener('change', (e) => onChange(field.key, e.target.value));
      break;
    }
    case 'number':
    case 'int':
    case 'percent': {
      const step = field.step ?? (field.type === 'int' ? 1 : 'any');
      const suffix = field.type === 'percent' ? '%' : field.unit || '';
      wrap.innerHTML = `${label}<div class="input-wrap"><input class="input" id="${id}" type="number" inputmode="decimal" step="${step}" ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''} value="${value === null || value === undefined ? '' : escapeHtml(value)}" />${suffix ? `<span class="suffix">${escapeHtml(suffix)}</span>` : ''}</div>${help}`;
      const input = wrap.querySelector('input');
      input.addEventListener('change', (e) => {
        const raw = e.target.value;
        if (raw === '' && field.optional) return onChange(field.key, null, { structural: false });
        let v = Number(String(raw).replace(',', '.'));
        if (!isFinite(v)) v = 0;
        if (field.type === 'int') v = Math.round(v);
        if (field.min != null) v = Math.max(field.min, v);
        if (field.max != null) v = Math.min(field.max, v);
        e.target.value = v;
        const structural = template.periodsPath === field.key || isLengthSource(template, field.key);
        onChange(field.key, v, { structural });
      });
      break;
    }
    case 'select': {
      const opts = field.options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
      wrap.innerHTML = `${label}<select class="input" id="${id}">${opts}</select>${help}`;
      wrap.querySelector('select').addEventListener('change', (e) => {
        const opt = field.options.find((o) => String(o.value) === e.target.value);
        onChange(field.key, opt ? opt.value : e.target.value, { structural: true });
      });
      break;
    }
    case 'bool': {
      wrap.innerHTML = `<label class="check"><input type="checkbox" id="${id}" ${value ? 'checked' : ''} /> ${escapeHtml(field.label)}</label>${help}`;
      wrap.querySelector('input').addEventListener('change', (e) => onChange(field.key, e.target.checked, { structural: false }));
      break;
    }
    case 'series': {
      const n = seriesLength(template, field, inputs);
      const labels = seriesLabels(template, field, inputs, n);
      const arr = Array.isArray(value) ? value : [];
      wrap.innerHTML = `${label}${renderSeriesTable(field.key, arr, n, labels)}<div class="series-tools">
        <span>Заполнить:</span> база <input type="number" class="s-base" placeholder="0" /> рост <input type="number" class="s-growth" placeholder="%" step="0.5" /> %
        с периода <input type="number" class="s-from" value="${template.periodsPath && !field.lengthFrom ? 1 : 0}" min="0" style="width:60px" />
        <button class="btn small s-fill" type="button">Применить</button>
        <button class="btn small s-paste" type="button" title="Вставить числа из буфера обмена (из Excel)">Вставить из буфера</button>
        <button class="btn small s-clear" type="button">Очистить</button></div>${help}`;
      bindSeries(wrap, field, arr, n, onChange);
      break;
    }
    case 'items': {
      const items = Array.isArray(value) ? value : [];
      wrap.innerHTML = `${label}<div class="items"></div><div class="row" style="margin-top:6px"><button class="btn small add" type="button">+ Добавить</button></div>${help}`;
      renderItems(wrap.querySelector('.items'), template, field, items, inputs, onChange);
      wrap.querySelector('.add').addEventListener('click', () => {
        const next = [...items, field.newItem ? field.newItem() : {}];
        onChange(field.key, next, { structural: true });
      });
      break;
    }
    default:
      wrap.innerHTML = `${label}<div class="muted">Неизвестный тип поля ${escapeHtml(field.type)}</div>`;
  }
  return wrap;
}

function isLengthSource(template, key) {
  return template.schema.some((g) => g.fields.some((f) => f.lengthFrom === key || (f.itemFields || []).some((x) => x.lengthFrom === key)));
}

function renderSeriesTable(key, arr, n, labels) {
  let th = '';
  let td = '';
  for (let t = 0; t < n; t++) {
    th += `<th>${escapeHtml(labels[t])}</th>`;
    const v = arr[t] === undefined || arr[t] === null ? '' : arr[t];
    td += `<td><input type="number" step="any" data-idx="${t}" value="${escapeHtml(v)}" aria-label="${escapeHtml(labels[t])}" /></td>`;
  }
  return `<div class="series"><table><thead><tr>${th}</tr></thead><tbody><tr>${td}</tr></tbody></table></div>`;
}

function bindSeries(wrap, field, arr, n, onChange) {
  const cur = Array.from({ length: n }, (_, t) => Number(arr[t]) || 0);
  const inputs = wrap.querySelectorAll('.series input');
  inputs.forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const t = Number(e.target.dataset.idx);
      cur[t] = Number(String(e.target.value).replace(',', '.')) || 0;
      onChange(field.key, [...cur], { structural: false });
    });
    inp.addEventListener('keydown', (e) => {
      // стрелки влево/вправо между ячейками
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const t = Number(e.target.dataset.idx) + (e.key === 'ArrowRight' ? 1 : -1);
        const next = wrap.querySelector(`.series input[data-idx="${t}"]`);
        if (next) {
          next.focus();
          e.preventDefault();
        }
      }
    });
    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const nums = parseNumbers(text);
      if (nums.length > 1) {
        e.preventDefault();
        const start = Number(e.target.dataset.idx);
        nums.forEach((v, k) => {
          if (start + k < n) cur[start + k] = v;
        });
        onChange(field.key, [...cur], { structural: true });
      }
    });
  });
  wrap.querySelector('.s-fill').addEventListener('click', () => {
    const base = Number(wrap.querySelector('.s-base').value) || 0;
    const g = (Number(wrap.querySelector('.s-growth').value) || 0) / 100;
    const from = Math.max(0, Math.round(Number(wrap.querySelector('.s-from').value) || 0));
    for (let t = 0; t < n; t++) cur[t] = t < from ? 0 : base * Math.pow(1 + g, t - from);
    onChange(field.key, cur.map((v) => Math.round(v * 100) / 100), { structural: true });
  });
  wrap.querySelector('.s-clear').addEventListener('click', () => onChange(field.key, new Array(n).fill(0), { structural: true }));
  wrap.querySelector('.s-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const nums = parseNumbers(text);
      if (!nums.length) return alert('В буфере обмена нет чисел');
      for (let t = 0; t < n; t++) if (t < nums.length) cur[t] = nums[t];
      onChange(field.key, [...cur], { structural: true });
    } catch (e) {
      alert('Нет доступа к буферу обмена. Вставьте числа прямо в первую ячейку ряда (Ctrl+V).');
    }
  });
}

export function parseNumbers(text) {
  return String(text || '')
    .split(/[\s;\t\n]+/)
    .map((s) => s.replace(/ /g, '').replace(/\s/g, ''))
    .filter((s) => s !== '')
    .map((s) => {
      // 1 234,5 → 1234.5 ; 1,234.5 → 1234.5
      let x = s;
      if (/,\d{1,2}$/.test(x) && !/\.\d/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
      else x = x.replace(/,/g, '');
      return Number(x);
    })
    .filter((v) => isFinite(v));
}

function renderItems(container, template, field, items, inputs, onChange) {
  const cols = field.itemFields;
  let html = '<table><thead><tr>' + cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('') + '<th></th></tr></thead><tbody>';
  items.forEach((item, idx) => {
    html += '<tr>';
    for (const c of cols) {
      const v = item[c.key];
      if (c.type === 'select') {
        html += `<td><select class="input" data-idx="${idx}" data-key="${c.key}">${c.options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></td>`;
      } else if (c.type === 'series') {
        const n = seriesLength(template, c, inputs);
        const labels = seriesLabels(template, c, inputs, n);
        html += `<td>${renderSeriesTable(c.key, Array.isArray(v) ? v : [], n, labels).replace('class="series"', `class="series item-series" data-idx="${idx}" data-key="${c.key}"`)}</td>`;
      } else if (c.type === 'text') {
        html += `<td><input class="input" type="text" data-idx="${idx}" data-key="${c.key}" value="${escapeHtml(v ?? '')}" /></td>`;
      } else {
        html += `<td><input class="input" type="number" step="${c.step ?? (c.type === 'int' ? 1 : 'any')}" ${c.min != null ? `min="${c.min}"` : ''} data-idx="${idx}" data-key="${c.key}" value="${v === undefined || v === null ? '' : escapeHtml(v)}" style="width:${c.type === 'int' ? 80 : 110}px" /></td>`;
      }
    }
    html += `<td><button class="rm" data-idx="${idx}" title="Удалить" type="button">✕</button></td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  container.querySelectorAll('input.input, select.input').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.idx);
      const key = e.target.dataset.key;
      const col = cols.find((c) => c.key === key);
      let v = e.target.value;
      if (col.type === 'number' || col.type === 'int') {
        v = Number(String(v).replace(',', '.'));
        if (!isFinite(v)) v = 0;
        if (col.type === 'int') v = Math.round(v);
        if (col.min != null) v = Math.max(col.min, v);
      } else if (col.type === 'select') {
        const opt = col.options.find((o) => String(o.value) === v);
        v = opt ? opt.value : v;
      }
      const next = items.map((it, k) => (k === idx ? { ...it, [key]: v } : it));
      onChange(field.key, next, { structural: col.type === 'select' });
    });
  });
  container.querySelectorAll('.item-series').forEach((box) => {
    const idx = Number(box.dataset.idx);
    const key = box.dataset.key;
    const n = box.querySelectorAll('input').length;
    const cur = Array.from({ length: n }, (_, t) => Number((items[idx][key] || [])[t]) || 0);
    box.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        cur[Number(e.target.dataset.idx)] = Number(String(e.target.value).replace(',', '.')) || 0;
        const next = items.map((it, k) => (k === idx ? { ...it, [key]: [...cur] } : it));
        onChange(field.key, next, { structural: false });
      });
      inp.addEventListener('paste', (e) => {
        const nums = parseNumbers((e.clipboardData || window.clipboardData).getData('text'));
        if (nums.length > 1) {
          e.preventDefault();
          const start = Number(e.target.dataset.idx);
          nums.forEach((v, k) => {
            if (start + k < n) cur[start + k] = v;
          });
          const next = items.map((it, k) => (k === idx ? { ...it, [key]: [...cur] } : it));
          onChange(field.key, next, { structural: true });
        }
      });
    });
  });
  container.querySelectorAll('.rm').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      onChange(field.key, items.filter((_, k) => k !== idx), { structural: true });
    });
  });
}

/** Список всех полей схемы (плоский), для импорта и ИИ */
export function flattenFields(template) {
  const out = [];
  for (const g of template.schema) for (const f of g.fields) out.push({ ...f, group: g.title, groupLevel: g.level });
  return out;
}

export { getPath, setPath };
