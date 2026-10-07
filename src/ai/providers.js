/**
 * Провайдеры LLM. Все вызовы идут из браузера; ключи хранятся только в localStorage пользователя.
 * Для продакшена рекомендуется прокси (Cloudflare Worker из папки worker/ или n8n-вебхук),
 * чтобы не раздавать ключ в браузер.
 *
 * providers:
 *  - openai   : любой OpenAI-совместимый endpoint (OpenAI, DeepSeek, OpenRouter, Groq, Mistral, YandexGPT (v1), Ollama, LM Studio…)
 *  - anthropic: Claude API напрямую (нужен заголовок anthropic-dangerous-direct-browser-access)
 *  - webhook  : n8n / собственный прокси: POST JSON { system, messages, context } → { reply } | { content } | OpenAI-формат
 */

export const PROVIDERS = [
  { id: 'openai', label: 'OpenAI-совместимый API (OpenAI, DeepSeek, OpenRouter, YandexGPT, Ollama…)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  { id: 'webhook', label: 'n8n-вебхук / свой прокси (Cloudflare Worker)', baseUrl: '', model: '' },
];

export const DEFAULT_AI_SETTINGS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  maxTokens: 2000,
  autoApply: false,
  extraHeaders: '',
};

function parseHeaders(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

async function readError(res) {
  let text = '';
  try {
    text = await res.text();
  } catch (e) {
    /* ignore */
  }
  return `${res.status} ${res.statusText}${text ? ': ' + text.slice(0, 400) : ''}`;
}

/** Единый интерфейс: chat({system, messages, context, settings}) → { text, raw } */
export async function chat({ system, messages, context, settings, signal }) {
  const s = { ...DEFAULT_AI_SETTINGS, ...(settings || {}) };
  const headers = { 'Content-Type': 'application/json', ...parseHeaders(s.extraHeaders) };
  if (s.provider === 'anthropic') {
    headers['x-api-key'] = s.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const res = await fetch(`${(s.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ model: s.model, max_tokens: Number(s.maxTokens) || 2000, temperature: Number(s.temperature) || 0, system, messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { text, raw: data };
  }
  if (s.provider === 'webhook') {
    if (!s.baseUrl) throw new Error('Укажите URL вебхука');
    if (s.apiKey) headers['Authorization'] = `Bearer ${s.apiKey}`;
    const res = await fetch(s.baseUrl, { method: 'POST', headers, signal, body: JSON.stringify({ system, messages, context, model: s.model || undefined }) });
    if (!res.ok) throw new Error(await readError(res));
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return { text: await res.text(), raw: null };
    const data = await res.json();
    const text = extractText(data);
    if (!text) throw new Error('Вебхук вернул ответ без текста. Ожидается { "reply": "…" } или формат OpenAI.');
    return { text, raw: data };
  }
  // OpenAI-совместимый
  if (s.apiKey) headers['Authorization'] = `Bearer ${s.apiKey}`;
  const res = await fetch(`${(s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model: s.model, temperature: Number(s.temperature) || 0, max_tokens: Number(s.maxTokens) || 2000, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? extractText(data);
  if (text == null) throw new Error('Пустой ответ модели');
  return { text, raw: data };
}

function extractText(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return extractText(data[0]);
  for (const k of ['reply', 'answer', 'text', 'output', 'content', 'message', 'result', 'response']) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object') {
      const t = extractText(v);
      if (t) return t;
    }
  }
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data.content && Array.isArray(data.content)) return data.content.map((c) => c.text || '').join('\n');
  return null;
}
