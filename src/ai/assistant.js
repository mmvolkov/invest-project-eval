/**
 * ИИ-ассистент: формирует контекст (схема шаблона, входные данные, результаты, методика),
 * вызывает провайдера и разбирает предложенные действия над моделью.
 *
 * Протокол действий: ассистент добавляет в ответ блок
 * ```json
 * {"actions":[{"op":"set","path":"general.discountRate","value":18,"why":"…"},
 *             {"op":"scale","path":"effect.revenue","value":-0.1},
 *             {"op":"add_item","path":"financing.loans","value":{...}},
 *             {"op":"remove_item","path":"capex.items","index":1}]}
 * ```
 */
import { chat } from './providers.js';
import { flattenFields } from '../ui/forms.js';
import { getPath, setPath, deepClone, applyDriver } from '../engine/utils.js';
import { fmt } from '../ui/format.js';

export function buildSystemPrompt(template, inputs, result, levelId) {
  const fields = flattenFields(template)
    .map((f) => {
      let t = f.type;
      if (f.type === 'items') t = `items[${f.itemFields.map((c) => `${c.key}:${c.type}${c.options ? '(' + c.options.map((o) => o.value).join('|') + ')' : ''}`).join(', ')}]`;
      if (f.type === 'series') t = 'series (массив чисел по периодам; в проекте индекс 0 = момент старта t0)';
      if (f.type === 'select') t = `select(${f.options.map((o) => o.value).join('|')})`;
      if (f.type === 'percent') t = 'percent (число в %, напр. 15 = 15 %)';
      return `- ${f.key} — ${f.label} [${t}]${f.help ? ' — ' + f.help : ''}`;
    })
    .join('\n');
  const kpis = result.kpis.map((k) => `- ${k.label}: ${fmt(k.value, k.fmt)}${k.good === false ? ' (ниже нормы)' : ''}`).join('\n');
  return `Ты — финансовый аналитик-эксперт по оценке инвестиционных проектов и финансовому моделированию (методика: NPV, IRR, MIRR, PI, PP/DPP, потребность в финансировании, WACC/CAPM, анализ чувствительности, сценарии, Монте-Карло; российская практика, «Методические рекомендации по оценке эффективности инвестиционных проектов»). Отвечай по-русски, кратко и по делу, с цифрами. Пользователь работает в онлайн-сервисе с шаблоном «${template.title}» (уровень «${levelId}»).

Описание шаблона: ${template.description}

Поля модели (путь — название [тип]):
${fields}

Текущие входные данные (JSON):
${JSON.stringify(inputs)}

Текущие результаты:
${kpis}

Алгоритмическое заключение сервиса:
${result.conclusion.map((l) => '- ' + l).join('\n')}

Ты можешь предлагать изменения модели. Для этого в КОНЦЕ ответа добавь ровно один блок:
\`\`\`json
{"actions":[{"op":"set","path":"<путь поля>","value":<значение>,"why":"<причина>"}]}
\`\`\`
Допустимые op: "set" (установить значение; для series передай полный массив), "scale" (умножить число или весь ряд на (1+value), value в долях), "shift" (прибавить value), "add_item" (добавить объект в список items), "remove_item" (удалить элемент списка по index). Пути — только из списка полей выше. Не добавляй блок, если изменений не предлагаешь. Если данных не хватает — задай уточняющий вопрос. Не выдумывай результаты расчёта: после применения действий сервис пересчитает модель сам.`;
}

export const QUICK_PROMPTS = [
  { label: 'Проверь допущения', text: 'Проверь реалистичность исходных допущений модели для российского рынка: выручка и её рост, структура затрат, ставка дисконтирования, инвестиции, срок службы, оборотный капитал. Укажи, что выглядит сомнительным и почему, предложи исправления в формате actions.' },
  { label: 'Сделай заключение', text: 'Напиши экспертное заключение об эффективности проекта для инвестиционного комитета: 5–8 абзацев, с ключевыми показателями, рисками, чувствительностью и рекомендацией (принять / доработать / отклонить).' },
  { label: 'Подбери ставку', text: 'Предложи обоснованную ставку дисконтирования для этого проекта (по WACC/CAPM с учётом текущих ставок ОФЗ, премии за риск, отрасли и размера бизнеса). Объясни расчёт и примени через actions.' },
  { label: 'Сделай пессимистичный вариант', text: 'Сформируй пессимистичный набор допущений (падение выручки, рост затрат и CapEx, задержка запуска) и примени его к модели через actions, объяснив логику каждого изменения.' },
  { label: 'Как улучшить NPV?', text: 'Предложи 5 конкретных управленческих мер, повышающих NPV/IRR проекта, с оценкой эффекта каждой. Самую реалистичную примени через actions.' },
];

export function parseActions(text) {
  const m = String(text).match(/```json\s*([\s\S]*?)```/i);
  let json = null;
  if (m) json = m[1];
  else {
    const i = text.indexOf('{"actions"');
    if (i >= 0) {
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '{') depth++;
        if (text[j] === '}') depth--;
        if (depth === 0) {
          json = text.slice(i, j + 1);
          break;
        }
      }
    }
  }
  if (!json) return { message: text, actions: [] };
  try {
    const obj = JSON.parse(json);
    const actions = Array.isArray(obj.actions) ? obj.actions : [];
    const message = m ? text.replace(m[0], '').trim() : text.replace(json, '').trim();
    return { message, actions };
  } catch (e) {
    return { message: text, actions: [], parseError: e.message };
  }
}

/** Применяет действия к копии входных данных. Возвращает { inputs, log } */
export function applyActions(template, inputs, actions) {
  let out = deepClone(inputs);
  const allowed = new Set(flattenFields(template).map((f) => f.key));
  const log = [];
  for (const a of actions) {
    const path = String(a.path || '');
    const root = path.split('.').slice(0, 2).join('.');
    const ok = allowed.has(path) || allowed.has(root) || [...allowed].some((k) => path.startsWith(k + '.') || k.startsWith(path + '.'));
    if (!ok) {
      log.push(`✗ ${path}: неизвестное поле, пропущено`);
      continue;
    }
    try {
      if (a.op === 'set') {
        setPath(out, path, a.value);
        log.push(`✓ ${path} = ${JSON.stringify(a.value).slice(0, 80)}${a.why ? ' — ' + a.why : ''}`);
      } else if (a.op === 'scale' || a.op === 'shift') {
        out = applyDriver(out, { path, mode: a.op, itemKey: a.itemKey }, Number(a.value) || 0);
        log.push(`✓ ${path} ${a.op === 'scale' ? '×' + (1 + Number(a.value)).toFixed(3) : '+' + a.value}${a.why ? ' — ' + a.why : ''}`);
      } else if (a.op === 'add_item') {
        const arr = getPath(out, path);
        if (Array.isArray(arr)) {
          arr.push(a.value || {});
          log.push(`✓ ${path}: добавлен элемент${a.why ? ' — ' + a.why : ''}`);
        }
      } else if (a.op === 'remove_item') {
        const arr = getPath(out, path);
        if (Array.isArray(arr) && a.index >= 0 && a.index < arr.length) {
          arr.splice(a.index, 1);
          log.push(`✓ ${path}: удалён элемент ${a.index}`);
        }
      } else log.push(`✗ ${a.op}: неизвестная операция`);
    } catch (e) {
      log.push(`✗ ${path}: ${e.message}`);
    }
  }
  return { inputs: out, log };
}

export async function askAssistant({ template, inputs, result, levelId, history, userText, settings, signal }) {
  const system = buildSystemPrompt(template, inputs, result, levelId);
  const messages = [...history.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userText }];
  const { text } = await chat({ system, messages, context: { templateId: template.id, inputs, kpis: result.kpis }, settings, signal });
  return parseActions(text);
}
