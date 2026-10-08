/** Главный модуль: состояние, маршрутизация, каталог, рабочая область */
import { TEMPLATES, CATEGORIES, LEVELS, getTemplate, levelRank } from './templates/index.js';
import { renderForm, flattenFields, seriesLength } from './ui/forms.js';
import { renderKpis, renderConclusion, renderCharts, renderTables } from './ui/results.js';
import { renderSensitivity, renderScenarios, renderMonteCarlo } from './ui/analysis_ui.js';
import { allChartImages, hasChartJs } from './ui/charts.js';
import { fmt, escapeHtml, mdToHtml, downloadBlob, safeName } from './ui/format.js';
import { exportXlsx, exportCsv, readTabular, guessMapping, hasXlsx } from './export/xlsx.js';
import { exportDocx, hasDocx } from './export/docx.js';
import { deepClone, setPath, getPath } from './engine/utils.js';
import { tornado, switchingValue, scenarios as runScenarios } from './engine/analysis.js';
import { PROVIDERS, DEFAULT_AI_SETTINGS } from './ai/providers.js';
import { DEFAULT_AI_CONFIG } from './ai/config.js';
import { askAssistant, applyActions, QUICK_PROMPTS } from './ai/assistant.js';
import { expertReview } from './ai/expert.js';

const LS = {
  get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  },
  set(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  },
};

const state = {
  level: LS.get('ipe:level', 'basic'),
  templateId: null,
  template: null,
  inputs: null,
  sampleId: null,
  tab: 'inputs',
  result: null,
  analysis: {},
  ai: { settings: { ...DEFAULT_AI_SETTINGS, ...DEFAULT_AI_CONFIG, ...LS.get('ipe:ai', {}) }, history: [], lastConclusion: '' },
};

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');

/* ---------- Утилиты ---------- */
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box">${html}</div>`;
  m.classList.remove('hidden');
  m.querySelectorAll('.close').forEach((b) => b.addEventListener('click', closeModal));
  m.addEventListener('click', (e) => {
    if (e.target === m) closeModal();
  });
  return m;
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modal').innerHTML = '';
}

function inputsKey(id) {
  return `ipe:inputs:${id}`;
}

/* ---------- Маршрутизация ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 't' && parts[1]) return { page: 'template', id: parts[1], sample: params.get('sample'), level: params.get('level'), tab: params.get('tab') };
  return { page: 'home' };
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const r = parseHash();
  $('#sidebar').classList.remove('open');
  if (r.page === 'template') openTemplate(r.id, r);
  else renderHome();
  renderCatalog();
  renderLevels();
}

/* ---------- Каталог и уровни ---------- */
function renderLevels() {
  const box = $('#levels');
  const tpl = state.template;
  box.innerHTML = LEVELS.map((l) => {
    const allowed = !tpl || tpl.levels.includes(l.id);
    return `<button data-level="${l.id}" class="${state.level === l.id ? 'active' : ''}" ${allowed ? '' : 'disabled'} title="${escapeHtml(l.description)}${allowed ? '' : ' (недоступно для этого шаблона)'}">${l.title}</button>`;
  }).join('');
  box.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      setLevel(b.dataset.level);
    })
  );
}

function setLevel(id) {
  state.level = id;
  LS.set('ipe:level', id);
  renderLevels();
  if (state.template) {
    renderWorkspace();
  } else renderHome();
}

function renderCatalog() {
  const q = ($('#search').value || '').trim().toLowerCase();
  const box = $('#catalog');
  let html = '';
  for (const cat of CATEGORIES) {
    const list = TEMPLATES.filter((t) => t.category === cat.id).filter((t) => !q || `${t.title} ${t.short} ${t.description} ${(t.tags || []).join(' ')} ${t.subcategory}`.toLowerCase().includes(q));
    if (!list.length) continue;
    html += `<div class="cat-title">${cat.icon} ${cat.title}</div>`;
    for (const t of list) {
      html += `<button class="tpl-card ${state.templateId === t.id ? 'active' : ''}" data-id="${t.id}"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.short)}</small><div class="tpl-badges">${t.levels.map((l) => `<span class="badge ${l}">${LEVELS.find((x) => x.id === l).title}</span>`).join('')}</div></button>`;
    }
  }
  box.innerHTML = html || '<div class="empty">Ничего не найдено</div>';
  box.querySelectorAll('.tpl-card').forEach((b) => b.addEventListener('click', () => navigate(`#/t/${b.dataset.id}`)));
}

/* ---------- Главная ---------- */
function renderHome() {
  state.template = null;
  state.templateId = null;
  document.title = 'Оценка инвестпроектов';
  const lvl = LEVELS.find((l) => l.id === state.level);
  main.innerHTML = `
    <section class="hero">
      <h1>Оценка инвестиционных проектов: от простой модели к глубокой</h1>
      <p>Выберите шаблон, загрузите свои данные или поэкспериментируйте с примерами. Сервис считает NPV, IRR, PI, срок окупаемости, потребность в финансировании, строит анализ чувствительности, сценарии и Монте-Карло, а ИИ-ассистент проверяет допущения и готовит заключение.</p>
      <p><button class="btn" id="startExpress">⚡ Экспресс-оценка за минуту</button> <button class="btn ghost" id="startPro" style="color:#fff;border-color:rgba(255,255,255,0.6)">Универсальная модель</button></p>
    </section>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Экспресс</h3><p class="muted">Семь чисел — инвестиции, выручка, затраты, горизонт, ставка. Для отбора идей.</p></div>
      <div class="step"><div class="num">2</div><h3>Базовая</h3><p class="muted">Ряды по периодам, объекты CapEx с амортизацией, переменные и постоянные затраты, налог.</p></div>
      <div class="step"><div class="num">3</div><h3>Расширенная</h3><p class="muted">Кредиты и DSCR, оборотный капитал, терминальная стоимость, перенос убытков, FCFE, Монте-Карло.</p></div>
    </div>
    <h2>Библиотека шаблонов <small class="muted">· текущий уровень: ${escapeHtml(lvl.title)}</small></h2>
    ${CATEGORIES.map(
      (cat) => `<h3 style="margin-top:16px">${cat.icon} ${cat.title} <small class="muted">— ${escapeHtml(cat.description)}</small></h3>
      <div class="grid-cards">${TEMPLATES.filter((t) => t.category === cat.id)
        .map(
          (t) => `<div class="card clickable" data-id="${t.id}"><strong>${escapeHtml(t.title)}</strong><p class="muted" style="margin:6px 0">${escapeHtml(t.short)}</p>
          <div class="tpl-badges">${t.levels.map((l) => `<span class="badge ${l}">${LEVELS.find((x) => x.id === l).title}</span>`).join('')} ${(t.tags || []).slice(0, 3).map((x) => `<span class="badge">${escapeHtml(x)}</span>`).join('')}</div>
          <p class="muted" style="font-size:0.8rem;margin:8px 0 0">Примеры: ${t.samples.map((s) => escapeHtml(s.name)).join(' · ')}</p></div>`
        )
        .join('')}</div>`
    ).join('')}
    <h2 style="margin-top:24px">Что умеет сервис</h2>
    <div class="grid-cards">
      <div class="card"><strong>Методика</strong><p class="muted">Листы CapEx → Financing → Effect → CF и анализ эффективности: дисконтированные потоки, NPV, IRR/MIRR, PI, PP/DPP, потребность в финансировании, DSCR.</p></div>
      <div class="card"><strong>Анализ рисков</strong><p class="muted">«Что если», торнадо, пороговые значения, сценарии с вероятностями, имитация Монте-Карло с распределением результата.</p></div>
      <div class="card"><strong>Экспорт</strong><p class="muted">Excel с формулами (ЧПС/ВСД), CSV любой таблицы, отчёт Word с графиками и заключением, JSON модели.</p></div>
      <div class="card"><strong>ИИ-ассистент</strong><p class="muted">Подключите OpenAI-совместимый API, Claude или n8n-вебхук: проверка допущений, подбор ставки, сценарии, заключение, автоматическое применение изменений.</p></div>
    </div>`;
  $('#startExpress').addEventListener('click', () => navigate('#/t/express?sample=cafe'));
  $('#startPro').addEventListener('click', () => navigate('#/t/project?sample=base'));
  main.querySelectorAll('.card.clickable').forEach((c) => c.addEventListener('click', () => navigate(`#/t/${c.dataset.id}`)));
}

/* ---------- Открытие шаблона ---------- */
function openTemplate(id, opts = {}) {
  const tpl = getTemplate(id);
  if (!tpl) return renderHome();
  const changed = state.templateId !== id;
  state.template = tpl;
  state.templateId = id;
  if (opts.level && LEVELS.some((l) => l.id === opts.level)) state.level = opts.level;
  if (!tpl.levels.includes(state.level)) {
    const r = levelRank(state.level);
    state.level = tpl.levels.find((l) => levelRank(l) >= r) || tpl.levels[tpl.levels.length - 1];
    LS.set('ipe:level', state.level);
  }
  if (changed || opts.sample) {
    state.analysis = {};
    state.ai.history = [];
    state.ai.lastConclusion = '';
    const saved = LS.get(inputsKey(id), null);
    if (opts.sample) {
      const s = tpl.samples.find((x) => x.id === opts.sample) || tpl.samples[0];
      state.inputs = deepClone(s.inputs);
      state.sampleId = s.id;
    } else if (saved && saved.inputs) {
      state.inputs = saved.inputs;
      state.sampleId = saved.sampleId || null;
    } else {
      state.inputs = deepClone(tpl.samples[0].inputs);
      state.sampleId = tpl.samples[0].id;
    }
    if (tpl.normalize) state.inputs = tpl.normalize(state.inputs);
    state.tab = opts.tab || 'inputs';
  }
  document.title = `${tpl.title} — Оценка инвестпроектов`;
  renderWorkspace();
}

function persistInputs() {
  LS.set(inputsKey(state.templateId), { inputs: state.inputs, sampleId: state.sampleId, ts: Date.now() });
}

function compute() {
  try {
    state.result = state.template.compute(deepClone(state.inputs));
    state.error = null;
  } catch (e) {
    console.error(e);
    state.error = e.message;
    state.result = null;
  }
  return state.result;
}

/* ---------- Рабочая область ---------- */
const TABS = [
  ['inputs', '✏️ Исходные данные'],
  ['results', '📊 Результаты'],
  ['sensitivity', '🎯 Чувствительность'],
  ['scenarios', '🔀 Сценарии'],
  ['montecarlo', '🎲 Монте-Карло'],
  ['export', '📤 Отчёт и экспорт'],
  ['ai', '🤖 ИИ-ассистент'],
];

function renderWorkspace() {
  const tpl = state.template;
  compute();
  const lvl = LEVELS.find((l) => l.id === state.level);
  main.innerHTML = `
    <div class="ws-head">
      <h1>${escapeHtml(tpl.title)} <span class="badge ${state.level}">${escapeHtml(lvl.title)}</span></h1>
      <div class="ws-tools">
        <select class="btn" id="sampleSel" title="Загрузить пример"><option value="">Примеры…</option>${tpl.samples.map((s) => `<option value="${s.id}" ${s.id === state.sampleId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
        <button class="btn" id="btnImport" title="Загрузить ряды из Excel/CSV">📥 Импорт данных</button>
        <button class="btn" id="btnSaveJson" title="Сохранить модель в файл">💾 JSON</button>
        <button class="btn" id="btnLoadJson" title="Открыть модель из файла">📂 Открыть</button>
        <button class="btn" id="btnReset" title="Вернуть пример">↺ Сброс</button>
      </div>
      <p class="desc">${escapeHtml(tpl.description)}</p>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${label}</button>`).join('')}</div>
    ${TABS.map(([id]) => `<div class="tab-panel ${state.tab === id ? 'active' : ''}" id="tab-${id}"></div>`).join('')}`;

  $('#sampleSel').addEventListener('change', (e) => {
    if (!e.target.value) return;
    navigate(`#/t/${tpl.id}?sample=${e.target.value}`);
    e.target.value = e.target.value;
  });
  $('#btnReset').addEventListener('click', () => {
    const s = tpl.samples.find((x) => x.id === state.sampleId) || tpl.samples[0];
    state.inputs = tpl.normalize ? tpl.normalize(deepClone(s.inputs)) : deepClone(s.inputs);
    persistInputs();
    renderWorkspace();
    toast('Данные примера восстановлены');
  });
  $('#btnSaveJson').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'invest-project-eval', version: 1, templateId: tpl.id, level: state.level, inputs: state.inputs, analysis: state.analysis, savedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${safeName(state.inputs?.general?.name || state.inputs?.name || tpl.title)}.json`);
  });
  $('#btnLoadJson').addEventListener('click', () => pickFile('.json', async (file) => {
    try {
      const obj = JSON.parse(await file.text());
      if (!obj.templateId || !getTemplate(obj.templateId)) throw new Error('Файл не содержит модель сервиса');
      LS.set(inputsKey(obj.templateId), { inputs: obj.inputs, sampleId: null, ts: Date.now() });
      if (obj.analysis) state.analysis = obj.analysis;
      navigate(`#/t/${obj.templateId}${obj.level ? '?level=' + obj.level : ''}`);
      if (obj.templateId === state.templateId) {
        state.inputs = obj.inputs;
        renderWorkspace();
      }
      toast('Модель загружена');
    } catch (e) {
      alert('Не удалось открыть файл: ' + e.message);
    }
  }));
  $('#btnImport').addEventListener('click', openImportDialog);
  main.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      main.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      main.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${state.tab}`));
      renderTab(state.tab);
    })
  );
  renderInputsTab();
  renderTab(state.tab);
}

function renderTab(id) {
  const tpl = state.template;
  const box = $(`#tab-${id}`);
  if (!state.result && id !== 'inputs') {
    box.innerHTML = `<div class="note warn">Ошибка расчёта: ${escapeHtml(state.error || '')}</div>`;
    return;
  }
  switch (id) {
    case 'inputs':
      break;
    case 'results':
      renderResultsTab(box);
      break;
    case 'sensitivity':
      renderSensitivity(box, tpl, state.inputs, state.analysis, (patch) => {
        Object.assign(state.analysis, patch);
        renderTab('sensitivity');
      });
      break;
    case 'scenarios':
      renderScenarios(box, tpl, state.inputs, state.analysis, (patch) => {
        Object.assign(state.analysis, patch);
        renderTab('scenarios');
      });
      break;
    case 'montecarlo':
      renderMonteCarlo(box, tpl, state.inputs, state.analysis, (patch) => {
        Object.assign(state.analysis, patch);
        renderTab('montecarlo');
      });
      break;
    case 'export':
      renderExportTab(box);
      break;
    case 'ai':
      renderAiTab(box);
      break;
  }
}

function renderInputsTab() {
  const box = $('#tab-inputs');
  box.innerHTML = `<div class="split"><div id="formBox"></div><div><div class="note">Результат пересчитывается автоматически. Уровень модели переключается в шапке: <strong>Экспресс → Базовая → Расширенная</strong> открывает дополнительные листы и поля.</div><div id="liveKpis" class="kpis"></div><div id="liveConclusion" class="conclusion"></div></div></div>`;
  const formBox = $('#formBox');
  const onChange = (path, value, { structural = false } = {}) => {
    setPath(state.inputs, path, value);
    if (state.template.normalize) state.inputs = state.template.normalize(state.inputs);
    persistInputs();
    compute();
    if (structural) renderForm(formBox, state.template, state.inputs, state.level, onChange);
    renderLive();
  };
  renderForm(formBox, state.template, state.inputs, state.level, onChange);
  renderLive();
}

function renderLive() {
  const k = $('#liveKpis');
  const c = $('#liveConclusion');
  if (!k) return;
  if (!state.result) {
    k.innerHTML = `<div class="note warn">Ошибка расчёта: ${escapeHtml(state.error || '')}</div>`;
    c.innerHTML = '';
    return;
  }
  renderKpis(k, state.result.kpis.slice(0, 8), state.result.unit, state.inputs?.general?.periodLabel);
  renderConclusion(c, state.result.conclusion);
  if (state.tab !== 'inputs') renderTab(state.tab);
}

function renderResultsTab(box) {
  const r = state.result;
  box.innerHTML = `<div id="kpis" class="kpis"></div><div id="concl" class="conclusion"></div><div id="charts" class="charts"></div><div id="tables"></div>`;
  renderKpis($('#kpis'), r.kpis, r.unit, state.inputs?.general?.periodLabel);
  renderConclusion($('#concl'), r.conclusion);
  renderCharts($('#charts'), r.charts || []);
  renderTables($('#tables'), r.tables, { onCsv: (t) => exportCsv(t) });
}

/* ---------- Экспорт ---------- */
function analysisSummary() {
  const tpl = state.template;
  const lines = [];
  if (!tpl.drivers || !tpl.drivers.length) return { lines, tables: {} };
  const key = (tpl.metrics || [])[0].key;
  const m = tpl.metrics[0];
  const fn = (inp) => tpl.metric(inp, key);
  const tor = tornado(fn, state.inputs, tpl.drivers, 0.1);
  const steps = [-0.2, -0.1, 0, 0.1, 0.2];
  const sensTable = {
    title: 'Чувствительность: торнадо ±10 % и пороговые значения',
    columns: [{ label: 'Фактор', fmt: 'text' }, { label: `${m.label} при −10 %`, fmt: m.fmt }, { label: `${m.label} при +10 %`, fmt: m.fmt }, { label: 'Размах', fmt: m.fmt }, { label: 'Порог (изм. фактора, при котором показатель = 0)', fmt: 'text' }],
    rows: tor.rows.map((r) => {
      const sv = switchingValue(fn, state.inputs, r.driver);
      return { cells: [r.driver.label, r.low, r.high, r.swing, sv == null ? 'не достигается' : r.driver.mode === 'shift' ? `${sv.toFixed(1)} п.п.` : `${(sv * 100).toFixed(1)} %`] };
    }),
  };
  lines.push(`Наиболее влиятельные факторы (торнадо ±10 %): ${tor.rows.slice(0, 3).map((r) => r.driver.label).join(', ')}.`);
  const sc = state.analysis.scenarios && state.analysis.scenarios.length ? state.analysis.scenarios : tpl.defaultScenarios ? tpl.defaultScenarios() : [];
  let scTable = null;
  if (sc.length) {
    const res = runScenarios((inp) => ({ kpi: Object.fromEntries(tpl.metrics.map((mm) => [mm.key, tpl.metric(inp, mm.key)])) }), state.inputs, sc, key);
    scTable = { title: 'Сценарии', columns: [{ label: 'Сценарий', fmt: 'text' }, { label: 'Вероятность', fmt: 'ratio' }, ...tpl.metrics.map((mm) => ({ label: mm.label, fmt: mm.fmt }))], rows: res.results.map((r) => ({ cells: [r.scenario.name, r.scenario.probability, ...tpl.metrics.map((mm) => r.result.kpi[mm.key])] })) };
    if (res.expected != null) {
      scTable.rows.push({ cells: ['Ожидаемое значение', null, res.expected, ...tpl.metrics.slice(1).map(() => null)], style: 'total' });
      lines.push(`Сценарии: ${res.results.map((r) => `${r.scenario.name} — ${fmt(r.metric, m.fmt)}`).join('; ')}; ожидаемое значение ${m.label} ${fmt(res.expected, m.fmt)}.`);
    }
  }
  let mcTable = null;
  const mc = state.analysis.mcResult;
  if (mc) {
    mcTable = { title: 'Монте-Карло', columns: [{ label: 'Статистика', fmt: 'text' }, { label: m.label, fmt: m.fmt }], rows: [['Итераций', mc.iterations], ['Среднее', mc.mean], ['P10', mc.p10], ['P50', mc.p50], ['P90', mc.p90], ['Минимум', mc.min], ['Максимум', mc.max], ['Вероятность < 0', mc.probNegative]].map(([l, v]) => ({ cells: [l, v], fmt: l === 'Итераций' ? 'int' : l.startsWith('Вероятность') ? 'pct' : m.fmt })) };
    lines.push(`Монте-Карло (${mc.iterations} итераций): P10 ${fmt(mc.p10, m.fmt)}, P50 ${fmt(mc.p50, m.fmt)}, P90 ${fmt(mc.p90, m.fmt)}; вероятность ${m.label} < 0 — ${fmt(mc.probNegative, 'pct')}.`);
  }
  return { lines, tables: { sensitivity: sensTable, scenarios: scTable, monteCarlo: mcTable } };
}

function renderExportTab(box) {
  const r = state.result;
  const libs = [['Chart.js (графики)', hasChartJs()], ['SheetJS (Excel/CSV)', hasXlsx()], ['docx (Word)', hasDocx()]];
  box.innerHTML = `
    <div class="two-col">
      <div class="card">
        <h3>Выгрузка</h3>
        <p class="muted">Excel содержит исходные данные, показатели, все расчётные листы (для листа CF — формулы коэффициентов дисконтирования, DCF, ЧПС/ВСД), чувствительность, сценарии и заключение.</p>
        <div class="row">
          <button class="btn primary" id="exXlsx">📗 Excel (.xlsx)</button>
          <button class="btn primary" id="exDocx">📘 Отчёт Word (.docx)</button>
          <button class="btn" id="exPrint">🖨 Печать / PDF</button>
        </div>
        <h3 style="margin-top:16px">CSV по таблицам</h3>
        <div class="row">${r.tables.map((t, i) => `<button class="btn small csv" data-i="${i}">${escapeHtml(t.title)}</button>`).join('')}</div>
        <p class="muted" style="margin-top:12px;font-size:0.8rem">Библиотеки: ${libs.map(([n, ok]) => `${ok ? '✓' : '✗'} ${n}`).join(' · ')}</p>
      </div>
      <div class="card">
        <h3>Состав отчёта</h3>
        <ol class="muted">
          <li>Ключевые показатели с оценкой</li>
          <li>Заключение (алгоритмическое${state.ai.lastConclusion ? ' + ИИ' : ''}) и анализ рисков</li>
          <li>Графики (из вкладки «Результаты», ${(r.charts || []).length} шт.)</li>
          <li>Расчётные таблицы (${r.tables.length} шт.)</li>
          <li>Исходные данные</li>
        </ol>
        <label class="check"><input type="checkbox" id="exIncludeAnalysis" checked /> Включить чувствительность, сценарии и Монте-Карло</label>
        ${state.ai.lastConclusion ? '<p class="muted">Заключение ИИ-ассистента будет добавлено в отчёт.</p>' : '<p class="muted">Чтобы добавить заключение ИИ, нажмите «Сделай заключение» во вкладке ассистента.</p>'}
      </div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Предпросмотр заключения</h3><ul>${r.conclusion.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>${state.ai.lastConclusion ? `<h4>Заключение ИИ</h4><div class="md">${mdToHtml(state.ai.lastConclusion)}</div>` : ''}</div>
    <div id="exportCharts" class="charts" style="position:absolute;left:-9999px;top:0;width:900px"></div>`;
  $('#exXlsx').addEventListener('click', () => {
    try {
      const inc = $('#exIncludeAnalysis').checked;
      const a = inc ? analysisSummary() : { lines: [], tables: {} };
      const name = exportXlsx({ template: state.template, inputs: state.inputs, levelId: state.level, result: r, extra: { ...a.tables, aiConclusion: state.ai.lastConclusion } });
      toast(`Сохранено: ${name}`);
    } catch (e) {
      alert('Ошибка экспорта: ' + e.message);
    }
  });
  $('#exDocx').addEventListener('click', async () => {
    try {
      const btn = $('#exDocx');
      btn.disabled = true;
      btn.textContent = 'Формирую…';
      const hidden = $('#exportCharts');
      renderCharts(hidden, r.charts || []);
      await new Promise((res) => setTimeout(res, 400));
      const charts = allChartImages(hidden);
      const inc = $('#exIncludeAnalysis').checked;
      const a = inc ? analysisSummary() : { lines: [] };
      const name = await exportDocx({ template: state.template, inputs: state.inputs, levelId: state.level, result: r, charts, aiConclusion: state.ai.lastConclusion, analysisText: a.lines });
      hidden.innerHTML = '';
      toast(`Сохранено: ${name}`);
      btn.disabled = false;
      btn.textContent = '📘 Отчёт Word (.docx)';
    } catch (e) {
      alert('Ошибка экспорта: ' + e.message);
      $('#exDocx').disabled = false;
      $('#exDocx').textContent = '📘 Отчёт Word (.docx)';
    }
  });
  $('#exPrint').addEventListener('click', () => {
    state.tab = 'results';
    renderWorkspace();
    setTimeout(() => window.print(), 300);
  });
  box.querySelectorAll('.csv').forEach((b) => b.addEventListener('click', () => exportCsv(r.tables[Number(b.dataset.i)])));
}

/* ---------- Импорт из Excel/CSV ---------- */
function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.addEventListener('change', () => {
    if (inp.files[0]) cb(inp.files[0]);
  });
  inp.click();
}

function openImportDialog() {
  const tpl = state.template;
  const seriesFields = flattenFields(tpl).filter((f) => f.type === 'series');
  modal(`<h2>Импорт данных из Excel / CSV <button class="close" aria-label="Закрыть">✕</button></h2>
    <p class="muted">Файл читается в браузере, никуда не отправляется. Берутся строки, где в первой ячейке подпись, а далее числа по периодам. ${seriesFields.length ? 'Сопоставьте строки файла полям модели.' : 'В этом шаблоне нет рядов по периодам — импорт через буфер обмена и JSON.'}</p>
    <div class="row"><button class="btn primary" id="impPick">Выбрать файл (.xlsx, .xls, .csv)</button></div>
    <div id="impBody" style="margin-top:12px"></div>`);
  $('#impPick').addEventListener('click', () =>
    pickFile('.xlsx,.xls,.csv,.txt', async (file) => {
      try {
        const rows = await readTabular(file);
        if (!rows.length) return ($('#impBody').innerHTML = '<div class="note warn">В файле не найдено строк с подписью и числами.</div>');
        const mapping = guessMapping(tpl, state.inputs, rows);
        $('#impBody').innerHTML = `<p class="muted">Найдено строк: ${rows.length}.</p>
          ${mapping.length ? `<table class="data"><thead><tr><th>Поле модели</th><th>Строка файла</th></tr></thead><tbody>${mapping
            .map((m, i) => `<tr><td>${escapeHtml(m.field.label)} <small class="muted">(${m.length} знач.)</small></td><td><select class="input imp-map" data-i="${i}"><option value="">— не импортировать —</option>${rows.map((r, k) => `<option value="${k}" ${m.rowIndex === k ? 'selected' : ''}>${escapeHtml(r.sheet)}!${r.row}: ${escapeHtml(r.label)} (${r.values.slice(0, 4).map((v) => fmt(v, 'money')).join(', ')}…)</option>`).join('')}</select></td></tr>`)
            .join('')}</tbody></table>
          <label class="check"><input type="checkbox" id="impShift" /> В файле нет периода t0 — сдвинуть значения на один период вперёд</label>
          <div class="row" style="margin-top:10px"><button class="btn primary" id="impApply">Применить</button></div>` : ''}
          <details style="margin-top:10px"><summary>Все найденные строки</summary><div class="table-scroll" style="max-height:260px">${rows.map((r) => `<div><code>${escapeHtml(r.sheet)}!${r.row}</code> ${escapeHtml(r.label)}: ${r.values.slice(0, 12).map((v) => fmt(v, 'money')).join(' | ')}</div>`).join('')}</div></details>`;
        const applyBtn = $('#impApply');
        if (applyBtn)
          applyBtn.addEventListener('click', () => {
            const shift = $('#impShift').checked;
            let n = 0;
            document.querySelectorAll('.imp-map').forEach((sel) => {
              if (sel.value === '') return;
              const m = mapping[Number(sel.dataset.i)];
              const src = rows[Number(sel.value)].values;
              const len = seriesLength(tpl, m.field, state.inputs);
              const arr = new Array(len).fill(0);
              for (let t = 0; t < len; t++) {
                const si = shift ? t - 1 : t;
                if (si >= 0 && si < src.length) arr[t] = src[si];
              }
              setPath(state.inputs, m.field.key, arr);
              n++;
            });
            if (tpl.normalize) state.inputs = tpl.normalize(state.inputs);
            persistInputs();
            closeModal();
            renderWorkspace();
            toast(`Импортировано рядов: ${n}`);
          });
      } catch (e) {
        $('#impBody').innerHTML = `<div class="note warn">Ошибка чтения: ${escapeHtml(e.message)}</div>`;
      }
    })
  );
}

/* ---------- ИИ-ассистент ---------- */
function renderAiTab(box) {
  const s = state.ai.settings;
  const configured = s.provider === 'webhook' ? !!s.baseUrl : !!s.apiKey || /localhost|127\.0\.0\.1/.test(s.baseUrl || '');
  const isDefault = s.provider === DEFAULT_AI_CONFIG.provider && s.baseUrl === DEFAULT_AI_CONFIG.baseUrl && s.model === DEFAULT_AI_CONFIG.model && s.apiKey === DEFAULT_AI_CONFIG.apiKey;
  const defaultNote = DEFAULT_AI_CONFIG.baseUrl
    ? `<div class="note" style="margin-bottom:10px">${isDefault ? '✓ Используется подключение по умолчанию' : 'Для сайта задано подключение по умолчанию'}: <strong>${escapeHtml(DEFAULT_AI_CONFIG.label || DEFAULT_AI_CONFIG.model)}</strong>${DEFAULT_AI_CONFIG.apiKey || DEFAULT_AI_CONFIG.provider === 'webhook' ? '' : ' (ключ не задан — укажите свой или подключите прокси)'}.</div>`
    : '';
  box.innerHTML = `<div class="ai-layout">
    <div class="chat">
      <div class="quick">${QUICK_PROMPTS.map((q, i) => `<button class="btn small qp" data-i="${i}">${escapeHtml(q.label)}</button>`).join('')}<button class="btn small" id="expertBtn" title="Диагностика без LLM">🧮 Диагностика (офлайн)</button></div>
      <div class="chat-log" id="chatLog"></div>
      <div class="chat-input"><textarea id="chatText" placeholder="${configured ? 'Спросите о модели: «почему IRR ниже ставки?», «увеличь выручку на 10 %», «подбери ставку по CAPM»…' : 'Настройте провайдера справа или используйте офлайн-диагностику'}"></textarea><button class="btn primary" id="chatSend">Отправить</button></div>
    </div>
    <div class="ai-settings card">
      <h3>Подключение ИИ</h3>
      ${defaultNote}
      <div class="field"><label>Провайдер</label><select class="input" id="aiProvider">${PROVIDERS.map((p) => `<option value="${p.id}" ${s.provider === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}</select></div>
      <div class="field"><label>${s.provider === 'webhook' ? 'URL вебхука / прокси' : 'Base URL'}</label><input class="input" id="aiUrl" value="${escapeHtml(s.baseUrl || '')}" placeholder="${s.provider === 'webhook' ? 'https://n8n.example.com/webhook/finassist' : 'https://api.openai.com/v1'}" /></div>
      <div class="field"><label>API-ключ ${s.provider === 'webhook' ? '(необязательно, Bearer)' : ''}</label><input class="input" id="aiKey" type="password" value="${escapeHtml(s.apiKey || '')}" autocomplete="off" /></div>
      <div class="field"><label>Модель</label><input class="input" id="aiModel" value="${escapeHtml(s.model || '')}" placeholder="gpt-4o-mini / claude-sonnet-5-5 / deepseek-chat" /></div>
      <div class="field"><label>Доп. заголовки (строка: Name: value)</label><textarea class="input" id="aiHeaders" rows="2" placeholder="HTTP-Referer: https://my.site">${escapeHtml(s.extraHeaders || '')}</textarea></div>
      <label class="check"><input type="checkbox" id="aiAuto" ${s.autoApply ? 'checked' : ''} /> Автопилот: применять предложенные изменения без подтверждения</label>
      <div class="row"><button class="btn primary" id="aiSave">Сохранить</button><button class="btn" id="aiTest">Проверить</button>${DEFAULT_AI_CONFIG.baseUrl && !isDefault ? '<button class="btn ghost" id="aiReset" title="Вернуть подключение по умолчанию">↺ По умолчанию</button>' : ''}</div>
      <p class="muted" style="font-size:0.78rem;margin-top:10px">Ключ хранится только в вашем браузере (localStorage) и отправляется напрямую провайдеру. Для командной работы разверните прокси из папки <code>worker/</code> (Cloudflare Worker) или n8n-вебхук — тогда ключ остаётся на сервере.</p>
    </div></div>`;
  const log = $('#chatLog');
  const renderLog = () => {
    log.innerHTML = state.ai.history
      .map((m, i) => {
        if (m.role === 'user') return `<div class="msg user">${escapeHtml(m.content)}</div>`;
        if (m.role === 'system') return `<div class="msg system">${escapeHtml(m.content)}</div>`;
        let html = `<div class="msg assistant"><div class="md">${mdToHtml(m.content)}</div>`;
        if (m.actions && m.actions.length) {
          html += `<div class="actions"><strong>Предложенные изменения (${m.actions.length}):</strong><br/>${m.actions.map((a) => `<code>${escapeHtml(a.op)} ${escapeHtml(a.path)}${a.value !== undefined ? ' = ' + escapeHtml(JSON.stringify(a.value).slice(0, 60)) : ''}${a.index !== undefined ? ' #' + a.index : ''}</code>${a.why ? ` <small class="muted">— ${escapeHtml(a.why)}</small>` : ''}`).join('<br/>')}
          <div class="row" style="margin-top:6px">${m.applied ? '<span class="tag">применено</span>' : `<button class="btn small primary apply" data-i="${i}">Применить</button>`} <button class="btn small useConcl" data-i="${i}">В отчёт как заключение</button></div></div>`;
        } else html += `<div class="row" style="margin-top:6px"><button class="btn small useConcl" data-i="${i}">В отчёт как заключение</button></div>`;
        return html + '</div>';
      })
      .join('');
    log.scrollTop = log.scrollHeight;
    log.querySelectorAll('.apply').forEach((b) => b.addEventListener('click', () => applyFromHistory(Number(b.dataset.i))));
    log.querySelectorAll('.useConcl').forEach((b) =>
      b.addEventListener('click', () => {
        state.ai.lastConclusion = state.ai.history[Number(b.dataset.i)].content;
        toast('Заключение добавлено в отчёт');
      })
    );
  };
  const applyFromHistory = (i) => {
    const m = state.ai.history[i];
    const { inputs, log: l } = applyActions(state.template, state.inputs, m.actions);
    state.inputs = state.template.normalize ? state.template.normalize(inputs) : inputs;
    m.applied = true;
    persistInputs();
    compute();
    state.ai.history.push({ role: 'system', content: `Изменения применены:\n${l.join('\n')}\nНовые показатели: ${state.result.kpis.slice(0, 4).map((k) => `${k.label.split(' — ')[0]} ${fmt(k.value, k.fmt)}`).join('; ')}` });
    renderLog();
    renderInputsTab();
    toast('Модель обновлена');
  };
  renderLog();
  const send = async (text) => {
    if (!text.trim()) return;
    if (!configured) {
      state.ai.history.push({ role: 'user', content: text }, { role: 'system', content: 'Провайдер не настроен. Укажите API-ключ или URL вебхука справа. Пока доступна офлайн-диагностика.' });
      renderLog();
      return;
    }
    state.ai.history.push({ role: 'user', content: text });
    renderLog();
    const btn = $('#chatSend');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      const { message, actions, parseError } = await askAssistant({ template: state.template, inputs: state.inputs, result: state.result, levelId: state.level, history: state.ai.history, userText: text, settings: state.ai.settings });
      const msg = { role: 'assistant', content: message || '(пустой ответ)', actions };
      state.ai.history.push(msg);
      if (parseError) state.ai.history.push({ role: 'system', content: 'Блок actions не удалось разобрать: ' + parseError });
      if (actions.length && state.ai.settings.autoApply) applyFromHistory(state.ai.history.indexOf(msg));
    } catch (e) {
      state.ai.history.push({ role: 'system', content: 'Ошибка запроса: ' + e.message + (/Failed to fetch|NetworkError/.test(e.message) ? '. Возможно, провайдер не разрешает запросы из браузера (CORS) — используйте прокси/вебхук.' : '') });
    }
    btn.disabled = false;
    btn.textContent = 'Отправить';
    renderLog();
  };
  $('#chatSend').addEventListener('click', () => {
    const t = $('#chatText');
    send(t.value);
    t.value = '';
  });
  $('#chatText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      send(e.target.value);
      e.target.value = '';
    }
  });
  box.querySelectorAll('.qp').forEach((b) => b.addEventListener('click', () => send(QUICK_PROMPTS[Number(b.dataset.i)].text)));
  $('#expertBtn').addEventListener('click', () => {
    const text = expertReview(state.template, state.inputs, state.result);
    state.ai.history.push({ role: 'user', content: 'Диагностика модели (офлайн)' }, { role: 'assistant', content: text, actions: [] });
    renderLog();
  });
  $('#aiProvider').addEventListener('change', (e) => {
    const p = PROVIDERS.find((x) => x.id === e.target.value);
    state.ai.settings = { ...state.ai.settings, provider: p.id, baseUrl: p.baseUrl, model: p.model };
    renderAiTab(box);
  });
  const saveSettings = () => {
    state.ai.settings = { ...state.ai.settings, provider: $('#aiProvider').value, baseUrl: $('#aiUrl').value.trim(), apiKey: $('#aiKey').value.trim(), model: $('#aiModel').value.trim(), extraHeaders: $('#aiHeaders').value, autoApply: $('#aiAuto').checked };
    LS.set('ipe:ai', state.ai.settings);
  };
  $('#aiSave').addEventListener('click', () => {
    saveSettings();
    toast('Настройки ИИ сохранены');
    renderAiTab(box);
  });
  $('#aiTest').addEventListener('click', () => {
    saveSettings();
    const s2 = state.ai.settings;
    if (!(s2.provider === 'webhook' ? !!s2.baseUrl : !!s2.apiKey || /localhost|127\.0\.0\.1/.test(s2.baseUrl || ''))) return renderAiTab(box);
    send('Ответь одной строкой: какой у проекта NPV и что это значит?');
  });
  const resetBtn = $('#aiReset');
  if (resetBtn)
    resetBtn.addEventListener('click', () => {
      state.ai.settings = { ...DEFAULT_AI_SETTINGS, ...DEFAULT_AI_CONFIG };
      LS.set('ipe:ai', {});
      toast('Подключение по умолчанию восстановлено');
      renderAiTab(box);
    });
}

/* ---------- Настройки ---------- */
function openSettings() {
  const theme = LS.get('ipe:theme', 'auto');
  modal(`<h2>Настройки <button class="close" aria-label="Закрыть">✕</button></h2>
    <div class="field"><label>Тема</label><select class="input" id="themeSel">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, l]) => `<option value="${v}" ${theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <h3 style="margin-top:14px">Данные</h3>
    <p class="muted">Все модели хранятся в браузере (localStorage). Можно очистить сохранённые данные всех шаблонов.</p>
    <div class="row"><button class="btn danger" id="clearAll">Очистить сохранённые модели</button></div>
    <h3 style="margin-top:14px">О сервисе</h3>
    <p class="muted">Статический сайт без сервера: расчёты, экспорт и ИИ-запросы выполняются в браузере. Исходный код и методика — на <a href="https://github.com/mmvolkov/invest-project-eval" target="_blank" rel="noopener">GitHub</a>.</p>`);
  $('#themeSel').addEventListener('change', (e) => {
    LS.set('ipe:theme', e.target.value);
    applyTheme();
  });
  $('#clearAll').addEventListener('click', () => {
    if (!confirm('Удалить сохранённые данные всех шаблонов?')) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ipe:inputs:'))
      .forEach((k) => localStorage.removeItem(k));
    closeModal();
    toast('Сохранённые модели удалены');
    route();
  });
}

function applyTheme() {
  const t = LS.get('ipe:theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ---------- Инициализация ---------- */
function init() {
  applyTheme();
  $('#search').addEventListener('input', renderCatalog);
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#aiBtn').addEventListener('click', () => {
    if (!state.template) navigate('#/t/express?sample=cafe&tab=ai');
    else {
      state.tab = 'ai';
      renderWorkspace();
    }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  route();
  window.__ipe = { state, TEMPLATES };
}

init();
