/**
 * Настройки ИИ по умолчанию для всех посетителей сайта.
 *
 * По умолчанию запросы идут на прокси api/ai.php, размещённый на хостинге сайта (Beget).
 * Прокси хранит ключ учебного OpenAI-совместимого сервера (Qwen 3.8 27B) у себя и разрешает запросы
 * только с доменов сайта, поэтому в коде ключа нет. Прямые обращения к серверу из браузера невозможны:
 * он требует ключ и не отвечает на preflight-запросы CORS.
 *
 * При деплое файл можно перезаписать из настроек репозитория (шаг «Inject AI config» в .github/workflows/pages.yml):
 *   vars.AI_PROVIDER  — openai | anthropic | webhook
 *   vars.AI_BASE_URL  — адрес API или прокси/вебхука
 *   vars.AI_MODEL     — модель
 *   vars.AI_LABEL     — подпись в интерфейсе
 *   secrets.AI_BROWSER_API_KEY — токен, который допустимо показать посетителю (например, ACCESS_TOKEN воркера)
 * Ключ модели (secrets.AI_API_KEY) сюда не попадает никогда: он уходит только в api/config.php на сервере.
 *
 * Пользователь может переопределить любые поля в настройках ассистента (хранятся в его браузере).
 */
export const DEFAULT_AI_CONFIG = {
  provider: 'webhook',
  baseUrl: 'https://scout-argument.ru/invest-project-eval/api/ai.php',
  model: 'qwen3.8-27b-nvfp4',
  apiKey: '',
  label: 'Qwen 3.8 27B через прокси сайта',
};
