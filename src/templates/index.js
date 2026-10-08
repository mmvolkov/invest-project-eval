/**
 * Реестр шаблонов. Категории повторяют структуру каталога
 * «Финансовые Excel-модели: примеры, образцы и шаблоны» (Система Финансовый директор):
 * Бюджеты · Отчёты · Инвестиции · Анализ.
 */
import { projectTemplate, expressTemplate } from './project.js';
import { waccTemplate, loanTemplate, leasingTemplate, compareTemplate } from './invest_tools.js';
import { breakevenTemplate, factorTemplate, planfactTemplate, ratiosTemplate, budgetTemplate, valuationTemplate } from './analysis_tools.js';

export const CATEGORIES = [
  { id: 'invest', title: 'Инвестиции', icon: '📈', description: 'Расчёт и анализ инвестиционных показателей' },
  { id: 'analysis', title: 'Анализ', icon: '🔍', description: 'План-факт, факторный анализ, прибыль' },
  { id: 'budget', title: 'Бюджеты', icon: '📒', description: 'БДР, БДДС, прогнозный баланс' },
  { id: 'reports', title: 'Отчёты', icon: '📊', description: 'Оценка бизнеса и контроль показателей' },
];

export const LEVELS = [
  { id: 'express', title: 'Экспресс', rank: 0, description: 'Несколько чисел — ответ за минуту' },
  { id: 'basic', title: 'Базовая', rank: 1, description: 'Ряды по периодам, инвестиции, затраты' },
  { id: 'pro', title: 'Расширенная', rank: 2, description: 'Кредиты, оборотный капитал, терминальная стоимость, Монте-Карло' },
];

export const TEMPLATES = [expressTemplate, projectTemplate, compareTemplate, waccTemplate, loanTemplate, leasingTemplate, breakevenTemplate, factorTemplate, planfactTemplate, budgetTemplate, valuationTemplate, ratiosTemplate];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

export function levelRank(id) {
  const l = LEVELS.find((x) => x.id === id);
  return l ? l.rank : 1;
}
