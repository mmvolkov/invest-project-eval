# Оценка инвестпроектов — онлайн-сервис финансового моделирования

**Живой сайт:** https://mmvolkov.github.io/invest-project-eval/ · экспресс-оценка: [`#/t/express?sample=cafe`](https://mmvolkov.github.io/invest-project-eval/#/t/express?sample=cafe) · универсальная модель: [`#/t/project?sample=farm`](https://mmvolkov.github.io/invest-project-eval/#/t/project?sample=farm)

**От максимально простой верхнеуровневой модели до сложной и глубокой.** Статический
веб-сервис (без сервера и базы данных): расчёты, графики, экспорт и даже запросы к ИИ
выполняются прямо в браузере. Работает на GitHub Pages, Cloudflare Pages, встраивается в Tilda.

В основе — методика «Как оценить инвестиционный проект» (листы **CapEx → Financing → Effect →
CF → Анализ эффективности**) и каталог «Финансовые Excel-модели» Системы Финансовый директор
(разделы *Инвестиции · Анализ · Бюджеты · Отчёты*). Подробно: [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## Что умеет

| Блок | Возможности |
|---|---|
| **Три уровня модели** | *Экспресс* (7 чисел) → *Базовая* (ряды по периодам, CapEx, затраты, налог) → *Расширенная* (кредиты и DSCR, оборотный капитал, терминальная стоимость, перенос убытков, FCFE). Переключаются в шапке, поля открываются постепенно |
| **12 шаблонов с примерами** | Универсальная модель проекта (4 примера, в т. ч. из методики), экспресс-оценка, сравнение проектов, WACC, кредитный калькулятор с реальной ставкой, лизинг vs кредит, безубыточность, факторный анализ прибыли, план-факт, БДР/БДДС/баланс, оценка бизнеса DCF, финансовые коэффициенты |
| **Показатели** | NPV, IRR, MIRR, PI, PP, DPP, потребность в финансировании (ПФ/ДПФ), ARR, DSCR, NPV/IRR собственника |
| **Анализ рисков** | таблица «что если», торнадо, пороговые значения (switching values), сценарии с вероятностями, Монте-Карло с гистограммой и P10/P50/P90 |
| **Данные** | примеры «поиграться», ввод рядов с заполнением «база + рост», вставка из Excel через буфер обмена, импорт xlsx/csv с сопоставлением строк, сохранение/открытие модели в JSON, автосохранение в браузере |
| **Экспорт** | Excel (все листы, формулы коэффициентов дисконтирования, DCF, ЧПС/ВСД/PI), CSV любой таблицы, отчёт Word с показателями, заключением, графиками и таблицами, печать/PDF |
| **ИИ-ассистент** | алгоритмическое заключение и офлайн-диагностика допущений без ключей; подключение LLM: OpenAI-совместимые API (OpenAI, DeepSeek, OpenRouter, YandexGPT, Ollama…), Anthropic Claude, n8n-вебхук или свой прокси. Ассистент отвечает на вопросы, проверяет допущения, подбирает ставку, строит сценарии и **может сам менять модель** (протокол `actions`, режим «автопилот») |

## Быстрый старт локально

Сборка не нужна. Любой статический сервер:

```bash
npx serve .           # или: python3 -m http.server 8080
# открыть http://localhost:8080
```

Тесты:

```bash
npm test              # юнит-тесты движка и шаблонов (node --test)
npm run e2e           # сквозной тест в headless Chromium (нужен playwright)
```

## Развёртывание

### GitHub Pages (рекомендуется, бесплатно)

1. В репозитории: **Settings → Pages → Source: GitHub Actions**.
2. Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) при каждом пуше в `main`
   прогоняет тесты и публикует сайт. Адрес: `https://<логин>.github.io/invest-project-eval/`.

### Cloudflare Pages (бесплатно, свой домен, быстрый CDN)

Pages → Create project → подключить репозиторий → *Framework preset: None*, *Build command:*
пусто, *Build output directory:* `/`. Готово.

### Tilda

Tilda не выполняет модули и внешние скрипты внутри своих блоков надёжно, поэтому сервис
размещается на GitHub Pages / Cloudflare, а на странице Tilda вставляется блок **T123 (HTML)**:

```html
<iframe src="https://<логин>.github.io/invest-project-eval/#/t/express?sample=cafe"
        style="width:100%;height:1200px;border:0;border-radius:12px" loading="lazy"
        allow="clipboard-read; clipboard-write"></iframe>
```

Можно ссылаться на конкретный шаблон и пример: `#/t/project?sample=farm`,
`#/t/wacc`, `#/t/budget?level=pro`.

## Подключение ИИ

Вкладка **🤖 ИИ-ассистент** → «Подключение ИИ»:

| Вариант | Что указать | Когда использовать |
|---|---|---|
| OpenAI-совместимый API | Base URL (`https://api.openai.com/v1`, `https://api.deepseek.com`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` для Ollama), ключ, модель | личное использование: ключ хранится только в вашем браузере |
| Anthropic Claude | ключ, модель (`claude-sonnet-5-5`) | то же |
| n8n-вебхук / прокси | URL вебхука, при необходимости токен | командная работа: ключ остаётся на сервере, можно добавить RAG, логирование, лимиты |

Готовые заготовки:

* **Cloudflare Worker** — [`worker/ai-proxy.js`](worker/ai-proxy.js): `wrangler secret put PROVIDER_KEY`, `wrangler deploy`,
  в сервисе выбрать провайдер «n8n-вебхук / свой прокси» и указать адрес воркера.
* **n8n** — импортировать [`docs/n8n-ai-assistant-workflow.json`](docs/n8n-ai-assistant-workflow.json)
  (Webhook → Code → OpenAI → Respond to Webhook), указать креды и URL вебхука в сервисе.
  Контракт: `POST { system, messages[], context }` → `{ "reply": "…" }`.

### Модель по умолчанию для всех посетителей

Значения по умолчанию лежат в [`src/ai/config.js`](src/ai/config.js) (провайдер, адрес, модель, подпись).
При деплое на GitHub Pages шаг «Inject AI config» перезаписывает этот файл из настроек репозитория
(**Settings → Secrets and variables → Actions**):

| Где | Имя | Значение |
|---|---|---|
| Variables | `AI_PROVIDER` | `openai`, `anthropic` или `webhook` |
| Variables | `AI_BASE_URL` | адрес API, прокси или вебхука |
| Variables | `AI_MODEL` | имя модели |
| Variables | `AI_LABEL` | подпись в интерфейсе |
| Secrets | `AI_API_KEY` | ключ (в git не попадает) |

Два важных ограничения статического сайта:

1. **Ключ, подставленный в сборку, виден любому посетителю** в JavaScript сайта. Это приемлемо только
   для тестового ключа с лимитами. Боевой ключ держите на прокси (вариант ниже), тогда `AI_API_KEY`
   на GitHub не нужен вовсе.
2. **API должен разрешать запросы из браузера (CORS)**: отвечать на preflight-запрос `OPTIONS` без
   авторизации и с заголовком `Access-Control-Allow-Origin`. Если сервер модели этого не делает,
   браузер заблокирует вызов, и единственный путь — прокси.

**Рекомендуемая схема с Cloudflare Worker** (бесплатный тариф, ключ не покидает Cloudflare):

```bash
npm i -g wrangler && wrangler login
cd worker
# BASE_URL / MODEL / ALLOWED_ORIGINS уже заполнены в wrangler.toml — поправьте под себя
wrangler secret put PROVIDER_KEY    # ключ вашей модели
wrangler secret put ACCESS_TOKEN    # любой случайный токен, чтобы прокси не был открыт для всех
wrangler deploy                     # выведет адрес вида https://invest-ai-proxy.<account>.workers.dev
```

Затем в GitHub: Variables `AI_PROVIDER=webhook`, `AI_BASE_URL=<адрес воркера>`, Secret
`AI_API_KEY=<ACCESS_TOKEN>` и любой пуш в `main` (или Re-run workflow) опубликует сайт с подключённой
моделью. Вместо воркера подойдёт n8n-вебхук с тем же контрактом.

### Как ассистент меняет модель

Ассистент получает схему полей, текущие данные и результаты, а в ответе может добавить блок

```json
{"actions":[{"op":"set","path":"general.discountRate","value":18,"why":"WACC по CAPM"},
            {"op":"scale","path":"effect.revenue","value":-0.1}]}
```

Сервис показывает предложенные изменения, применяет их по кнопке (или автоматически в режиме
«автопилот») и пересчитывает модель. Поддерживаются `set`, `scale`, `shift`, `add_item`, `remove_item`.

## Структура проекта

```
index.html                 — оболочка приложения (CDN: Chart.js, SheetJS, docx)
src/engine/finance.js      — NPV, IRR, MIRR, PI, окупаемость, аннуитет, кредиты, амортизация, CAPM, WACC
src/engine/project.js      — универсальная модель CapEx/Financing/Effect/CF
src/engine/analysis.js     — чувствительность, торнадо, пороги, сценарии, Монте-Карло
src/templates/*.js         — библиотека шаблонов (схема полей, примеры, расчёт, выводы)
src/ui/*.js, styles.css    — формы, результаты, графики, вкладки анализа
src/export/*.js            — xlsx (с формулами), csv, docx, импорт xlsx/csv
src/ai/*.js                — провайдеры LLM, системный промпт, протокол actions, офлайн-эксперт
worker/                    — Cloudflare Worker-прокси для ключей ИИ
docs/                      — методика, пример n8n-workflow
tests/                     — юнит-тесты и e2e
```

### Как добавить свой шаблон

Создайте объект в `src/templates/` по образцу `breakevenTemplate`: `id`, `category`, `title`,
`levels`, `schema` (группы и поля: `number | percent | int | text | select | bool | series | items`),
`samples`, `compute(inputs) → { kpis, tables, charts, conclusion, metric }`, при необходимости
`drivers`/`metrics` для анализа чувствительности. Зарегистрируйте в `src/templates/index.js` —
формы, результаты, анализ, экспорт и ИИ-контекст подключатся автоматически.

## Ограничения и допущения

* Все расчёты в одной валюте, без НДС; инфляция учитывается через выбор номинальной/реальной ставки.
* Налог на прибыль считается от положительной базы (с опцией переноса убытков), без региональных льгот.
* Лизинг моделируется упрощённо (аннуитетный платёж по ставке удорожания, аванс списывается сразу).
* ИИ-ответы — рекомендации, а не замена экспертизы; числа всегда пересчитываются движком сервиса.

Лицензия MIT.
