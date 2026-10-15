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

test('EVA: пример «Гамма» из статьи Системы «Финансовый директор» (EVA = NOPAT − IC × WACC)', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'eva');
  const s = tpl.samples.find((x) => x.id === 'gamma');
  const r = tpl.compute(deepClone(s.inputs));
  const expected = [581712, 3970185, 3582666, 7439188, 13389604];
  // в статье WACC округлён до сотых процента, поэтому допуск 0,02 % от значения
  r.series.eva.forEach((v, t) => assert.ok(Math.abs(v - expected[t]) < 0.0002 * expected[t] + 2, `EVA год ${t + 1}: ${v} vs ${expected[t]}`));
  assert.equal(r.kpis[0].good, true);
  const f = r.tables.find((t) => t.id === 'factors');
  assert.ok(f && f.rows.length === 4);
  for (const row of f.rows) assert.ok(Math.abs(row.cells[1] + row.cells[2] + row.cells[3] + row.cells[4] - row.cells[5]) < 1e-6, 'факторы сходятся к EVA отчётного года');
});

test('EVA: пример из Excel-модели методики сходится с рассчитанными в Excel значениями', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'eva');
  const s = tpl.samples.find((x) => x.id === 'excel');
  const r = tpl.compute(tpl.normalize(deepClone(s.inputs)));
  const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
  const nopat = [88912, 80256, 73024, 68992, 62344];
  const ic = [253150, 327950, 389950, 455750, 508900];
  const wacc = [0.12218181818, 0.12179775281, 0.11847619048, 0.11671232877, 0.11653846154];
  const eva = [57981.6727, 40312.427, 26824.2095, 15800.3562, 3037.5769];
  r.series.nopat.forEach((v, t) => close(v, nopat[t], 0.5, `NOPAT ${t}`));
  r.series.icAvg.forEach((v, t) => close(v, ic[t], 0.5, `IC ${t}`));
  r.series.wacc.forEach((v, t) => close(v, wacc[t], 1e-6, `WACC ${t}`));
  r.series.eva.forEach((v, t) => close(v, eva[t], 0.5, `EVA ${t}`));
  const icTable = r.tables.find((t) => t.id === 'ic');
  close(icTable.rows[3].cells[6], 531100, 0.5, 'IC на конец 2023');
  assert.ok(r.tables.find((t) => t.id === 'valuation'));
});

test('EVA: стандартный налоговый щит только по долгу даёт более высокий WACC, чем вариант Excel', () => {
  const tpl = TEMPLATES.find((t) => t.id === 'eva');
  const s = tpl.samples.find((x) => x.id === 'excel');
  const a = tpl.compute({ ...deepClone(s.inputs), taxShield: 'debt' });
  const b = tpl.compute({ ...deepClone(s.inputs), taxShield: 'all' });
  assert.ok(a.series.wacc[0] > b.series.wacc[0]);
  assert.ok(Math.abs(a.series.wacc[0] - (0.2727272727 * 0.16 * 0.8 + 0.7272727273 * 0.15)) < 1e-6);
});
