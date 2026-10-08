/**
 * Рендер mermaid-схем из docs/diagrams/*.mmd в docs/img/*.png (headless Chromium + mermaid с CDN).
 * Запуск: node scripts/render-diagrams.mjs [имя-без-расширения ...]
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
const srcDir = path.join(root, 'docs/diagrams');
const outDir = path.join(root, 'docs/img');
fs.mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.mmd') && (!only.length || only.includes(f.replace(/\.mmd$/, ''))));

const html = `<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>body{margin:0;background:#fff;font-family:Inter,Segoe UI,Arial,sans-serif} #box{display:inline-block;padding:16px;background:#fff}</style>
</head><body><div id="box"></div></body></html>`;

const browser = await chromium.launch({ headless: true, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, deviceScaleFactor: 2, viewport: { width: 1600, height: 1200 } })).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose', fontFamily: 'Inter, Segoe UI, Arial, sans-serif', themeVariables: { primaryColor: '#e8f0fe', primaryBorderColor: '#1f6feb', primaryTextColor: '#16202c', lineColor: '#51606f', secondaryColor: '#e4f5ea', tertiaryColor: '#fff4dc', fontSize: '15px' }, flowchart: { curve: 'basis', padding: 12, nodeSpacing: 40, rankSpacing: 50 } }));
for (const f of files) {
  const def = fs.readFileSync(path.join(srcDir, f), 'utf8');
  const name = f.replace(/\.mmd$/, '');
  try {
    await page.evaluate(async (def) => {
      const { svg } = await mermaid.render('d' + Math.random().toString(36).slice(2), def);
      document.getElementById('box').innerHTML = svg;
      const s = document.querySelector('#box svg');
      s.style.maxWidth = 'none';
      const vb = (s.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      if (vb.length === 4 && vb[2] > 0) {
        s.setAttribute('width', Math.ceil(vb[2]));
        s.setAttribute('height', Math.ceil(vb[3]));
        s.style.width = Math.ceil(vb[2]) + 'px';
        s.style.height = Math.ceil(vb[3]) + 'px';
      }
    }, def);
    await page.waitForTimeout(100);
    const box = await page.$('#box');
    await box.screenshot({ path: path.join(outDir, name + '.png'), omitBackground: false });
    const dims = await page.evaluate(() => { const r = document.querySelector('#box svg').getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
    console.log('ok', name, dims);
  } catch (e) {
    console.log('FAIL', name, e.message.split('\n')[0]);
    process.exitCode = 1;
  }
}
await browser.close();
