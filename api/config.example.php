<?php
/**
 * Образец настроек прокси ИИ. Рабочий файл api/config.php в репозиторий не попадает:
 * при деплое на хостинг он создаётся из секрета AI_API_KEY (и переменных AI_PROXY_BASE_URL, AI_MODEL,
 * AI_PROXY_ORIGINS, если заданы) шагом «Write AI proxy config» в .github/workflows/pages.yml.
 * Для ручной установки скопируйте этот файл в config.php рядом с ai.php и впишите ключ.
 */
return [
  'PROVIDER_KEY' => '',                                                  // ключ OpenAI-совместимого API
  'BASE_URL' => 'https://hr-assistant.pro6000.cloudsmasters.ru/api/v1',  // адрес API без /chat/completions
  'MODEL' => 'qwen3.8-27b-nvfp4',
  'ALLOWED_ORIGINS' => ['https://scout-argument.ru', 'https://mmvolkov.github.io'],
  'RATE_LIMIT' => 40,     // запросов с одного IP за RATE_WINDOW секунд
  'RATE_WINDOW' => 600,
  'MAX_TOKENS' => 2000,
  'TIMEOUT' => 120,
];
