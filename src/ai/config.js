/**
 * Настройки ИИ по умолчанию для всех посетителей сайта.
 *
 * Сейчас по умолчанию подключён учебный OpenAI-совместимый endpoint (vLLM, модель Qwen 3.8 27B),
 * который разрешает CORS и не требует настоящего ключа — поэтому значения можно держать в коде.
 *
 * При деплое на GitHub Pages файл можно перезаписать из настроек репозитория
 * (шаг «Inject AI config» в .github/workflows/pages.yml):
 *   vars.AI_PROVIDER  — openai | anthropic | webhook
 *   vars.AI_BASE_URL  — адрес API или прокси/вебхука
 *   vars.AI_MODEL     — модель
 *   vars.AI_LABEL     — подпись в интерфейсе
 *   secrets.AI_API_KEY — ключ (в репозиторий не попадает, но в собранный сайт — да,
 *                        поэтому боевой ключ держите на прокси worker/ или n8n)
 *
 * Пользователь может переопределить любые поля в настройках ассистента (хранятся в его браузере).
 */
export const DEFAULT_AI_CONFIG = {
  provider: 'openai',
  baseUrl: 'https://hr-assistant.pro6000.cloudsmasters.ru/api/v1',
  model: 'qwen3.8-27b-nvfp4',
  apiKey: 'dummy-key',
  label: 'Qwen 3.8 27B (учебный сервер cloudsmasters)',
};
