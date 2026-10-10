// Сквозная проверка демо-режима (Playwright). Запуск: node tests/demo.e2e.mjs — около 4 минут, нужен доступ к серверу ИИ.
// Проверка демо-режима: автозапуск по бездействию, двойной клик, остановка действием пользователя, восстановление данных.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright')); }

import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || path.join(root, '.demo-shots');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const browser = await chromium.launch({ headless: true, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
await ctx.route('http://app.local/**', (route) => {
  let p = decodeURIComponent(new URL(route.request().url()).pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// 1. Автозапуск по бездействию (30 с)
await page.goto('http://app.local/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
log("after 3s, demo bar:", !!(await page.$('.demo-bar')));
await page.waitForSelector('.demo-bar', { timeout: 15000 });
log('idle demo started');
let last = '';
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const bar = await page.$('.demo-bar');
  if (!bar) break;
  const step = await page.$eval('.demo-step', (e) => e.textContent).catch(() => '');
  const text = await page.$eval('.demo-text', (e) => e.textContent).catch(() => '');
  if (step + text !== last) {
    last = step + text;
    log(step, '|', text.slice(0, 70), '| hash', await page.evaluate(() => location.hash));
    await page.screenshot({ path: path.join(OUT, `auto_${step.replace(/\D/g, '_')}.png`) });
  }
  await page.waitForTimeout(700);
}
log('demo finished; hash', await page.evaluate(() => location.hash), '| toast:', await page.$eval('#toast', (e) => e.textContent));
log('ai messages in history:', await page.evaluate(() => window.__ipe.state.ai.history.length));

// 2. Двойной клик на «Ассистент» и остановка движением мыши
await page.goto('http://app.local/#/t/express?sample=cafe', { waitUntil: 'networkidle' });
await page.waitForSelector('#formBox .group');
await page.fill('#f_investment', '9999');
await page.dispatchEvent('#f_investment', 'change');
await page.waitForTimeout(500);
const before = await page.evaluate(() => window.__ipe.state.inputs.investment);
log('user investment before demo:', before);
await page.dblclick('#aiBtn');
await page.waitForSelector('.demo-bar', { timeout: 5000 });
log('dblclick demo started; tab:', await page.evaluate(() => window.__ipe.state.tab));
await page.waitForTimeout(12000);
log('step now:', await page.$eval('.demo-step', (e) => e.textContent).catch(() => '-'), '| hash', await page.evaluate(() => location.hash));
await page.mouse.move(300, 300);
await page.mouse.move(600, 500, { steps: 5 });
await page.waitForTimeout(1500);
log('after mouse move, demo bar present:', !!(await page.$('.demo-bar')), '| toast:', await page.$eval('#toast', (e) => e.textContent));
await page.waitForTimeout(800);
log('restored investment:', await page.evaluate(() => window.__ipe.state.inputs && window.__ipe.state.inputs.investment), '| hash', await page.evaluate(() => location.hash));
log('errors:', errors.length ? errors : 'none');
await browser.close();
