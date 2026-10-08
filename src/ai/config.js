/**
 * Настройки ИИ по умолчанию для всех посетителей сайта.
 *
 * Этот файл перезаписывается при деплое на GitHub Pages из секретов и переменных репозитория
 * (см. шаг «Inject AI config» в .github/workflows/pages.yml):
 *   vars.AI_PROVIDER  — openai | anthropic | webhook   (по умолчанию: значение ниже)
 *   vars.AI_BASE_URL  — адрес API или прокси/вебхука
 *   vars.AI_MODEL     — модель
 *   vars.AI_LABEL     — подпись в интерфейсе
 *   secrets.AI_API_KEY — ключ (в репозиторий не попадает, но в собранный сайт — да,
 *                        поэтому для боевого ключа используйте прокси worker/ или n8n)
 *
 * Пользователь может переопределить любые поля в настройках ассистента (хранятся в его браузере).
 */
export const DEFAULT_AI_CONFIG = {
  provider: 'openai',
  baseUrl: 'https://ai.pro6000.cloudsmasters.ru/v1',
  model: 'qwen3.8-27b-nvfp4',
  apiKey: '',
  label: 'Qwen 3.8 27B (учебный сервер)',
};
