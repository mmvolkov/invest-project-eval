/** Вкладки анализа: чувствительность, сценарии, Монте-Карло */
import { sensitivityTable, tornado, switchingValue, scenarios as runScenarios, monteCarlo } from '../engine/analysis.js';
import { fmt, escapeHtml } from './format.js';
import { renderChart } from './charts.js';
import { tableHtml } from './results.js';
import { deepClone } from '../engine/utils.js';

function metricFn(template, key) {
  return (inp) => {
    const v = template.metric(inp, key);
    return v == null ? NaN : v;
  };
}

export function renderSensitivity(container, template, inputs, state, onState) {
  const metrics = template.metrics || [];
  const drivers = template.drivers || [];
  if (!drivers.length) {
    container.innerHTML = '<div class="empty">Для этого шаблона анализ чувствительности не предусмотрен: результат полностью определяется введёнными план/факт данными.</div>';
    return;
  }
  const metricKey = state.metric && metrics.some((m) => m.key === state.metric) ? state.metric : metrics[0].key;
  const delta = state.delta || 0.1;
  const m = metrics.find((x) => x.key === metricKey);
  const fn = metricFn(template, metricKey);
  const steps = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];
  const st = sensitivityTable(fn, inputs, drivers, steps);
  const tor = tornado(fn, inputs, drivers, delta);
  const sv = drivers.map((d) => ({ d, v: switchingValue(fn, inputs, d, 0) }));

  container.innerHTML = `
    <div class="toolbar">
      <label>Показатель <select id="sensMetric">${metrics.map((x) => `<option value="${x.key}" ${x.key === metricKey ? 'selected' : ''}>${escapeHtml(x.label)}</option>`).join('')}</select></label>
      <label>Отклонение для торнадо <select id="sensDelta">${[0.05, 0.1, 0.2].map((d) => `<option value="${d}" ${d === delta ? 'selected' : ''}>±${d * 100} %</option>`).join('')}</select></label>
      <span class="muted">База: <strong>${escapeHtml(fmt(st.base, m.fmt))}</strong></span>
    </div>
    <div class="note">Метод «что если» и торнадо-диаграмма: каждый фактор меняется по очереди при неизменных остальных (методика анализа чувствительности). Для ставок шаг ±10 % означает ±1 п.п.</div>
    <div class="split">
      <div class="chart-box"><h4>Торнадо: влияние факторов на ${escapeHtml(m.label)} при ±${delta * 100} %</h4><canvas id="tornadoChart" data-title="Торнадо ${escapeHtml(m.label)}"></canvas></div>
      <div class="table-box"><div class="table-head"><h4>Пороговые значения (switching values)</h4></div><div class="table-scroll">${tableHtml({
        columns: [{ label: 'Фактор', fmt: 'text' }, { label: 'Изменение, при котором показатель = 0', fmt: 'text' }, { label: 'Размах торнадо', fmt: m.fmt }],
        rows: tor.rows.map((r) => {
          const s = sv.find((x) => x.d === r.driver);
          const txt = s.v == null ? 'не достигается в диапазоне −95…+300 %' : r.driver.mode === 'shift' ? `${s.v >= 0 ? '+' : ''}${s.v.toFixed(1)} п.п.` : `${s.v >= 0 ? '+' : ''}${(s.v * 100).toFixed(1)} %`;
          return { cells: [r.driver.label, txt, r.swing] };
        }),
      })}</div></div>
    </div>
    <div class="table-box"><div class="table-head"><h4>Таблица чувствительности: ${escapeHtml(m.label)} при изменении фактора</h4></div><div class="table-scroll">${tableHtml({
      columns: [{ label: 'Фактор', fmt: 'text' }, ...steps.map((s) => ({ label: `${s > 0 ? '+' : ''}${Math.round(s * 100)} %`, fmt: m.fmt })), { label: 'Эластичность', fmt: 'ratio' }],
      rows: st.rows.map((r) => ({ cells: [r.driver.label + (r.driver.mode === 'shift' ? ' (×0.1 п.п. за 1 %)' : ''), ...r.values, r.elasticity] })),
    })}</div></div>
    <div class="conclusion"><h3>Выводы</h3><ul>${sensitivityConclusion(tor, sv, m).map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></div>`;

  renderChart(container.querySelector('#tornadoChart'), {
    type: 'tornado',
    base: tor.base,
    labels: tor.rows.map((r) => r.driver.label),
    datasets: [
      { label: `−${delta * 100} %`, data: tor.rows.map((r) => r.low) },
      { label: `+${delta * 100} %`, data: tor.rows.map((r) => r.high) },
    ],
  });
  container.querySelector('#sensMetric').addEventListener('change', (e) => onState({ metric: e.target.value }));
  container.querySelector('#sensDelta').addEventListener('change', (e) => onState({ delta: Number(e.target.value) }));
}

function sensitivityConclusion(tor, sv, m) {
  const out = [];
  if (tor.rows.length) {
    const top = tor.rows[0];
    out.push(`Наиболее критичный фактор — «${top.driver.label}»: при ±${tor.delta * 100} % показатель меняется от ${fmt(top.low, m.fmt)} до ${fmt(top.high, m.fmt)}.`);
    if (tor.rows[1]) out.push(`Далее по влиянию: «${tor.rows[1].driver.label}»${tor.rows[2] ? ` и «${tor.rows[2].driver.label}»` : ''}.`);
  }
  const tight = sv.filter((x) => x.v != null && (x.d.mode === 'shift' ? Math.abs(x.v) < 3 : Math.abs(x.v) < 0.15));
  if (tight.length) out.push(`Малый запас прочности по факторам: ${tight.map((x) => `${x.d.label} (${x.d.mode === 'shift' ? x.v.toFixed(1) + ' п.п.' : (x.v * 100).toFixed(1) + ' %'})`).join(', ')} — отклонение в этих пределах обнуляет результат.`);
  else out.push('Ни один фактор не обнуляет результат при отклонении до 15 % — запас устойчивости приемлемый.');
  return out;
}

/** ---------- Сценарии ---------- */
export function renderScenarios(container, template, inputs, state, onState) {
  const drivers = template.drivers || [];
  const metrics = template.metrics || [];
  if (!drivers.length) {
    container.innerHTML = '<div class="empty">Сценарный анализ недоступен для этого шаблона.</div>';
    return;
  }
  const list = state.scenarios && state.scenarios.length ? state.scenarios : template.defaultScenarios ? template.defaultScenarios() : [{ name: 'Базовый', probability: 1, changes: [] }];
  const metricKey = metrics[0].key;
  const computeAll = (inp) => {
    const out = {};
    for (const mm of metrics) out[mm.key] = template.metric(inp, mm.key);
    return { kpi: out };
  };
  const res = runScenarios(computeAll, inputs, list, metricKey);

  const scHtml = list
    .map(
      (sc, i) => `<div class="scenario" data-i="${i}">
      <div class="scenario-head"><input type="text" class="input sc-name" value="${escapeHtml(sc.name)}" /> <label>Вероятность <input type="number" class="input sc-prob" style="width:80px" min="0" max="1" step="0.05" value="${sc.probability ?? ''}" /></label>
      <button class="btn small sc-add" type="button">+ фактор</button><button class="btn small danger sc-del" type="button">Удалить сценарий</button></div>
      ${(sc.changes || [])
        .map(
          (ch, j) => `<div class="change-row" data-j="${j}"><select class="ch-path">${drivers.map((d) => `<option value="${d.path}" ${d.path === ch.path ? 'selected' : ''}>${escapeHtml(d.label)}</option>`).join('')}</select>
          <input type="number" class="ch-value" step="any" value="${ch.mode === 'shift' ? ch.value : Math.round((Number(ch.value) || 0) * 1000) / 10}" style="width:90px" /> <span class="muted">${ch.mode === 'shift' ? 'п.п.' : '%'}</span>
          <button class="btn small ch-del" type="button">✕</button></div>`
        )
        .join('')}
    </div>`
    )
    .join('');

  const rows = res.results.map((r) => ({ cells: [r.scenario.name, r.scenario.probability ?? null, ...metrics.map((mm) => r.result.kpi[mm.key])] }));
  if (res.expected != null) rows.push({ cells: ['Ожидаемое значение (взвешенное)', null, res.expected, ...metrics.slice(1).map(() => null)], style: 'total' });

  container.innerHTML = `
    <div class="note">Сценарный анализ: несколько факторов меняются одновременно (базовый / пессимистичный / оптимистичный). Укажите вероятности — получите ожидаемое значение показателя.</div>
    <div class="split"><div>${scHtml}<button class="btn" id="scNew" type="button">+ Новый сценарий</button> <button class="btn ghost" id="scReset" type="button">Сбросить к типовым</button></div>
    <div>
      <div class="table-box"><div class="table-head"><h4>Результаты сценариев</h4></div><div class="table-scroll">${tableHtml({ columns: [{ label: 'Сценарий', fmt: 'text' }, { label: 'Вероятность', fmt: 'ratio' }, ...metrics.map((mm) => ({ label: mm.label, fmt: mm.fmt }))], rows })}</div></div>
      <div class="chart-box"><h4>${escapeHtml(metrics[0].label)} по сценариям</h4><canvas id="scChart" data-title="Сценарии"></canvas></div>
    </div></div>`;
  renderChart(container.querySelector('#scChart'), { type: 'bar', labels: res.results.map((r) => r.scenario.name), datasets: [{ label: metrics[0].label, data: res.results.map((r) => r.metric) }] });

  const update = (next) => onState({ scenarios: next });
  const clone = () => deepClone(list);
  container.querySelectorAll('.scenario').forEach((box) => {
    const i = Number(box.dataset.i);
    box.querySelector('.sc-name').addEventListener('change', (e) => {
      const n = clone();
      n[i].name = e.target.value;
      update(n);
    });
    box.querySelector('.sc-prob').addEventListener('change', (e) => {
      const n = clone();
      n[i].probability = e.target.value === '' ? null : Number(e.target.value);
      update(n);
    });
    box.querySelector('.sc-add').addEventListener('click', () => {
      const n = clone();
      n[i].changes = [...(n[i].changes || []), { path: drivers[0].path, mode: drivers[0].mode, itemKey: drivers[0].itemKey, value: drivers[0].mode === 'shift' ? 1 : -0.1 }];
      update(n);
    });
    box.querySelector('.sc-del').addEventListener('click', () => update(clone().filter((_, k) => k !== i)));
    box.querySelectorAll('.change-row').forEach((row) => {
      const j = Number(row.dataset.j);
      row.querySelector('.ch-path').addEventListener('change', (e) => {
        const n = clone();
        const d = drivers.find((x) => x.path === e.target.value);
        n[i].changes[j] = { path: d.path, mode: d.mode, itemKey: d.itemKey, value: d.mode === 'shift' ? 1 : -0.1 };
        update(n);
      });
      row.querySelector('.ch-value').addEventListener('change', (e) => {
        const n = clone();
        const v = Number(e.target.value) || 0;
        n[i].changes[j].value = n[i].changes[j].mode === 'shift' ? v : v / 100;
        update(n);
      });
      row.querySelector('.ch-del').addEventListener('click', () => {
        const n = clone();
        n[i].changes.splice(j, 1);
        update(n);
      });
    });
  });
  container.querySelector('#scNew').addEventListener('click', () => update([...clone(), { name: `Сценарий ${list.length + 1}`, probability: null, changes: [] }]));
  container.querySelector('#scReset').addEventListener('click', () => update(template.defaultScenarios ? template.defaultScenarios() : []));
}

/** ---------- Монте-Карло ---------- */
export function renderMonteCarlo(container, template, inputs, state, onState) {
  const drivers = template.drivers || [];
  const metrics = template.metrics || [];
  if (!drivers.length) {
    container.innerHTML = '<div class="empty">Имитационное моделирование недоступно для этого шаблона.</div>';
    return;
  }
  const vars = state.mcVars && state.mcVars.length ? state.mcVars : template.defaultMonteCarlo ? template.defaultMonteCarlo() : [{ driver: drivers[0], dist: 'triangular', min: -0.2, mode: 0, max: 0.2 }];
  const iterations = state.mcIterations || 2000;
  const metricKey = state.mcMetric && metrics.some((m) => m.key === state.mcMetric) ? state.mcMetric : metrics[0].key;
  const m = metrics.find((x) => x.key === metricKey);
  const isShift = (d) => d.mode === 'shift';
  const show = (d, v) => (v == null ? '' : isShift(d) ? v : Math.round(v * 1000) / 10);

  container.innerHTML = `
    <div class="note">Метод Монте-Карло: факторы одновременно получают случайные значения из заданных распределений, модель пересчитывается ${iterations} раз. Результат — распределение показателя, а не точечная оценка. Для относительных факторов диапазон задаётся в % от базы, для ставок — в п.п.</div>
    <div class="toolbar">
      <label>Показатель <select id="mcMetric">${metrics.map((x) => `<option value="${x.key}" ${x.key === metricKey ? 'selected' : ''}>${escapeHtml(x.label)}</option>`).join('')}</select></label>
      <label>Итераций <select id="mcIter">${[500, 1000, 2000, 5000, 10000].map((n) => `<option value="${n}" ${n === iterations ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn primary" id="mcRun" type="button">▶ Запустить</button>
      <button class="btn small" id="mcAdd" type="button">+ фактор</button>
      <button class="btn small ghost" id="mcReset" type="button">Сбросить</button>
    </div>
    <div class="items"><table><thead><tr><th>Фактор</th><th>Распределение</th><th>Мин</th><th>Мода / среднее</th><th>Макс / σ</th><th></th></tr></thead><tbody>
    ${vars
      .map(
        (v, i) => `<tr data-i="${i}"><td><select class="input v-driver">${drivers.map((d) => `<option value="${d.path}" ${d.path === v.driver.path ? 'selected' : ''}>${escapeHtml(d.label)}</option>`).join('')}</select></td>
        <td><select class="input v-dist">${[['triangular', 'Треугольное'], ['uniform', 'Равномерное'], ['normal', 'Нормальное']].map(([k, l]) => `<option value="${k}" ${k === (v.dist || 'triangular') ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input class="input v-min" type="number" step="any" style="width:90px" value="${show(v.driver, v.min)}" ${v.dist === 'normal' ? 'disabled' : ''} /></td>
        <td><input class="input v-mode" type="number" step="any" style="width:90px" value="${v.dist === 'normal' ? show(v.driver, v.mean ?? 0) : show(v.driver, v.mode ?? 0)}" /></td>
        <td><input class="input v-max" type="number" step="any" style="width:90px" value="${v.dist === 'normal' ? show(v.driver, v.sd ?? 0.1) : show(v.driver, v.max)}" /></td>
        <td><button class="rm v-del" type="button">✕</button></td></tr>`
      )
      .join('')}
    </tbody></table></div>
    <div id="mcResult"></div>`;

  const update = (next) => onState({ mcVars: next });
  const clone = () => deepClone(vars);
  container.querySelectorAll('tr[data-i]').forEach((tr) => {
    const i = Number(tr.dataset.i);
    const read = () => {
      const n = clone();
      const d = drivers.find((x) => x.path === tr.querySelector('.v-driver').value);
      const dist = tr.querySelector('.v-dist').value;
      const k = isShift(d) ? 1 : 100;
      const a = Number(tr.querySelector('.v-min').value) / k;
      const b = Number(tr.querySelector('.v-mode').value) / k;
      const c = Number(tr.querySelector('.v-max').value) / k;
      n[i] = dist === 'normal' ? { driver: d, dist, mean: b || 0, sd: c || 0.1 } : { driver: d, dist, min: a || 0, mode: b || 0, max: c || 0 };
      return n;
    };
    tr.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', () => update(read())));
    tr.querySelector('.v-del').addEventListener('click', () => update(clone().filter((_, k) => k !== i)));
  });
  container.querySelector('#mcAdd').addEventListener('click', () => update([...clone(), { driver: drivers[0], dist: 'triangular', min: -0.2, mode: 0, max: 0.2 }]));
  container.querySelector('#mcReset').addEventListener('click', () => update(template.defaultMonteCarlo ? template.defaultMonteCarlo() : []));
  container.querySelector('#mcMetric').addEventListener('change', (e) => onState({ mcMetric: e.target.value }));
  container.querySelector('#mcIter').addEventListener('change', (e) => onState({ mcIterations: Number(e.target.value) }));

  const run = () => {
    const box = container.querySelector('#mcResult');
    box.innerHTML = '<div class="empty"><span class="spin"></span> Моделирование…</div>';
    setTimeout(() => {
      const fn = metricFn(template, metricKey);
      const r = monteCarlo(fn, inputs, vars, { iterations, seed: Date.now() % 100000, bins: 24 });
      state.mcResult = r;
      const labels = r.histogram.map((h) => fmt((h.from + h.to) / 2, m.fmt));
      const negUntil = r.histogram.findIndex((h) => h.from >= 0);
      box.innerHTML = `
        <div class="stat-grid">
          ${[['Среднее', r.mean], ['Медиана P50', r.p50], ['P10 (пессимистично)', r.p10], ['P90 (оптимистично)', r.p90], ['Минимум', r.min], ['Максимум', r.max], ['Ст. отклонение', r.sd]]
            .map(([l, v]) => `<div class="kpi"><div class="v">${escapeHtml(fmt(v, m.fmt))}</div><div class="l">${l}</div></div>`)
            .join('')}
          <div class="kpi ${r.probNegative > 0.3 ? 'bad' : r.probNegative < 0.1 ? 'good' : ''}"><div class="v">${fmt(r.probNegative, 'pct')}</div><div class="l">Вероятность ${escapeHtml(m.label)} &lt; 0</div></div>
        </div>
        <div class="chart-box"><h4>Распределение ${escapeHtml(m.label)} (${r.iterations} итераций)</h4><canvas id="mcChart" data-title="Монте-Карло ${escapeHtml(m.label)}"></canvas></div>
        <div class="conclusion"><h3>Выводы</h3><ul>
          <li>С вероятностью 80 % ${escapeHtml(m.label)} окажется в диапазоне от ${escapeHtml(fmt(r.p10, m.fmt))} до ${escapeHtml(fmt(r.p90, m.fmt))}.</li>
          <li>Вероятность отрицательного значения — ${fmt(r.probNegative, 'pct')}: ${r.probNegative > 0.3 ? 'высокий риск, нужны меры по снижению чувствительности к ключевым факторам.' : r.probNegative > 0.1 ? 'умеренный риск, требуется план реагирования.' : 'риск низкий.'}</li>
          <li>Коэффициент вариации ${r.mean ? fmt(Math.abs(r.sd / r.mean), 'pct') : '—'} — ${r.mean && Math.abs(r.sd / r.mean) > 1 ? 'разброс превышает среднее, точечная оценка ненадёжна.' : 'разброс умеренный.'}</li>
        </ul></div>`;
      renderChart(box.querySelector('#mcChart'), { type: 'histogram', labels, datasets: [{ label: 'Частота', data: r.histogram.map((h) => h.count) }], negativeUntil: negUntil < 0 ? r.histogram.length : negUntil });
    }, 20);
  };
  container.querySelector('#mcRun').addEventListener('click', run);
  if (state.mcAutoRun) run();
}
