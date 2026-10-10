/**
 * Демо-режим: автоматический показ возможностей сервиса прямо в интерфейсе.
 * Сервис сам ходит по шаблонам и вкладкам, меняет данные, запускает Монте-Карло и
 * обращается к ИИ-ассистенту; на экране анимированный курсор и подписи к шагам.
 *
 * Запуск: startDemo(opts) — из app.js по двойному клику на «Ассистент» или по бездействию
 * (armIdleDemo). Любое действие пользователя (клик, клавиша, колесо, движение мыши) останавливает показ.
 * Модуль работает только через DOM и location.hash, поэтому не зависит от внутренностей app.js;
 * восстановление данных после показа делает колбэк opts.onStop.
 */

const SEL = {
  startExpress: '#startExpress',
  formGroup: '#formBox .group',
  investment: '#f_investment',
  kpis: '#kpis',
  charts: '#charts',
  tab: (id) => `.tabs button[data-tab="${id}"]`,
  tornado: '#tornadoChart',
  scenario: '.scenario[data-i="1"]',
  mcIter: '#mcIter',
  mcRun: '#mcRun',
  mcChart: '#mcChart',
  quick: (i) => `.quick .qp[data-i="${i}"]`,
  chatLog: '.chat-log',
  apply: '.chat-log .apply',
  exportX: '#exXlsx',
  exportD: '#exDocx',
};

let running = false;
let abort = null;
let ui = null;
let listeners = [];
let idleTimer = null;
let idleArmed = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Stopped extends Error {}

function checkAbort() {
  if (abort && abort.signal.aborted) throw new Stopped('stopped');
}

async function pause(ms) {
  const step = 100;
  for (let t = 0; t < ms; t += step) {
    checkAbort();
    await sleep(Math.min(step, ms - t));
  }
}

/* ---------- Оверлей: курсор, подпись, прогресс ---------- */
function mountUi() {
  const cur = document.createElement('div');
  cur.className = 'demo-cursor';
  cur.innerHTML = '<svg width="26" height="36" viewBox="0 0 26 36"><path d="M2 2 L2 28 L8.5 22 L13 33 L18 31 L13.5 20.5 L22 20 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
  const rip = document.createElement('div');
  rip.className = 'demo-ripple';
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.innerHTML = `<div class="demo-head"><span class="demo-badge">▶ Демо-режим</span><span class="demo-step"></span><button type="button" class="btn small demo-stop">Остановить</button></div>
    <div class="demo-text"></div><div class="demo-progress"><i></i></div>`;
  document.body.append(cur, rip, bar);
  bar.querySelector('.demo-stop').addEventListener('click', () => stopDemo('button'));
  ui = { cur, rip, bar, text: bar.querySelector('.demo-text'), step: bar.querySelector('.demo-step'), prog: bar.querySelector('.demo-progress i') };
  cur.style.transform = `translate(${window.innerWidth / 2}px, ${window.innerHeight / 2}px)`;
}

function unmountUi() {
  if (!ui) return;
  ui.cur.remove();
  ui.rip.remove();
  ui.bar.remove();
  ui = null;
}

function say(text, i, n) {
  if (!ui) return;
  ui.text.textContent = text;
  if (i != null) {
    ui.step.textContent = `Шаг ${i} из ${n}`;
    ui.prog.style.width = `${Math.round((i / n) * 100)}%`;
  }
}

/* ---------- Действия ---------- */
function $(sel) {
  return document.querySelector(sel);
}

async function waitFor(sel, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    checkAbort();
    const el = $(sel);
    if (el && (el.offsetParent !== null || el.getClientRects().length)) return el;
    await sleep(120);
  }
  throw new Error(`Элемент не появился: ${sel}`);
}

async function scrollTo(el, block = 'center') {
  el.scrollIntoView({ behavior: 'smooth', block, inline: 'nearest' });
  await pause(650);
}

async function moveTo(el) {
  checkAbort();
  await scrollTo(el);
  const b = el.getBoundingClientRect();
  const x = b.left + Math.min(b.width * 0.5, 160);
  const y = b.top + b.height * 0.5;
  ui.cur.style.transform = `translate(${x}px, ${y}px)`;
  await pause(750);
  return { x, y };
}

async function clickEl(sel, after = 500) {
  const el = await waitFor(sel);
  const { x, y } = await moveTo(el);
  ui.rip.style.left = `${x}px`;
  ui.rip.style.top = `${y}px`;
  ui.rip.classList.remove('go');
  void ui.rip.offsetWidth;
  ui.rip.classList.add('go');
  await pause(180);
  el.click();
  await pause(after);
  return el;
}

async function typeInto(sel, text) {
  const el = await waitFor(sel);
  await moveTo(el);
  el.focus();
  el.value = '';
  for (const ch of text) {
    el.value += ch;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await pause(110);
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
  await pause(400);
}

function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
  return pause(500);
}

function selectValue(sel, value) {
  const el = $(sel);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------- Сценарий ---------- */
const STEPS = [
  {
    text: 'Это автоматическая демонстрация сервиса. Он сам покажет основные возможности. Чтобы остановить показ, пошевелите мышью, нажмите любую клавишу или кнопку «Остановить».',
    run: async () => {
      await go('#/');
      await pause(4200);
    },
  },
  {
    text: 'Начнём с экспресс-оценки: семь чисел и ответ «окупится или нет».',
    run: async () => {
      await clickEl(SEL.startExpress, 300);
      await waitFor(SEL.formGroup);
      await pause(2500);
    },
  },
  {
    text: 'Инвестиции, выручка, рост, затраты, горизонт, ставка и налог. Справа показатели считаются сразу при каждом изменении.',
    run: async () => {
      await moveTo(await waitFor(SEL.investment));
      await pause(3200);
    },
  },
  {
    text: 'Меняем инвестиции с 3 500 до 4 500 тыс. руб. NPV уходит в минус, карточка становится красной: проект перестаёт окупаться.',
    run: async () => {
      await typeInto(SEL.investment, '4500');
      await moveTo(await waitFor('#liveKpis'));
      await pause(4200);
    },
  },
  {
    text: 'Вкладка «Результаты»: NPV, IRR, индекс рентабельности, срок окупаемости, заключение словами и графики денежного потока.',
    run: async () => {
      await clickEl(SEL.tab('results'), 900);
      await moveTo(await waitFor(SEL.kpis));
      await pause(2200);
      const ch = $(SEL.charts);
      if (ch) await scrollTo(ch, 'start');
      await pause(2800);
    },
  },
  {
    text: 'Расширенная модель: кредиты и покрытие долга DSCR, оборотный капитал, терминальная стоимость, перенос убытков. Те же данные, больше глубины.',
    run: async () => {
      await go('#/t/project?sample=leveraged&level=pro&tab=results');
      await moveTo(await waitFor(SEL.kpis));
      await pause(3000);
      const ch = $(SEL.charts);
      if (ch) await scrollTo(ch, 'start');
      await pause(2500);
    },
  },
  {
    text: 'Чувствительность: торнадо показывает, какие факторы бьют сильнее, а пороговые значения говорят, при каком изменении проект уходит в минус.',
    run: async () => {
      await clickEl(SEL.tab('sensitivity'), 800);
      await moveTo(await waitFor(SEL.tornado));
      await pause(4500);
    },
  },
  {
    text: 'Сценарии: базовый, пессимистичный и оптимистичный с вероятностями. Итог: ожидаемое значение NPV.',
    run: async () => {
      await clickEl(SEL.tab('scenarios'), 800);
      const sc = $(SEL.scenario);
      if (sc) await moveTo(sc);
      await pause(3800);
    },
  },
  {
    text: 'Монте-Карло: тысячи случайных прогонов, распределение NPV и вероятность убытка.',
    run: async () => {
      await clickEl(SEL.tab('montecarlo'), 600);
      selectValue(SEL.mcIter, '2000');
      await clickEl(SEL.mcRun, 300);
      const chart = await waitFor(SEL.mcChart, 60000);
      await moveTo(chart);
      await pause(4200);
    },
  },
  {
    text: 'ИИ-ассистент видит всю модель. Попросим его подобрать ставку дисконтирования.',
    run: async () => {
      await clickEl(SEL.tab('ai'), 900);
      await pause(1500);
    },
  },
  {
    text: 'Ассистент думает: оценивает отрасль, ставки, структуру капитала и готовит набор изменений…',
    run: async (api) => {
      const log = await waitFor(SEL.chatLog);
      const before = log.querySelectorAll('.msg').length;
      await clickEl(SEL.quick(2), 300);
      const t0 = Date.now();
      let ok = false;
      while (Date.now() - t0 < 120000) {
        checkAbort();
        const msgs = log.querySelectorAll('.msg');
        if (msgs.length >= before + 2) {
          const last = msgs[msgs.length - 1];
          ok = !last.classList.contains('system') || /применены/i.test(last.textContent);
          break;
        }
        await sleep(300);
      }
      api.aiOk = ok;
      if (ok) {
        log.scrollTop = 0;
        await pause(2500);
        log.scrollTop = log.scrollHeight;
        await pause(1500);
      }
    },
  },
  {
    text: 'Ассистент объяснил расчёт ставки и предложил изменения. Нажимаем «Применить»: модель пересчитывается с новой ставкой.',
    skipIf: (api) => !api.aiOk,
    run: async () => {
      const apply = $(SEL.apply);
      if (apply) await clickEl(SEL.apply, 1500);
      await pause(3500);
    },
  },
  {
    text: 'Ассистент сейчас недоступен, пропускаем этот шаг. Обычно он проверяет допущения, подбирает ставку, строит сценарии и пишет заключение.',
    skipIf: (api) => api.aiOk,
    run: async () => {
      await pause(4000);
    },
  },
  {
    text: 'Отчёт и экспорт: Excel с живыми формулами, Word для инвесткомитета, CSV и JSON для обмена данными.',
    run: async () => {
      await clickEl(SEL.tab('export'), 800);
      await moveTo(await waitFor(SEL.exportX));
      await pause(1800);
      await moveTo(await waitFor(SEL.exportD));
      await pause(2500);
    },
  },
  {
    text: 'Демонстрация завершена. Попробуйте сами: выберите шаблон слева, подставьте свои цифры и скачайте отчёт.',
    run: async () => {
      await pause(5000);
    },
  },
];

/* ---------- Запуск и остановка ---------- */
function attachStopListeners() {
  let origin = null;
  const onInput = (e) => {
    if (!e.isTrusted) return;
    if (ui && ui.bar.contains(e.target)) return;
    if (e.type === 'pointermove' || e.type === 'mousemove') {
      if (!origin) {
        origin = { x: e.clientX, y: e.clientY };
        return;
      }
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 24) return;
    }
    stopDemo('user');
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove']) {
    document.addEventListener(type, onInput, { capture: true, passive: true });
    listeners.push([type, onInput]);
  }
}

function detachStopListeners() {
  for (const [type, fn] of listeners) document.removeEventListener(type, fn, { capture: true });
  listeners = [];
}

export function isDemoRunning() {
  return running;
}

/**
 * @param {object} opts
 * @param {() => any} [opts.onStart]   — вызывается до первого шага; может вернуть снимок данных
 * @param {(snapshot:any, reason:string) => void} [opts.onStop] — восстановление данных после показа
 */
export async function startDemo(opts = {}) {
  if (running) return;
  running = true;
  cancelIdle();
  abort = new AbortController();
  mountUi();
  attachStopListeners();
  const snapshot = opts.onStart ? opts.onStart() : null;
  const api = { aiOk: false };
  const steps = STEPS;
  let reason = 'finished';
  try {
    let n = 0;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.skipIf && st.skipIf(api)) continue;
      n += 1;
      say(st.text, n, steps.length - 1);
      await st.run(api);
    }
  } catch (e) {
    if (!(e instanceof Stopped)) {
      console.warn('demo:', e.message);
      reason = 'error';
      say('Демонстрация прервана: ' + e.message);
      await sleep(2500).catch(() => {});
    } else reason = abort.reason || 'stopped';
  } finally {
    finish(reason, snapshot, opts);
  }
}

function finish(reason, snapshot, opts) {
  if (!running) return;
  running = false;
  detachStopListeners();
  unmountUi();
  try {
    if (opts.onStop) opts.onStop(snapshot, reason);
  } catch (e) {
    console.warn('demo restore:', e.message);
  }
}

export function stopDemo(reason = 'user') {
  if (!running || !abort) return;
  abort.reason = reason;
  abort.abort();
  // Подпись и курсор убираем сразу, не дожидаясь завершения текущего шага
  if (ui) ui.bar.style.display = 'none';
}

/**
 * Автозапуск по бездействию: один раз за сессию, только на главной странице и только в видимой вкладке.
 * Любое действие пользователя сдвигает таймер.
 */
export function armIdleDemo(ms, opts = {}) {
  if (idleArmed) return;
  try {
    if (sessionStorage.getItem('ipe:demo:auto')) return;
  } catch (e) {
    /* sessionStorage недоступен — просто не запускаем автоматически */
    return;
  }
  idleArmed = true;
  const reset = () => {
    if (!idleArmed) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(fire, ms);
  };
  const fire = () => {
    if (!idleArmed) return;
    if (document.hidden || running || (opts.canStart && !opts.canStart())) return reset();
    cancelIdle();
    try {
      sessionStorage.setItem('ipe:demo:auto', '1');
    } catch (e) {
      /* ignore */
    }
    startDemo(opts);
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove', 'scroll']) document.addEventListener(type, reset, { capture: true, passive: true });
  document.addEventListener('visibilitychange', reset);
  reset();
}

export function cancelIdle() {
  idleArmed = false;
  clearTimeout(idleTimer);
}
