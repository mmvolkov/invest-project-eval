import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../src/templates/index.js';
import { tornado, monteCarlo, scenarios } from '../src/engine/analysis.js';
import { deepClone } from '../src/engine/utils.js';

for (const tpl of TEMPLATES) {
  test(`шаблон ${tpl.id}: все примеры считаются`, () => {
    assert.ok(tpl.samples.length > 0);
    for (const s of tpl.samples) {
      const res = tpl.compute(deepClone(s.inputs));
      assert.ok(Array.isArray(res.kpis) && res.kpis.length > 0, 'kpis');
      assert.ok(Array.isArray(res.tables) && res.tables.length > 0, 'tables');
      assert.ok(Array.isArray(res.conclusion) && res.conclusion.length > 0, 'conclusion');
      for (const t of res.tables) {
        assert.ok(t.columns.length > 0 && t.rows.length > 0, `table ${t.id}`);
        for (const r of t.rows) assert.ok(Array.isArray(r.cells), `row cells in ${t.id}`);
      }
      for (const k of res.kpis) assert.ok(k.value === null || k.value === undefined || typeof k.value === 'number' || typeof k.value === 'string', `kpi ${k.label}`);
      if (tpl.drivers && tpl.drivers.length) {
        const metricKey = tpl.metrics[0].key;
        const fn = (inp) => tpl.metric(inp, metricKey);
        const base = fn(deepClone(s.inputs));
        assert.ok(base == null || isFinite(base));
        const t = tornado(fn, deepClone(s.inputs), tpl.drivers, 0.1);
        assert.equal(t.rows.length, tpl.drivers.length);
        if (tpl.defaultMonteCarlo) {
          const mc = monteCarlo(fn, deepClone(s.inputs), tpl.defaultMonteCarlo(), { iterations: 100 });
          assert.ok(mc.iterations > 0);
        }
        if (tpl.defaultScenarios) {
          const sc = scenarios((inp) => ({ kpi: { [metricKey]: fn(inp) } }), deepClone(s.inputs), tpl.defaultScenarios(), metricKey);
          assert.equal(sc.results.length, 3);
        }
      }
    }
  });
}

test('пример fd.ru в экспресс-шаблоне даёт NPV −52 303', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'express');
  const s = tpl.samples.find((x) => x.id === 'fd');
  const res = tpl.compute(deepClone(s.inputs));
  const npv = res.kpis.find((k) => k.key === 'npv').value;
  assert.ok(Math.abs(npv + 52303) < 1, String(npv));
});

test('кредит fd.ru: страховка 2 % даёт реальную ставку ≈ 12.9 %', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'loan');
  const s = tpl.samples.find((x) => x.id === 'fd');
  const res = tpl.compute(deepClone(s.inputs));
  const eff = res.metric.effRate;
  assert.ok(Math.abs(eff - 0.129) < 0.003, String(eff));
});

test('бюджет fd.ru: баланс сходится', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'budget');
  const res = tpl.compute(deepClone(tpl.samples[0].inputs));
  assert.equal(res.kpis.find((k) => k.label === 'Баланс сходится').value, 1);
});
