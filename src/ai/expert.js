/**
 * Встроенный «эксперт» без LLM: алгоритмическая диагностика допущений и результата,
 * чек-лист и рекомендации. Работает офлайн и служит базой для подсказок ИИ.
 */
import { tornado, switchingValue } from '../engine/analysis.js';
import { fmt } from '../ui/format.js';

export function expertReview(template, inputs, result) {
  const lines = [];
  const warn = [];
  const rec = [];
  const k = result.metric || {};
  const raw = result.raw;
  lines.push(`## Диагностика: ${template.title}`);

  if (template.id === 'project' || template.id === 'express') {
    const g = raw.inputs.general;
    const r = g.discountRate;
    if (r < 8) warn.push(`Ставка дисконтирования ${r} % ниже типичной для РФ (ключевая ставка + премия за риск обычно дают 15–25 %). Проверьте, не занижена ли она.`);
    if (r > 35) warn.push(`Ставка дисконтирования ${r} % очень высокая — такие ставки оправданы только для венчурных проектов.`);
    const rev = raw.series.revenue;
    for (let t = 2; t < rev.length; t++) {
      if (rev[t - 1] > 0 && rev[t] / rev[t - 1] - 1 > 0.5) {
        warn.push(`Рост выручки в периоде ${raw.labels[t]} превышает 50 % — обоснуйте драйверами (мощность, рынок, контракты).`);
        break;
      }
    }
    const margins = raw.series.ebitdaMargin.filter((v) => v != null);
    if (margins.length && Math.max(...margins) > 0.5) warn.push(`Рентабельность по EBITDA достигает ${fmt(Math.max(...margins), 'pct')} — выше большинства отраслей; проверьте полноту затрат (ФОТ, аренда, логистика, маркетинг).`);
    if (margins.length && Math.min(...margins.slice(1)) < 0.05 && k.npv > 0) warn.push('Операционная маржа тонкая (< 5 %) — результат держится на объёме; проверьте чувствительность к переменным затратам.');
    const life = raw.inputs.capex.items.map((i) => i.life);
    if (life.length && Math.max(...life) > raw.N && raw.inputs.capex.liquidation.mode === 'none') rec.push('Срок службы активов превышает горизонт расчёта, а ликвидационная стоимость не учитывается — NPV занижен. Включите учёт остаточной стоимости.');
    if (raw.inputs.effect.wcPctRevenue === 0 && template.id === 'project') rec.push('Оборотный капитал не моделируется. Для торговли и производства задайте 10–25 % от выручки — это существенно влияет на потребность в финансировании.');
    if (k.signChanges > 1) warn.push('Денежный поток меняет знак несколько раз — IRR ненадёжен, используйте NPV и MIRR.');
    if (k.minDscr != null && k.minDscr < 1.2) warn.push(`Минимальный DSCR ${k.minDscr.toFixed(2)} ниже 1.2 — банк, скорее всего, потребует увеличить долю собственных средств или удлинить кредит.`);
    if (k.terminalShare != null && k.terminalShare > 0.5) warn.push(`Терминальная стоимость даёт ${fmt(k.terminalShare, 'pct')} NPV — результат зависит от постпрогнозных допущений сильнее, чем от самого проекта.`);
    if (k.irr != null && k.irr - k.discountRate < 0.03 && k.irr > k.discountRate) warn.push('Запас IRR над ставкой меньше 3 п.п. — проект на грани; небольшое ухудшение допущений делает его неэффективным.');
    if (k.dpp == null) warn.push('Дисконтированная окупаемость не достигается в горизонте — либо удлините горизонт с терминальной стоимостью, либо проект действительно не окупается.');
    // чувствительность
    if (template.drivers && template.drivers.length) {
      const fn = (inp) => template.metric(inp, 'npv');
      const tor = tornado(fn, inputs, template.drivers, 0.1);
      const top = tor.rows.slice(0, 2).map((x) => x.driver.label).join('», «');
      lines.push(`Самые влиятельные факторы: «${top}». На них стоит сосредоточить проверку допущений и управленческие меры.`);
      const svRev = switchingValue(fn, inputs, template.drivers[0]);
      if (svRev != null) lines.push(`Пороговое изменение выручки, при котором NPV = 0: ${(svRev * 100).toFixed(1)} %.`);
    }
    if (k.npv > 0 && warn.length === 0) lines.push('Проект эффективен по всем критериям, критичных замечаний к допущениям нет.');
    if (k.npv <= 0) rec.push('NPV ≤ 0: ищите резервы — снижение CapEx (фазирование, лизинг), рост загрузки, пересмотр цены, сокращение постоянных затрат, более дешёвое финансирование.');
  } else if (template.id === 'wacc') {
    if (k.wacc != null && k.wacc < 0.1) warn.push('WACC ниже 10 % при текущих ставках в РФ выглядит заниженным.');
    rec.push('Используйте полученный WACC как базовую ставку дисконтирования в шаблоне оценки проекта (поле «Ставка дисконтирования»).');
  } else if (template.id === 'breakeven') {
    if (k.safety != null && k.safety < 0.2) warn.push('Запас прочности ниже 20 % — высокая уязвимость к падению спроса.');
  } else if (template.id === 'budget') {
    if (k.minCash < 0) warn.push('В модели есть кассовый разрыв — заложите овердрафт или перенесите платежи.');
  } else if (template.id === 'valuation') {
    rec.push('Проверьте согласованность: FCF прогнозного периода должен быть после налогов и инвестиций, WACC — в тех же ценах (номинальных или реальных), что и потоки.');
  }

  const out = [...lines];
  if (warn.length) out.push('### Предупреждения', ...warn.map((w) => `- ${w}`));
  if (rec.length) out.push('### Рекомендации', ...rec.map((w) => `- ${w}`));
  out.push('### Чек-лист допущений', '- Источники прогноза выручки (рынок, мощность, контракты) задокументированы.', '- Затраты полные: ФОТ с взносами, аренда, логистика, маркетинг, ремонт, налоги.', '- Ставка дисконтирования соответствует риску проекта и структуре капитала (WACC).', '- Инфляция учтена одинаково в потоках и ставке (номинал/реал).', '- Проверена чувствительность к 2–3 ключевым факторам и сценарии.');
  return out.join('\n');
}
