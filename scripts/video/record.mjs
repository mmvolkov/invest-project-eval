// Запись демонстраций живого сайта (Playwright, 1920x1080, с имитацией курсора).
// Выход: video/raw/<scene>.webm + video/raw/<scene>.json (метки времени для вырезания ожиданий)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = 'https://scout-argument.ru/invest-project-eval';
const OUT = path.join(process.env.VID, 'raw');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];

const CURSOR_SCRIPT = `
(() => {
  function init() {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:36px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))';
    c.innerHTML = '<svg width="26" height="36" viewBox="0 0 26 36"><path d="M2 2 L2 28 L8.5 22 L13 33 L18 31 L13.5 20.5 L22 20 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const r = document.createElement('div');
    r.id = '__rip';
    r.style.cssText = 'position:fixed;width:44px;height:44px;border-radius:50%;border:3px solid #1f6feb;background:rgba(31,111,235,.25);z-index:2147483646;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.3);transition:opacity .45s ease-out, transform .45s ease-out';
    document.documentElement.appendChild(r);
    document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', (e) => {
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      r.style.transition = 'none'; r.style.opacity = '1'; r.style.transform = 'translate(-50%,-50%) scale(.3)';
      requestAnimationFrame(() => { r.style.transition = 'opacity .5s ease-out, transform .5s ease-out'; r.style.opacity = '0'; r.style.transform = 'translate(-50%,-50%) scale(1.4)'; });
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(name, fn) {
  if (only && only !== name) return;
  const browser = await chromium.launch({ headless: true, proxy: { server: process.env.HTTPS_PROXY }, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    locale: 'ru-RU',
  });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  page.on('requestfailed', (r) => console.log('  reqfailed:', r.url().slice(0, 120), r.failure()?.errorText));
  const t0 = Date.now();
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  const h = {
    page, mark,
    async move(sel, opt = {}) {
      const el = await page.waitForSelector(sel, { state: 'visible' });
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      const x = b.x + (opt.fx ?? 0.5) * b.width, y = b.y + (opt.fy ?? 0.5) * b.height;
      await page.mouse.move(x, y, { steps: opt.steps ?? 28 });
      return { x, y };
    },
    async click(sel, opt = {}) {
      await h.move(sel, opt);
      await sleep(opt.before ?? 350);
      await page.mouse.down(); await sleep(90); await page.mouse.up();
      await sleep(opt.after ?? 500);
    },
    async type(sel, text) {
      await h.click(sel, { after: 250 });
      await page.keyboard.press('Control+A');
      await sleep(200);
      await page.keyboard.type(text, { delay: 110 });
      await sleep(300);
      await page.keyboard.press('Tab');
    },
    async wheel(dy, stepsN = 8, pause = 90) {
      for (let i = 0; i < stepsN; i++) { await page.mouse.wheel(0, dy / stepsN); await sleep(pause); }
    },
    async goto(hash) {
      await page.goto(BASE + '/' + hash, { waitUntil: 'networkidle' });
      await page.mouse.move(960, 540);
      await sleep(600);
    },
  };
  console.log('▶', name);
  try { await fn(h); } catch (e) { console.error('✖', name, e.message); marks.error = e.message; }
  mark('end');
  await sleep(600);
  const v = page.video();
  await ctx.close();
  const p = await v.path();
  const dst = path.join(OUT, name + '.webm');
  fs.renameSync(p, dst);
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(marks, null, 2));
  await browser.close();
  console.log('✔', name, marks);
}

// --- Сцена: главная ---
await session('home', async (h) => {
  await h.goto('#/');
  await sleep(1200);
  await h.move('#levels button[data-level="express"]'); await sleep(500);
  await h.move('#levels button[data-level="basic"]'); await sleep(500);
  await h.move('#levels button[data-level="pro"]'); await sleep(700);
  await h.move('#startExpress'); await sleep(900);
  await h.wheel(700, 12, 110); await sleep(1300);
  await h.move('.card.clickable[data-id="project"]'); await sleep(900);
  await h.wheel(900, 12, 110); await sleep(1300);
  await h.wheel(900, 12, 110); await sleep(1500);
  await h.wheel(700, 10, 110); await sleep(1800);
});

// --- Сцена: экспресс-оценка ---
await session('express', async (h) => {
  await h.goto('#/t/express?sample=cafe');
  await h.page.waitForSelector('#formBox .group');
  await sleep(1500);
  await h.move('#f_investment'); await sleep(600);
  await h.move('#f_annualRevenue'); await sleep(500);
  await h.move('#f_discountRate'); await sleep(800);
  await h.type('#f_investment', '4500');
  await sleep(1800);
  await h.click('.tabs button[data-tab="results"]', { after: 900 });
  await h.page.waitForSelector('#kpis');
  await sleep(600);
  await h.move('#kpis', { fx: 0.12, fy: 0.5 }); await sleep(900);
  await h.move('#kpis', { fx: 0.62, fy: 0.5 }); await sleep(1200);
  await h.wheel(650, 10, 110); await sleep(2200);
  await h.wheel(700, 10, 110); await sleep(2600);
});

// --- Сцена: три уровня на универсальной модели ---
await session('levels', async (h) => {
  await h.goto('#/t/project?sample=leveraged&level=express');
  await h.page.waitForSelector('#formBox .group');
  await sleep(1500);
  await h.click('#levels button[data-level="basic"]', { after: 1500 });
  await h.wheel(500, 8, 100); await sleep(1200);
  await h.click('#levels button[data-level="pro"]', { after: 1500 });
  await h.wheel(600, 8, 100); await sleep(1400);
  await h.wheel(800, 8, 100); await sleep(1600);
  await h.click('.tabs button[data-tab="results"]', { after: 900 });
  await h.page.waitForSelector('#kpis');
  await sleep(900);
  await h.move('#kpis', { fx: 0.85, fy: 0.5 }); await sleep(1000);
  await h.wheel(800, 10, 110); await sleep(1800);
  await h.wheel(900, 10, 110); await sleep(1800);
  await h.wheel(900, 10, 110); await sleep(1800);
});

// --- Сцена: риски ---
await session('risk', async (h) => {
  await h.goto('#/t/project?sample=leveraged&level=pro&tab=results');
  await h.page.waitForSelector('#kpis');
  await sleep(800);
  await h.click('.tabs button[data-tab="sensitivity"]', { after: 1000 });
  await h.page.waitForSelector('#tornadoChart');
  await sleep(1200);
  await h.move('#tornadoChart'); await sleep(1500);
  await h.wheel(600, 8, 100); await sleep(2200);
  await h.click('.tabs button[data-tab="scenarios"]', { after: 1200 });
  await sleep(600);
  await h.move('.scenario[data-i="1"]'); await sleep(900);
  await h.wheel(500, 8, 100); await sleep(2200);
  await h.click('.tabs button[data-tab="montecarlo"]', { after: 1000 });
  await h.page.selectOption('#mcIter', '5000');
  await sleep(500);
  await h.click('#mcRun', { after: 300 });
  await h.page.waitForSelector('#mcChart', { timeout: 60000 });
  await sleep(800);
  await h.wheel(500, 8, 100); await sleep(2800);
  await h.wheel(500, 8, 100); await sleep(2200);
});

// --- Сцена: ИИ-ассистент ---
await session('ai', async (h) => {
  await h.goto('#/t/project?sample=leveraged&level=pro&tab=results');
  await h.page.waitForSelector('#kpis');
  await sleep(600);
  await h.click('.tabs button[data-tab="ai"]', { after: 1200 });
  await h.move('.quick .qp[data-i="0"]'); await sleep(500);
  await h.move('.quick .qp[data-i="1"]'); await sleep(500);
  await h.click('.quick .qp[data-i="2"]', { after: 300 });
  h.mark('ai_sent');
  await h.page.waitForFunction(() => document.querySelectorAll('.chat-log .msg').length >= 2, null, { timeout: 240000 });
  h.mark('ai_reply');
  await sleep(1500);
  const log = await h.page.$('.chat-log');
  if (log) { await h.move('.chat-log', { fy: 0.9 }); await sleep(300); await h.page.mouse.wheel(0, 400); await sleep(1500); await h.page.mouse.wheel(0, 400); await sleep(1500); }
  const apply = await h.page.$('.chat-log .apply');
  if (apply) { await h.click('.chat-log .apply', { after: 1500 }); h.mark('applied'); }
  await sleep(1500);
  await h.move('.chat-log .useConcl'); await sleep(1800);
});

// --- Сцена: экспорт ---
await session('export', async (h) => {
  await h.goto('#/t/project?sample=leveraged&level=pro&tab=results');
  await h.page.waitForSelector('#kpis');
  await sleep(600);
  await h.click('.tabs button[data-tab="export"]', { after: 1200 });
  await h.move('#exXlsx'); await sleep(900);
  await h.click('#exXlsx', { after: 1800 });
  await h.move('#exDocx'); await sleep(700);
  await h.click('#exDocx', { after: 2000 });
  await h.move('#btnImport'); await sleep(1200);
  await h.wheel(500, 8, 100); await sleep(2500);
});
