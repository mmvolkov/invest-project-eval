/**
 * Cloudflare Worker — прокси для ИИ-ассистента.
 * Ключ провайдера хранится в секрете воркера, браузер ключ не видит.
 *
 * Деплой:
 *   npm i -g wrangler && cd worker
 *   wrangler secret put PROVIDER_KEY        # ключ OpenAI / DeepSeek / Anthropic / …
 *   wrangler secret put ACCESS_TOKEN        # (необязательно) общий токен доступа для фронтенда
 *   wrangler deploy
 *
 * В сервисе: провайдер «n8n-вебхук / свой прокси», URL = https://<worker>.workers.dev, ключ = ACCESS_TOKEN.
 * Запрос фронтенда: POST { system, messages, context, model } → ответ { reply }.
 */

const DEFAULTS = {
  PROVIDER: 'openai', // openai | anthropic
  BASE_URL: 'https://api.openai.com/v1',
  MODEL: 'gpt-4o-mini',
  ALLOWED_ORIGINS: '*', // через запятую: https://user.github.io,https://my.tilda.ws
};

export default {
  async fetch(request, env) {
    const cfg = { ...DEFAULTS, ...pick(env, Object.keys(DEFAULTS)) };
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, cfg.ALLOWED_ORIGINS);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (env.ACCESS_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.ACCESS_TOKEN}`) return json({ error: 'unauthorized' }, 401, cors);
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad json' }, 400, cors);
    }
    const { system = '', messages = [], model } = body;
    try {
      let reply;
      if (cfg.PROVIDER === 'anthropic') {
        const r = await fetch(`${cfg.BASE_URL.replace(/\/$/, '')}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.PROVIDER_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model || cfg.MODEL, max_tokens: 2000, temperature: 0.2, system, messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) }),
        });
        const data = await r.json();
        if (!r.ok) return json({ error: data.error?.message || r.statusText }, r.status, cors);
        reply = (data.content || []).map((c) => c.text || '').join('\n');
      } else {
        const r = await fetch(`${cfg.BASE_URL.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PROVIDER_KEY}` },
          body: JSON.stringify({ model: model || cfg.MODEL, temperature: 0.2, max_tokens: 2000, messages: [{ role: 'system', content: system }, ...messages] }),
        });
        const data = await r.json();
        if (!r.ok) return json({ error: data.error?.message || r.statusText }, r.status, cors);
        reply = data.choices?.[0]?.message?.content || '';
      }
      return json({ reply }, 200, cors);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, cors);
    }
  },
};

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] != null) out[k] = obj[k];
  return out;
}

function corsHeaders(origin, allowed) {
  const list = String(allowed || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = list.includes('*') || list.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
