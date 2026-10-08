import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActions, applyActions } from '../src/ai/assistant.js';
import { projectTemplate } from '../src/templates/project.js';
import { deepClone } from '../src/engine/utils.js';

const base = deepClone(projectTemplate.samples.find((s) => s.id === 'leveraged').inputs);

test('parseActions: извлекает блок actions из ответа и возвращает текст без него', () => {
  const text = 'Предлагаю снизить ставку.\n```json\n{"actions":[{"op":"set","path":"general.discountRate","value":14}]}\n```';
  const { message, actions } = parseActions(text);
  assert.equal(actions.length, 1);
  assert.ok(!message.includes('actions'));
});

test('applyActions: set/scale/shift, индексы в обеих нотациях, add/remove item', () => {
  const { inputs, log } = applyActions(projectTemplate, base, [
    { op: 'set', path: 'general.discountRate', value: 14 },
    { op: 'scale', path: 'effect.revenue', value: -0.1 },
    { op: 'scale', path: 'capex.items[0].amount', value: 0.15 },
    { op: 'set', path: 'financing.loans.0.rate', value: 19 },
    { op: 'shift', path: 'general.taxRate', value: 5 },
    { op: 'add_item', path: 'capex.items', value: { name: 'Новый', amount: 10, period: 1, life: 5 } },
    { op: 'remove_item', path: 'financing.loans', index: 0 },
    { op: 'set', path: 'hacker.field', value: 1 },
  ]);
  assert.equal(inputs.general.discountRate, 14);
  assert.ok(Math.abs(inputs.effect.revenue[1] - base.effect.revenue[1] * 0.9) < 1e-9);
  assert.ok(Math.abs(inputs.capex.items[0].amount - base.capex.items[0].amount * 1.15) < 1e-9);
  assert.equal(inputs.general.taxRate, base.general.taxRate + 5);
  assert.equal(inputs.capex.items.length, base.capex.items.length + 1);
  assert.equal(inputs.financing.loans.length, base.financing.loans.length - 1);
  assert.equal(inputs.hacker, undefined);
  assert.ok(log.some((l) => l.includes('hacker.field') && l.startsWith('✗')));
  assert.ok(log.filter((l) => l.startsWith('✓')).length === 7, log.join('\n'));
  // исходные данные не мутируются
  assert.equal(base.general.discountRate, 16);
});
