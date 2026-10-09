/**
 * Сборка презентации сервиса (pptx) для рассылки — читается без спикера.
 * Запуск: PPTX_MODULES=<папка с node_modules, где есть pptxgenjs и qrcode> SHOTS=<папка скриншотов> node scripts/build-presentation.mjs
 * Выход: docs/Презентация_сервиса.pptx
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modDir = process.env.PPTX_MODULES || root;
const require = createRequire(path.join(modDir, 'package.json'));
const pptxgen = require('pptxgenjs');
const QRCode = require('qrcode');
const { applyTheme } = require(path.join(root, "scripts/pptx-apply-theme.cjs"));

const SHOTS = process.env.SHOTS || path.join(root, 'docs/img');
const IMG = path.join(root, 'docs/img');
const SITE = 'https://scout-argument.ru/invest-project-eval/';
const OUT = path.join(root, 'docs/Презентация_сервиса.pptx');

const THEME = {
  name: 'InvestEval',
  headFontFace: 'Calibri',
  bodyFontFace: 'Calibri',
  colors: { dk1: '16202C', lt1: 'FFFFFF', dk2: '51606F', lt2: 'EEF2F8', accent1: '1F6FEB', accent2: '6A4CFF', accent3: '1A7F4B', accent4: 'F2994A', accent5: 'C0392B', accent6: 'B7791F', hlink: '1F6FEB', folHlink: '6A4CFF' },
};
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'Оценка инвестпроектов — презентация сервиса';
pres.author = 'invest-project-eval';
const C = pres.SchemeColor;
const W = 13.333;
const H = 7.5;
const M = 0.6; // поля

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
/** Вписывает картинку в прямоугольник, центрируя */
function fitImage(slide, file, x, y, maxW, maxH, opts = {}) {
  const { w, h } = pngSize(file);
  let iw = maxW;
  let ih = (h / w) * iw;
  if (ih > maxH) {
    ih = maxH;
    iw = (w / h) * ih;
  }
  const ix = x + (maxW - iw) / 2;
  const iy = opts.top ? y : y + (maxH - ih) / 2;
  slide.addImage({ path: file, x: ix, y: iy, w: iw, h: ih, rounding: !!opts.rounding, shadow: opts.shadow ? { type: 'outer', color: '000000', blur: 6, offset: 2, angle: 45, opacity: 0.18 } : undefined, objectName: opts.name || path.basename(file) });
  return { x: ix, y: iy, w: iw, h: ih };
}

// ---------- Макеты ----------
pres.defineSlideMaster({
  title: 'TITLE',
  background: { color: THEME.colors.dk1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.2, w: W - 2 * M, h: 1.6, fontSize: 44, bold: true, color: C.background1, align: 'left', valign: 'bottom', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 3.95, w: W - 2 * M, h: 1.2, fontSize: 20, color: 'CADCFC', align: 'left', valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: THEME.colors.lt1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.45, w: W - 2 * M, h: 1.0, fontSize: 28, bold: true, color: C.text1, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
    { text: { text: SITE, options: { x: M, y: H - 0.45, w: 7, h: 0.3, fontSize: 10, color: THEME.colors.dk2, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: H - 0.45, w: 0.6, h: 0.3, fontSize: 10, color: THEME.colors.dk2, align: 'right' },
});
pres.defineSlideMaster({
  title: 'DARK',
  background: { color: THEME.colors.dk1 },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.45, w: W - 2 * M, h: 1.0, fontSize: 28, bold: true, color: C.background1, align: 'left', valign: 'middle', margin: 0 }, text: '' } }],
  slideNumber: { x: W - M - 0.6, y: H - 0.45, w: 0.6, h: 0.3, fontSize: 10, color: '8A96A3', align: 'right' },
});

// ---------- Помощники ----------
const T = (slide, text, o) => slide.addText(text, { isTextBox: true, margin: 0, fontSize: 15, color: C.text1, valign: 'top', ...o });
const lead = (slide, text, y = 1.5, h = 0.8) => T(slide, text, { x: M, y, w: W - 2 * M, h, fontSize: 16, color: C.text2 });
function card(slide, x, y, w, h, { title, text, fill = 'EEF2F8', titleColor = C.accent1, num, numColor = C.accent1, titleSize = 16, textSize = 13, name }) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.12, objectName: name ? name + ' фон' : undefined });
  let tx = x + 0.25;
  if (num !== undefined) {
    slide.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: y + 0.25, w: 0.5, h: 0.5, fill: { color: numColor }, line: { color: numColor }, objectName: name ? name + ' номер' : undefined });
    T(slide, String(num), { x: x + 0.25, y: y + 0.25, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tx = x + 0.9;
  }
  T(slide, title, { x: tx, y: y + 0.22, w: w - (tx - x) - 0.25, h: 0.55, fontSize: titleSize, bold: true, color: titleColor, valign: 'middle' });
  T(slide, text, { x: x + 0.25, y: y + 0.85, w: w - 0.5, h: h - 1.0, fontSize: textSize, color: C.text1 });
}
function bullets(slide, items, o) {
  slide.addText(
    items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: 6 } })),
    { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: 'top', ...o }
  );
}
function caption(slide, text, x, y, w) {
  T(slide, text, { x, y, w, h: 0.3, fontSize: 10, italic: true, color: C.text2, align: 'center' });
}

// ---------- Слайды ----------
pres.addSection({ title: 'Проблема' });
// 1. Титул
{
  const s = pres.addSlide({ masterName: 'TITLE', sectionTitle: 'Проблема' });
  s.addText('Оценка инвестпроектов', { placeholder: 'title' });
  s.addText('Онлайн-сервис, который за минуту отвечает «окупится или нет», а при необходимости разворачивается в полную финансовую модель для банка и инвесткомитета.', { placeholder: 'body' });
  s.addShape(pres.ShapeType.roundRect, { x: W - M - 3.9, y: 0.7, w: 3.9, h: 0.6, fill: { color: '1F2A3C' }, line: { color: '1F2A3C' }, rectRadius: 0.1 });
  T(s, 'Бесплатно · без регистрации · в браузере', { x: W - M - 3.75, y: 0.7, w: 3.6, h: 0.6, fontSize: 12, color: 'CADCFC', valign: 'middle', align: 'center' });
  T(s, SITE, { x: M, y: 5.6, w: 8, h: 0.4, fontSize: 16, color: '4C8DFF' });
  T(s, 'Презентация для знакомства с сервисом · ' + new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), { x: M, y: 6.1, w: 8, h: 0.4, fontSize: 12, color: '8A96A3' });
  s.addNotes('Титульный слайд. Деск предназначен для самостоятельного чтения.');
}
// 2. Знакомая ситуация
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проблема' });
  s.addText('Решение о вложении денег всё ещё принимают «на глаз» или через Excel на неделю', { placeholder: 'title' });
  lead(s, 'Три ситуации, которые повторяются в любой компании, где есть что вкладывать.');
  const cw = (W - 2 * M - 0.6) / 3;
  const items = [
    ['Собственник', '«У меня две идеи: открыть вторую точку или купить линию. Считаю в голове, партнёр считает по-своему. Спорим неделю, цифр нет».'],
    ['Финансовый директор', '«Банк просит модель с графиком кредита и DSCR. Собираю Excel на 20 листов, в формуле ошибка на третий день, защищать страшно».'],
    ['Руководитель проекта', '«Бюджет защитил, а на вопрос «что будет, если выручка упадёт на 15 %» ответить нечем. Монте-Карло звучит как магия».'],
  ];
  items.forEach(([t, x], i) => card(s, M + i * (cw + 0.3), 2.6, cw, 3.1, { title: t, text: x, fill: i === 0 ? 'E8F0FE' : i === 1 ? 'EEF2F8' : 'FFF4DC', titleColor: i === 2 ? C.accent6 : C.accent1, textSize: 15 }));
  T(s, 'Общее у всех троих: нужен быстрый и обоснованный ответ, а инструмент либо слишком простой, либо слишком тяжёлый.', { x: M, y: 6.1, w: W - 2 * M, h: 0.5, fontSize: 14, bold: true, color: C.accent1 });
}
// 3. Цена ошибки
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проблема' });
  s.addText('Во что обходится оценка «на глаз» и модель, собранная в спешке', { placeholder: 'title' });
  const cw = (W - 2 * M - 0.6) / 3;
  const items = [
    ['Неделя', 'работы финансиста на одну модель', 'Каждый новый вариант проекта означает ещё несколько дней правок. Идеи, которые «не дошли до Excel», так и остаются непосчитанными.'],
    ['Отказ', 'банка или инвестора', 'Типичная причина: покрытие долга (DSCR) ниже норматива 1,2 или нет анализа чувствительности. Узнать об этом лучше до подачи заявки, а не после.'],
    ['Ошибка', 'в формуле, которую никто не заметил', 'Ссылка на не ту ячейку, забытая амортизация, налог с убытка. Решение принято по неверной цифре, и проверить это постфактум почти невозможно.'],
  ];
  items.forEach(([big, sub, txt], i) => {
    const x = M + i * (cw + 0.3);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.7, w: cw, h: 4.0, fill: { color: 'EEF2F8' }, line: { color: 'EEF2F8' }, rectRadius: 0.12 });
    T(s, big, { x: x + 0.3, y: 1.95, w: cw - 0.6, h: 0.9, fontSize: 40, bold: true, color: i === 1 ? C.accent5 : C.accent1 });
    T(s, sub, { x: x + 0.3, y: 2.85, w: cw - 0.6, h: 0.6, fontSize: 15, bold: true, color: C.text1 });
    T(s, txt, { x: x + 0.3, y: 3.6, w: cw - 0.6, h: 1.9, fontSize: 15, color: C.text1 });
  });
  T(s, 'Цена ошибки растёт вместе с суммой вложений, а время на принятие решения, наоборот, сокращается.', { x: M, y: 6.1, w: W - 2 * M, h: 0.5, fontSize: 14, bold: true, color: C.accent1 });
}
// 4. Почему текущие инструменты не решают
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проблема' });
  s.addText('Существующие инструменты закрывают либо скорость, либо глубину, но не обе задачи сразу', { placeholder: 'title' });
  const hdr = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: THEME.colors.dk1 }, fontSize: 13, align: 'center', valign: 'middle' } });
  const first = (t) => ({ text: t, options: { bold: true, fontSize: 13, fill: { color: 'EEF2F8' } } });
  const ok = (t) => ({ text: t, options: { fontSize: 13, color: THEME.colors.accent3, align: 'center' } });
  const bad = (t) => ({ text: t, options: { fontSize: 13, color: THEME.colors.accent5, align: 'center' } });
  const mid = (t) => ({ text: t, options: { fontSize: 13, color: THEME.colors.accent6, align: 'center' } });
  const rows = [
    [hdr('Критерий'), hdr('Excel-шаблон из интернета'), hdr('Финансовый консультант'), hdr('Онлайн-калькулятор NPV'), hdr('Наш сервис')],
    [first('Время до первого ответа'), mid('часы — дни'), bad('дни — недели'), ok('минуты'), ok('минута')],
    [first('Глубина: кредиты, амортизация, налоги, оборотный капитал'), mid('зависит от шаблона'), ok('полная'), bad('нет'), ok('полная, по уровням')],
    [first('Проверка рисков: что если, сценарии, Монте-Карло'), bad('редко'), mid('по запросу, дорого'), bad('нет'), ok('встроена')],
    [first('Риск ошибки в формулах'), bad('высокий'), mid('зависит от исполнителя'), mid('низкий, но мало считает'), ok('ядро покрыто тестами')],
    [first('Понятно нефинансисту'), bad('нет'), mid('после объяснения'), ok('да'), ok('да, с заключением словами')],
    [first('Готовый отчёт для банка или комитета'), bad('вручную'), ok('да'), bad('нет'), ok('Excel с формулами и Word')],
    [first('Стоимость'), ok('бесплатно'), bad('от десятков тысяч ₽'), ok('бесплатно'), ok('бесплатно')],
  ];
  s.addTable(rows, { x: M, y: 1.75, w: W - 2 * M, colW: [3.3, 2.2, 2.2, 2.2, 2.23], rowH: 0.52, border: { type: 'solid', color: 'DDE3EC', pt: 0.75 }, fontFace: 'Calibri', valign: 'middle', margin: 0.06, objectName: 'Сравнение инструментов' });
  T(s, 'Сервис объединяет скорость калькулятора и глубину консультантской модели, оставаясь бесплатным и понятным.', { x: M, y: 6.3, w: W - 2 * M, h: 0.5, fontSize: 14, bold: true, color: C.accent1 });
}

pres.addSection({ title: 'Решение' });
// 5. Решение
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Решение: онлайн-сервис, который растёт вместе с задачей — от экспресс-оценки до модели для банка', { placeholder: 'title' });
  const img = fitImage(s, path.join(SHOTS, 'home.png'), M, 1.55, 7.4, 4.9, { shadow: true, name: 'Главная страница сервиса' });
  caption(s, 'Главная страница: каталог шаблонов, уровни, быстрый старт', img.x, img.y + img.h + 0.05, img.w);
  const bx = M + 7.7;
  const bw = W - M - bx;
  bullets(s, [
    'Открывается в браузере, ничего устанавливать не нужно. Работает на компьютере и телефоне.',
    'Начало с семи чисел: инвестиции, выручка, рост, затраты, срок, ставка, налог. Ответ сразу.',
    'Та же модель углубляется по кнопке: кредиты, амортизация, оборотный капитал, стоимость бизнеса в конце.',
    'Риски проверяются встроенными методами: что если, торнадо, сценарии, Монте-Карло.',
    'На выходе Excel с живыми формулами и отчёт Word с графиками и заключением.',
    'ИИ-ассистент проверяет допущения, объясняет результат и сам меняет модель по вашей просьбе.',
  ], { x: bx, y: 1.6, w: bw, h: 5.0, fontSize: 14 });
}
// 6. Пять шагов
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Путь пользователя занимает пять шагов и укладывается в десять минут', { placeholder: 'title' });
  const img = fitImage(s, path.join(IMG, 'b1-how-it-works.png'), M, 1.55, W - 2 * M, 1.4, { name: 'Схема пяти шагов' });
  const steps = [
    ['Выбрать шаблон', 'Каталог слева. Для первого раза подходит «Экспресс-оценка проекта».', '10 секунд'],
    ['Ввести цифры', 'Свои или готовый пример. Ряды по годам заполняются формулой «база + рост» или вставкой из Excel.', '1–10 минут'],
    ['Увидеть результат', 'Показатели пересчитываются при каждом изменении. Зелёная карточка хорошо, красная проблема.', 'сразу'],
    ['Проверить риски', 'Вкладки «Чувствительность», «Сценарии», «Монте-Карло» показывают запас прочности.', '2–5 минут'],
    ['Забрать отчёт', 'Excel, Word, CSV или JSON. Вопросы ассистенту и заключение в отчёт.', '1 минута'],
  ];
  const cw = (W - 2 * M - 4 * 0.25) / 5;
  steps.forEach(([t, d, tm], i) => {
    const x = M + i * (cw + 0.25);
    card(s, x, img.y + img.h + 0.35, cw, 3.1, { title: t, text: d, num: i + 1, titleSize: 14, textSize: 12, numColor: i === 2 ? C.accent3 : i === 3 ? C.accent6 : i === 4 ? C.accent2 : C.accent1 });
    T(s, tm, { x: x + 0.25, y: img.y + img.h + 0.35 + 2.65, w: cw - 0.5, h: 0.35, fontSize: 12, bold: true, color: C.accent1 });
  });
}
// 7. Три уровня
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Три уровня глубины: одна модель, которую можно углублять, не начиная заново', { placeholder: 'title' });
  lead(s, 'Переключатель в шапке сайта открывает дополнительные поля той же модели. Введённые данные сохраняются при переходе между уровнями.', 1.4, 0.6);
  const img = fitImage(s, path.join(IMG, 'b2-levels.png'), M, 2.05, W - 2 * M, 2.1, { name: 'Схема трёх уровней' });
  const cw = (W - 2 * M - 0.6) / 3;
  const lv = [
    ['Экспресс', 'Семь чисел. Ответ: NPV, IRR, индекс рентабельности, окупаемость, потребность в деньгах.', 'Отбор идей, разговор с партнёром, первая прикидка', 'E4F5EA', C.accent3],
    ['Базовая', 'Ряды по периодам, объекты инвестиций со сроком службы и амортизацией, налог. Полные расчётные листы и графики.', 'Бизнес-план, защита бюджета, внутренний инвесткомитет', 'E8F0FE', C.accent1],
    ['Расширенная', 'Кредиты и покрытие долга (DSCR), оборотный капитал, ликвидационная и терминальная стоимость, перенос убытков, FCFE, Монте-Карло.', 'Заявка в банк, внешний инвестор, сделка', 'F1E6FB', C.accent2],
  ];
  lv.forEach(([t, d, who, fill, col], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 4.35, cw, 2.55, { title: t, text: d, fill, titleColor: col, textSize: 13 });
    T(s, 'Когда достаточно: ' + who, { x: x + 0.25, y: 4.35 + 1.95, w: cw - 0.5, h: 0.55, fontSize: 12, italic: true, color: C.text2 });
  });
}
// 8. Что внутри
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Внутри — та же структура, что у профессиональной Excel-модели, но собирает её сервис', { placeholder: 'title' });
  const img = fitImage(s, path.join(IMG, 'b3-model.png'), M, 1.5, 7.2, 3.0, { name: 'Схема структуры модели' });
  caption(s, 'Листы CapEx, Financing, Effect заполняете вы; CF и показатели считает сервис', img.x, img.y + img.h + 0.02, img.w);
  const k = fitImage(s, path.join(SHOTS, 'kpis.png'), M, 4.75, 7.2, 2.1, { shadow: true, name: 'Карточки показателей' });
  const bx = M + 7.6;
  const bw = W - M - bx;
  T(s, 'Показатели простыми словами', { x: bx, y: 1.5, w: bw, h: 0.4, fontSize: 16, bold: true, color: C.accent1 });
  const kp = [
    ['NPV', 'сколько проект заработает сверх требуемой доходности, в сегодняшних деньгах. Хорошо, когда больше нуля.'],
    ['IRR', 'доходность проекта в процентах годовых. Сравнивайте со ставкой по кредиту или депозиту.'],
    ['Срок окупаемости', 'через сколько лет вложения вернутся: простой и с учётом стоимости денег во времени.'],
    ['Потребность в деньгах', 'максимум, который придётся вложить, пока проект не начнёт кормить себя сам.'],
    ['DSCR', 'во сколько раз поток покрывает платежи по кредиту. Банки хотят не меньше 1,2.'],
  ];
  s.addText(
    kp.flatMap(([a, b], i) => [{ text: a + ' — ', options: { bold: true, color: THEME.colors.dk1 } }, { text: b, options: { breakLine: i < kp.length - 1, paraSpaceAfter: 7 } }]),
    { isTextBox: true, margin: 0, x: bx, y: 1.95, w: bw, h: 4.9, fontSize: 13, color: C.text1, valign: 'top' }
  );
}
// 9. Риски
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Проверка на прочность: сервис показывает, где граница безопасности и за чем следить', { placeholder: 'title' });
  const img = fitImage(s, path.join(IMG, 'b4-risks.png'), M, 1.5, 5.4, 2.1, { name: 'Схема методов анализа рисков' });
  const mc = fitImage(s, path.join(SHOTS, 'montecarlo.png'), M, 3.75, 5.4, 3.05, { shadow: true, name: 'Результат Монте-Карло' });
  caption(s, 'Монте-Карло: распределение NPV и вероятность убытка', mc.x, mc.y + mc.h + 0.02, mc.w);
  const bx = M + 5.8;
  const bw = W - M - bx;
  const rows = [
    ['«Что если» и торнадо', 'Каждый фактор меняется по очереди. Видно, что бьёт сильнее: цена, объём, инвестиции или ставка.'],
    ['Пороговые значения', 'На сколько процентов можно ошибиться в выручке или затратах, прежде чем проект уйдёт в минус.'],
    ['Сценарии', 'Базовый, пессимистичный, оптимистичный с вероятностями. Итог: ожидаемое значение NPV.'],
    ['Монте-Карло', 'Тысячи случайных пересчётов. Результат: вероятность убытка и диапазон, в который попадёт NPV с вероятностью 80 %.'],
  ];
  rows.forEach(([t, d], i) => card(s, bx, 1.5 + i * 1.33, bw, 1.2, { title: t, text: d, titleSize: 14, textSize: 12, fill: i % 2 ? 'EEF2F8' : 'FFF4DC', titleColor: i % 2 ? C.accent1 : C.accent6 }));
}
// 10. ИИ
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('ИИ-ассистент видит вашу модель, объясняет результат и сам вносит изменения по вашей просьбе', { placeholder: 'title' });
  const img = fitImage(s, path.join(SHOTS, 'ai.png'), M, 1.5, 5.6, 5.3, { shadow: true, top: true, name: 'Диалог с ассистентом' });
  caption(s, 'Ассистент предложил пессимистичный сценарий, изменения применены, модель пересчитана', img.x, img.y + img.h + 0.02, img.w);
  const bx = M + 6.0;
  const bw = W - M - bx;
  bullets(s, [
    'Проверит допущения: «рост выручки 60 % в год выглядит оптимистично, обоснуйте драйверами».',
    'Объяснит, почему IRR ниже ставки или что значит отрицательный NPV без терминальной стоимости.',
    'Подберёт ставку дисконтирования по CAPM и WACC под отрасль и размер бизнеса.',
    'Построит сценарий и изменит модель: вы видите список изменений, нажимаете «Применить», всё пересчитывается.',
    'Напишет заключение для инвесткомитета, которое одной кнопкой попадает в отчёт Word.',
  ], { x: bx, y: 1.55, w: bw, h: 3.6, fontSize: 14 });
  s.addShape(pres.ShapeType.roundRect, { x: bx, y: 5.3, w: bw, h: 1.5, fill: { color: 'F1E6FB' }, line: { color: 'F1E6FB' }, rectRadius: 0.12 });
  T(s, 'Важно: ассистент советует, а считает всегда расчётный движок сервиса. Без подключения к ИИ работает встроенная «Диагностика», а подключить можно любую модель: учебную Qwen, OpenAI, Claude или корпоративный прокси.', { x: bx + 0.25, y: 5.45, w: bw - 0.5, h: 1.25, fontSize: 13, color: C.text1 });
}
// 11. Библиотека
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Не только проекты: 12 готовых инструментов для задач финансовой службы', { placeholder: 'title' });
  const img = fitImage(s, path.join(IMG, 'b5-library.png'), M, 1.5, 6.6, 5.3, { name: 'Схема библиотеки шаблонов' });
  const bx = M + 7.0;
  const bw = W - M - bx;
  const groups = [
    ['Инвестиции', 'экспресс-оценка, универсальная модель, сравнение проектов, WACC, реальная ставка кредита, лизинг или кредит', 'E8F0FE', C.accent1],
    ['Анализ', 'точка безубыточности, факторный анализ прибыли, план-факт бюджета с ABC-ранжированием отклонений', 'FFF4DC', C.accent6],
    ['Бюджеты', 'БДР, БДДС и прогнозный баланс на 12 месяцев с лагами оплаты и проверкой «актив = пассив»', 'E4F5EA', C.accent3],
    ['Отчёты', 'оценка стоимости бизнеса методом DCF, финансовые коэффициенты с нормативами и моделью Дюпон', 'F1E6FB', C.accent2],
  ];
  groups.forEach(([t, d, fill, col], i) => card(s, bx, 1.5 + i * 1.33, bw, 1.2, { title: t, text: d, fill, titleColor: col, titleSize: 14, textSize: 12 }));
}
// 12. Результат
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Решение' });
  s.addText('Результат в руках за минуту: Excel с формулами, отчёт Word, CSV и файл модели', { placeholder: 'title' });
  const ex = fitImage(s, path.join(SHOTS, 'export.png'), M, 1.5, 7.4, 2.4, { shadow: true, name: 'Вкладка экспорта' });
  const ch = fitImage(s, path.join(SHOTS, 'charts.png'), M, ex.y + ex.h + 0.3, 7.4, 2.3, { shadow: true, name: 'Графики модели' });
  caption(s, 'Графики попадают в отчёт Word вместе с таблицами и заключением', ch.x, ch.y + ch.h + 0.02, ch.w);
  const bx = M + 7.8;
  const bw = W - M - bx;
  const items = [
    ['Excel (.xlsx)', 'Все расчётные листы, показатели, чувствительность, сценарии, Монте-Карло. В листе денежных потоков живые формулы: ЧПС, ВСД, PI.'],
    ['Word (.docx)', 'Титул, таблица показателей с оценкой, заключение и риски, графики, расчётные таблицы, исходные данные.'],
    ['CSV и JSON', 'Любая таблица отдельно для BI; вся модель файлом, чтобы открыть позже или передать коллеге.'],
    ['Импорт', 'Ряды по годам вставляются из Excel через буфер или загружаются файлом с автосопоставлением строк.'],
  ];
  items.forEach(([t, d], i) => card(s, bx, 1.5 + i * 1.33, bw, 1.2, { title: t, text: d, titleSize: 14, textSize: 12, fill: i % 2 ? 'EEF2F8' : 'E8F0FE' }));
}

pres.addSection({ title: 'Применение' });
// 13. Сценарии по ролям
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Применение' });
  s.addText('Как это выглядит в работе: четыре роли, четыре задачи', { placeholder: 'title' });
  const cw = (W - 2 * M - 0.3) / 2;
  const ch = 2.5;
  const cases = [
    ['Собственник выбирает между двумя идеями', 'Было: спор с партнёром «по ощущениям». Стало: две экспресс-оценки за пять минут. Первая идея окупается за 2,5 года с IRR 38 %, вторая за 4,8 года с IRR 19 % при ставке 20 %. Решение принято по цифрам.', 'E8F0FE', C.accent1],
    ['Финансовый директор готовит заявку в банк', 'Было: неделя на Excel и страх ошибки. Стало: расширенная модель с кредитом за час. Сервис показал DSCR 0,9 в первый год; отсрочка тела увеличена до двух лет, DSCR 1,3. В банк ушёл Excel с формулами и Word-отчёт.', 'E4F5EA', C.accent3],
    ['Руководитель проекта защищает бюджет', 'Было: нет ответа на «что если». Стало: торнадо показал, что главный риск цена, а не инвестиции: минус 9 % обнуляет NPV. Монте-Карло: вероятность убытка 22 %. Ассистент предложил меры и написал заключение для презентации.', 'FFF4DC', C.accent6],
    ['Экономист ищет причину отклонения прибыли', 'Было: «прибыль упала, непонятно почему». Стало: факторный анализ за две минуты: минус 3,2 млн из-за объёма, плюс 2,1 млн из-за цены, минус 0,9 млн из-за затрат. Водопадная диаграмма ушла в отчёт.', 'F1E6FB', C.accent2],
  ];
  cases.forEach(([t, d, fill, col], i) => card(s, M + (i % 2) * (cw + 0.3), 1.55 + Math.floor(i / 2) * (ch + 0.3), cw, ch, { title: t, text: d, fill, titleColor: col, titleSize: 15, textSize: 13 }));
  T(s, 'Цифры в примерах иллюстративные: они показывают, какие вопросы сервис закрывает и как быстро.', { x: M, y: 7.0 - 0.45, w: W - 2 * M, h: 0.3, fontSize: 10, italic: true, color: C.text2 });
}
// 14. Доверие и безопасность
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Применение' });
  s.addText('Чему можно доверять: методика, проверяемые расчёты и данные, которые остаются у вас', { placeholder: 'title' });
  const cw = (W - 2 * M - 0.3) / 2;
  const items = [
    ['Проверенная методика', 'Структура модели повторяет методику «Как оценить инвестиционный проект» Системы Финансовый директор: листы CapEx, Financing, Effect, CF и анализ эффективности. Показатели общепринятые: NPV, IRR, PI, PP, DPP, WACC.', C.accent1, 'E8F0FE'],
    ['Контрольные примеры воспроизводятся', 'Расчётное ядро покрыто автоматическими тестами на известных примерах из открытых статей: NPV, аннуитет, реальная ставка кредита, окупаемость, сходимость баланса. Любое изменение кода проверяется до публикации.', C.accent3, 'E4F5EA'],
    ['Данные не покидают браузер', 'Сервис статический: без сервера, базы и регистрации. Расчёты, Excel и Word формируются на вашем устройстве. Единственный исходящий запрос к ИИ, и только когда вы пишете ассистенту.', C.accent2, 'F1E6FB'],
    ['Честно об ограничениях', 'НДС, валютные курсы и отраслевые налоговые льготы не моделируются. Лизинг упрощён. Выводы ИИ носят рекомендательный характер и не заменяют экспертизу финансиста.', C.accent6, 'FFF4DC'],
  ];
  items.forEach(([t, d, col, fill], i) => card(s, M + (i % 2) * (cw + 0.3), 1.55 + Math.floor(i / 2) * 2.6, cw, 2.3, { title: t, text: d, fill, titleColor: col, titleSize: 15, textSize: 13 }));
}
// 15. Варианты использования
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Применение' });
  s.addText('Варианты использования: от бесплатной версии на сайте до корпоративного внедрения', { placeholder: 'title' });
  const cw = (W - 2 * M - 0.9) / 4;
  const opts = [
    ['Открытая версия', 'Сайт доступен бесплатно, без регистрации. Все шаблоны, анализ рисков, экспорт и ассистент с учебной моделью.', 'Для себя и команды', C.accent3, 'E4F5EA'],
    ['Встраивание', 'Сервис вставляется на ваш сайт или в Tilda одной строкой. Ссылки ведут сразу на нужный шаблон с вашим примером.', 'Для партнёров и клиентов', C.accent1, 'E8F0FE'],
    ['Корпоративная версия', 'Своя модель ИИ через защищённый прокси, свои шаблоны и примеры под отрасль, фирменный стиль, развёртывание во внутренней сети.', 'Для компаний и банков', C.accent2, 'F1E6FB'],
    ['Обучение и сопровождение', 'Разбор методики на ваших проектах, настройка ставок и допущений, помощь с заявками в банк и защитой перед инвесторами.', 'Для финансовых служб', C.accent6, 'FFF4DC'],
  ];
  opts.forEach(([t, d, who, col, fill], i) => {
    const x = M + i * (cw + 0.3);
    card(s, x, 1.6, cw, 4.2, { title: t, text: d, fill, titleColor: col, titleSize: 15, textSize: 13 });
    T(s, who, { x: x + 0.25, y: 1.6 + 3.55, w: cw - 0.5, h: 0.4, fontSize: 12, bold: true, color: col });
  });
  T(s, 'Условия корпоративной версии и сопровождения обсуждаются индивидуально: напишите нам, и мы предложим вариант под вашу задачу.', { x: M, y: 6.1, w: W - 2 * M, h: 0.6, fontSize: 14, bold: true, color: C.accent1 });
}
// 16. Как начать
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Применение' });
  s.addText('Как начать прямо сейчас: три шага и две минуты', { placeholder: 'title' });
  const steps = [
    ['Откройте сайт', 'Любой браузер, компьютер или телефон. Ничего устанавливать не нужно.'],
    ['Нажмите «Экспресс-оценка за минуту»', 'Выберите пример и замените цифры на свои. Показатели появятся сразу.'],
    ['Скачайте отчёт', 'Вкладка «Отчёт и экспорт»: Excel с формулами или Word для инвесткомитета.'],
  ];
  steps.forEach(([t, d], i) => {
    const y = 1.75 + i * 1.35;
    s.addShape(pres.ShapeType.ellipse, { x: M, y, w: 0.7, h: 0.7, fill: { color: THEME.colors.accent1 }, line: { color: THEME.colors.accent1 } });
    T(s, String(i + 1), { x: M, y, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    T(s, t, { x: M + 0.95, y, w: 6.8, h: 0.4, fontSize: 18, bold: true, color: C.background1 });
    T(s, d, { x: M + 0.95, y: y + 0.42, w: 6.8, h: 0.7, fontSize: 14, color: 'CADCFC' });
  });
  T(s, SITE, { x: M, y: 5.95, w: 7.5, h: 0.45, fontSize: 18, bold: true, color: '4C8DFF' });
  T(s, 'Готовые ссылки: экспресс-оценка #/t/express?sample=cafe · универсальная модель #/t/project?sample=farm · документация и методика в репозитории GitHub', { x: M, y: 6.45, w: 7.8, h: 0.6, fontSize: 11, color: '8A96A3' });
  // QR
  const qrFile = path.join(process.env.TMPDIR || '/tmp', 'ipe-qr.png');
  await QRCode.toFile(qrFile, SITE, { width: 600, margin: 1, color: { dark: '16202C', light: 'FFFFFF' } });
  s.addShape(pres.ShapeType.roundRect, { x: W - M - 3.4, y: 1.6, w: 3.4, h: 4.3, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' }, rectRadius: 0.15 });
  s.addImage({ path: qrFile, x: W - M - 3.1, y: 1.8, w: 2.8, h: 2.8, objectName: 'QR-код сайта' });
  T(s, 'Наведите камеру, чтобы открыть сервис', { x: W - M - 3.2, y: 4.7, w: 3.0, h: 0.5, fontSize: 13, bold: true, color: C.text1, align: 'center' });
  T(s, 'Бесплатно · без регистрации', { x: W - M - 3.2, y: 5.2, w: 3.0, h: 0.4, fontSize: 12, color: C.text2, align: 'center' });
}

await pres.writeFile({ fileName: OUT });
await applyTheme(OUT, THEME);
console.log('written', OUT, fs.statSync(OUT).size, 'bytes');
