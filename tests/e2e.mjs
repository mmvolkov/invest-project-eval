/**
 * Сквозной smoke-тест в headless Chromium (Playwright).
 * Запуск: node tests/e2e.mjs [baseUrl]
 * Без аргумента файлы отдаются браузеру напрямую с диска (через перехват запросов к http://app.local),
 * поэтому локальный сервер и настройки прокси не нужны; CDN-библиотеки грузятся из сети.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const base = process.argv[2] || 'http://app.local';
const outDir = process.env.E2E_OUT || root;

const browser = await chromium.launch({ headless: true, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 1400, height: 900 } });
if (!process.argv[2]) {
  await ctx.route('http://app.local/**', (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
}
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text() + (m.location() && m.location().url ? ' @ ' + m.location().url : ''));
});
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

try {
  await page.goto(base + '/#/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.hero');
  const libs = await page.evaluate(() => ({ chart: typeof Chart !== 'undefined', xlsx: typeof XLSX !== 'undefined', docx: typeof docx !== 'undefined' }));
  console.log('libs:', libs);
  if (!libs.chart || !libs.xlsx || !libs.docx) fail('не загрузились CDN-библиотеки');
  const cards = await page.$$eval('.tpl-card', (els) => els.length);
  console.log('templates in catalog:', cards);
  if (cards < 10) fail('каталог неполный');

  const ids = await page.evaluate(() => window.__ipe.TEMPLATES.map((t) => t.id));
  for (const id of ids) {
    await page.goto(`${base}/#/t/${id}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#formBox .group');
    const kpi = await page.$$eval('#liveKpis .kpi', (els) => els.length);
    if (!kpi) fail(`${id}: нет KPI`);
    for (const tab of ['results', 'sensitivity', 'scenarios', 'montecarlo', 'export', 'ai', 'inputs']) {
      await page.click(`.tabs button[data-tab="${tab}"]`);
      await page.waitForTimeout(80);
      const visible = await page.$eval(`#tab-${tab}`, (el) => el.classList.contains('active') && el.innerHTML.length > 50);
      if (!visible) fail(`${id}: вкладка ${tab} пуста`);
    }
    console.log('ok template', id, 'kpis', kpi);
  }

  // Монте-Карло на проекте
  await page.goto(`${base}/#/t/project?sample=leveraged`, { waitUntil: 'networkidle' });
  await page.click('.tabs button[data-tab="montecarlo"]');
  await page.click('#mcRun');
  await page.waitForSelector('#mcChart', { timeout: 20000 });
  console.log('monte carlo ok');

  // изменение поля пересчитывает KPI
  await page.click('.tabs button[data-tab="inputs"]');
  const before = await page.$eval('#liveKpis .kpi .v', (el) => el.textContent);
  await page.fill('#f_general_discountRate', '30');
  await page.$eval('#f_general_discountRate', (el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(100);
  const after = await page.$eval('#liveKpis .kpi .v', (el) => el.textContent);
  if (before === after) fail('NPV не пересчитался после изменения ставки');
  console.log('recalc ok:', before, '→', after);

  // уровни: переключение на pro показывает Financing, на basic — скрывает
  await page.click('#levels button[data-level="pro"]');
  await page.waitForSelector('#formBox .group:has-text("Financing")');
  await page.click('#levels button[data-level="basic"]');
  await page.waitForTimeout(100);
  const hasFin = await page.$('#formBox .group:has-text("Financing")');
  if (hasFin) fail('на базовом уровне не должно быть листа Financing');
  await page.click('#levels button[data-level="pro"]');
  console.log('level switch ok');

  // экспорт
  await page.click('.tabs button[data-tab="export"]');
  const dl1 = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#exXlsx');
  const d1 = await dl1;
  const p1 = await d1.path();
  console.log('xlsx:', d1.suggestedFilename(), fs.statSync(p1).size, 'bytes');
  if (fs.statSync(p1).size < 5000) fail('xlsx слишком мал');
  const dl2 = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#exDocx');
  const d2 = await dl2;
  const p2 = await d2.path();
  console.log('docx:', d2.suggestedFilename(), fs.statSync(p2).size, 'bytes');
  if (fs.statSync(p2).size < 10000) fail('docx слишком мал');
  const dl3 = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#tab-export .csv');
  const d3 = await dl3;
  console.log('csv:', d3.suggestedFilename(), fs.statSync(await d3.path()).size, 'bytes');
  fs.copyFileSync(p1, path.join(outDir, 'e2e-export.xlsx'));
  fs.copyFileSync(p2, path.join(outDir, 'e2e-export.docx'));

  // офлайн-диагностика ИИ
  await page.click('.tabs button[data-tab="ai"]');
  await page.click('#expertBtn');
  await page.waitForSelector('.msg.assistant');
  console.log('expert ok');

  // импорт JSON-модели и сохранение
  await page.click('#btnSaveJson');

  // мобильная ширина
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${base}/#/t/express?sample=cafe`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#formBox .group');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (overflow) fail('горизонтальный скролл на мобильной ширине');
  await page.screenshot({ path: path.join(outDir, 'e2e-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${base}/#/t/project?sample=leveraged`, { waitUntil: 'networkidle' });
  await page.click('.tabs button[data-tab="results"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'e2e-results.png'), fullPage: true });
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'e2e-home.png'), fullPage: false });
} catch (e) {
  fail(e.stack || e.message);
}
if (errors.length) {
  console.log('browser errors:');
  for (const e of errors) console.log('  ', e);
  if (errors.some((e) => e.startsWith('pageerror'))) process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
