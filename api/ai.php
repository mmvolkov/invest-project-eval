<?php
/**
 * Прокси ИИ-ассистента на хостинге сайта (PHP, без зависимостей).
 * Браузер шлёт POST { system, messages, context, model } на этот файл (провайдер «вебхук / свой прокси»),
 * прокси добавляет серверный ключ и вызывает OpenAI-совместимый API. Ответ: { "reply": "…" }.
 *
 * Ключ и адрес API лежат в api/config.php (в репозиторий не попадает, создаётся при деплое
 * из секрета AI_API_KEY, см. .github/workflows/pages.yml). Образец: api/config.example.php.
 *
 * Защита: список разрешённых Origin, лимит запросов с одного IP, ограничение размера запроса и истории.
 */

header('X-Robots-Tag: noindex');
$cfgFile = __DIR__ . '/config.php';
$cfg = is_file($cfgFile) ? include $cfgFile : [];
$cfg = array_merge([
  'PROVIDER_KEY' => '',
  'BASE_URL' => 'https://hr-assistant.pro6000.cloudsmasters.ru/api/v1',
  'MODEL' => 'qwen3.8-27b-nvfp4',
  'ALLOWED_ORIGINS' => ['https://scout-argument.ru', 'https://mmvolkov.github.io'],
  'RATE_LIMIT' => 40,          // запросов с одного IP …
  'RATE_WINDOW' => 600,        // … за столько секунд
  'MAX_TOKENS' => 2000,
  'TIMEOUT' => 120,
], is_array($cfg) ? $cfg : []);

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = in_array('*', $cfg['ALLOWED_ORIGINS'], true) || ($origin && in_array($origin, $cfg['ALLOWED_ORIGINS'], true));
if ($origin && $allowed) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  header('Access-Control-Max-Age: 600');
}

function out(array $data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
  http_response_code(204);
  exit;
}
if ($method !== 'POST') out(['error' => 'POST only'], 405);
if ($origin && !$allowed) out(['error' => 'origin not allowed'], 403);
if ($cfg['PROVIDER_KEY'] === '') out(['error' => 'Прокси не настроен: на сервере нет ключа API (api/config.php)'], 503);

// --- лимит запросов с одного IP (файл-счётчик во временной папке) ---
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$ip = trim(explode(',', $ip)[0]);
$bucket = sys_get_temp_dir() . '/ipe-ai-rate-' . md5($ip) . '.json';
$now = time();
$hits = [];
if (is_file($bucket)) {
  $hits = json_decode((string) file_get_contents($bucket), true) ?: [];
  $hits = array_values(array_filter($hits, fn($t) => $t > $now - (int) $cfg['RATE_WINDOW']));
}
if (count($hits) >= (int) $cfg['RATE_LIMIT']) out(['error' => 'Слишком много запросов, попробуйте позже'], 429);
$hits[] = $now;
@file_put_contents($bucket, json_encode($hits), LOCK_EX);

// --- тело запроса ---
$raw = file_get_contents('php://input', false, null, 0, 300000);
if ($raw === false || strlen($raw) >= 300000) out(['error' => 'Слишком большой запрос'], 413);
$body = json_decode($raw, true);
if (!is_array($body)) out(['error' => 'bad json'], 400);
$system = is_string($body['system'] ?? null) ? $body['system'] : '';
$messages = is_array($body['messages'] ?? null) ? $body['messages'] : [];
$messages = array_values(array_filter($messages, fn($m) => is_array($m) && isset($m['role'], $m['content']) && is_string($m['content'])));
$messages = array_slice($messages, -20);
$messages = array_map(fn($m) => ['role' => $m['role'] === 'assistant' ? 'assistant' : 'user', 'content' => $m['content']], $messages);
if (!$messages) out(['error' => 'messages пусты'], 400);
$model = is_string($body['model'] ?? null) && $body['model'] !== '' ? $body['model'] : $cfg['MODEL'];

// --- вызов провайдера ---
$payload = json_encode([
  'model' => $model,
  'temperature' => 0.2,
  'max_tokens' => (int) $cfg['MAX_TOKENS'],
  'messages' => array_merge($system !== '' ? [['role' => 'system', 'content' => $system]] : [], $messages),
], JSON_UNESCAPED_UNICODE);
$ch = curl_init(rtrim($cfg['BASE_URL'], '/') . '/chat/completions');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $payload,
  CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $cfg['PROVIDER_KEY']],
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => (int) $cfg['TIMEOUT'],
  CURLOPT_CONNECTTIMEOUT => 15,
]);
$resp = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$err = curl_error($ch);
curl_close($ch);
if ($resp === false) out(['error' => 'Провайдер недоступен: ' . $err], 502);
$data = json_decode($resp, true);
if ($status >= 400 || !is_array($data)) out(['error' => is_array($data) && isset($data['error']) ? (is_array($data['error']) ? ($data['error']['message'] ?? 'ошибка провайдера') : (string) $data['error']) : 'Ошибка провайдера (HTTP ' . $status . ')'], $status >= 400 ? $status : 502);
$reply = $data['choices'][0]['message']['content'] ?? '';
if (!is_string($reply) || $reply === '') out(['error' => 'Пустой ответ модели'], 502);
out(['reply' => $reply, 'model' => $data['model'] ?? $model, 'usage' => $data['usage'] ?? null]);
