/**
 * Перезаписывает src/ai/config.js значениями из переменных окружения (используется в деплое).
 * Пустые переменные не трогают значения по умолчанию из текущего файла.
 *
 *   AI_PROVIDER=webhook AI_BASE_URL=https://my-proxy.workers.dev AI_API_KEY=... node scripts/inject-ai-config.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/ai/config.js');
const { DEFAULT_AI_CONFIG } = await import(pathToFileURL(file).href);

const env = (k) => (process.env[k] || '').trim();
const cfg = {
  provider: env('AI_PROVIDER') || DEFAULT_AI_CONFIG.provider,
  baseUrl: env('AI_BASE_URL') || DEFAULT_AI_CONFIG.baseUrl,
  model: env('AI_MODEL') || DEFAULT_AI_CONFIG.model,
  apiKey: env('AI_API_KEY') || DEFAULT_AI_CONFIG.apiKey,
  label: env('AI_LABEL') || DEFAULT_AI_CONFIG.label,
};
if (!['openai', 'anthropic', 'webhook'].includes(cfg.provider)) throw new Error(`Неизвестный AI_PROVIDER: ${cfg.provider}`);

const out = `/** Сгенерировано при деплое (scripts/inject-ai-config.mjs). Не редактируйте вручную. */
export const DEFAULT_AI_CONFIG = ${JSON.stringify(cfg, null, 2)};
`;
fs.writeFileSync(file, out);
console.log(`AI config: provider=${cfg.provider} baseUrl=${cfg.baseUrl} model=${cfg.model} key=${cfg.apiKey ? 'set (' + cfg.apiKey.length + ' chars)' : 'empty'}`);
