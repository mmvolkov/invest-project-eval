/**
 * Создаёт api/config.php для прокси ИИ (api/ai.php) из переменных окружения. Используется при деплое на хостинг.
 *
 *   AI_API_KEY         — ключ OpenAI-совместимого API (секрет репозитория); пустой → прокси отвечает 503
 *   AI_PROXY_BASE_URL  — адрес API без /chat/completions (по умолчанию учебный сервер cloudsmasters)
 *   AI_MODEL           — модель (по умолчанию qwen3.8-27b-nvfp4)
 *   AI_PROXY_ORIGINS   — разрешённые Origin через запятую (по умолчанию scout-argument.ru и mmvolkov.github.io)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (k, d = '') => (process.env[k] || '').trim() || d;
const key = env('AI_API_KEY');
const baseUrl = env('AI_PROXY_BASE_URL', 'https://hr-assistant.pro6000.cloudsmasters.ru/api/v1');
const model = env('AI_MODEL', 'qwen3.8-27b-nvfp4');
const origins = env('AI_PROXY_ORIGINS', 'https://scout-argument.ru,https://mmvolkov.github.io')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const php = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const out = `<?php
// Сгенерировано при деплое (scripts/write-ai-proxy-config.mjs). Не редактируйте вручную.
return [
  'PROVIDER_KEY' => ${php(key)},
  'BASE_URL' => ${php(baseUrl)},
  'MODEL' => ${php(model)},
  'ALLOWED_ORIGINS' => [${origins.map(php).join(', ')}],
];
`;
fs.writeFileSync(path.join(root, 'api/config.php'), out);
console.log(`AI proxy config: baseUrl=${baseUrl} model=${model} origins=${origins.join(' ')} key=${key ? 'set (' + key.length + ' chars)' : 'EMPTY — прокси будет отвечать 503'}`);
