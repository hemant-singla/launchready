// LaunchReady web app. No framework: each view is a function that turns the
// computed result into HTML. All numbers come from src/ (the same code the
// tests check); this file only displays them.
import { loadData } from '../src/data.js';
import { computeAll } from '../src/engine.js';
import { SCENARIOS } from '../src/scenarios.js';
import { openTickets } from '../src/software.js';
import { stockSummary } from '../src/supply.js';
import { fmtDate, daysBetween, addDays } from '../src/dates.js';
import { renderAgent, agentClick, agentChange } from './agent.js';

const state = { base: null, data: null, active: [], result: null, baseline: null, filters: { line: '', chipset: '', status: '', part: '' }, open: new Set() };
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x) => Number(x).toLocaleString('en-US');
const LABEL = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
const pill = (s) => `<span class="pill ${s}">${LABEL[s]}</span>`;
// Turn ISO dates inside reason text into "12 Nov 2026".
const prettyDates = (t) => esc(t).replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d));
const range = (a, b) => (a ? `${fmtDate(a, true)} – ${fmtDate(b)}` : 'unknown');

// ---------- state ----------
function recompute() {
  let d = state.base;
  for (const key of state.active) d = SCENARIOS[key].apply(d);
  state.data = d;
  state.result = computeAll(d);
  renderScenarioBar();
  render();
}

function renderScenarioBar() {
  $('#scenario-buttons').innerHTML = Object.entries(SCENARIOS).map(([key, s]) =>
    `<button type="button" class="scenario ${state.active.includes(key) ? 'on' : ''}" data-scenario="${key}" aria-pressed="${state.active.includes(key)}">${esc(s.title)}</button>`).join('');
  $('#scenario-active').innerHTML = state.active.length
    ? state.active.map((k) => `<p><strong>${esc(SCENARIOS[k].title)}:</strong> ${esc(SCENARIOS[k].summary)}</p>`).join('')
    : '';
  $('#reset').disabled = state.active.length === 0;
}

// ---------- filters ----------
function select(id, label, options, value) {
  return `<label>${label}<select data-filter="${id}"><option value="">All</option>${options.map((o) =>
    `<option value="${esc(o.value ?? o)}" ${String(o.value ?? o) === value ? 'selected' : ''}>${esc(o.label ?? o)}</option>`).join('')}</select></label>`;
}
const lines = () => [...new Set(state.data.models.map((m) => m.line))];
const chipsetIds = () => state.data.chipsets.map((c) => c.id);

// ---------- launch view ----------
function renderLaunch() {
  const r = state.result;
  const f = state.filters;
  const counts = { ready: 0, 'at-risk': 0, blocked: 0 };
  r.models.forEach((m) => counts[m.status]++);
  $('#launch-counts').innerHTML = Object.entries(counts).map(([s, c]) =>
    `<button type="button" class="count ${s} ${f.status === s ? 'on' : ''}" data-status="${s}"><strong>${c}</strong><span>${LABEL[s]}</span></button>`).join('');
  $('#launch-filters').innerHTML = select('line', 'Line', lines(), f.line) + select('chipset', 'Chipset', chipsetIds(), f.chipset) +
    select('status', 'Status', Object.keys(LABEL).map((s) => ({ value: s, label: LABEL[s] })), f.status);

  const rows = r.models.filter((m) => (!f.line || m.line === f.line) && (!f.chipset || m.chipset === f.chipset) && (!f.status || m.status === f.status))
    .sort((a, b) => a.launchDate.localeCompare(b.launchDate) || a.id.localeCompare(b.id));
  if (!rows.length) { $('#launch-list').innerHTML = '<p class="empty">No models match these filters.</p>'; return; }

  $('#launch-list').innerHTML = `<div class="launch-row head" aria-hidden="true"><span>Model</span><span>Chipset</span><span>Launch</span><span>Software ready</span><span>Status</span></div>` +
    rows.map((m) => {
      const was = state.baseline.models.find((x) => x.id === m.id).status;
      const changed = was !== m.status ? `<span class="changed">was ${LABEL[was]}</span>` : '';
      const isOpen = state.open.has(m.id);
      const chip = state.data.chipsets.find((c) => c.id === m.chipset);
      const reasons = (title, side) => `<div><h3>${title} ${pill(side.status)}</h3>${side.reasons.length
        ? `<ul>${side.reasons.map((x) => `<li>${prettyDates(x)}</li>`).join('')}</ul>` : '<p>No issues found.</p>'}</div>`;
      return `<article class="launch-item ${m.status} ${isOpen ? 'open' : ''}">
        <button type="button" class="launch-row" data-model="${m.id}" aria-expanded="${isOpen}">
          <span class="model"><strong>${esc(m.name)}</strong><small>${esc(m.segment)}</small></span>
          <span data-label="Chipset">${esc(m.chipset)}${chip.isNew ? ' <em class="tag">new</em>' : ''}</span>
          <span data-label="Launch">${fmtDate(m.launchDate)}</span>
          <span data-label="Software ready">${range(m.eta.early, m.eta.late)}</span>
          <span class="status-cell">${pill(m.status)}${changed}</span>
        </button>
        ${isOpen ? `<div class="detail">${reasons('Software', m.software)}${reasons('Supply', m.supply)}
          <p class="fine">First production build: ${n(m.firstBuildUnits)} units; parts needed by ${fmtDate(addDays(m.launchDate, -state.data.config.productionLeadDays))}. Software must be ready by ${fmtDate(addDays(m.launchDate, -state.data.config.bufferDays))}.</p></div>` : ''}
      </article>`;
    }).join('');
}

// ---------- software view ----------
function renderSoftware() {
  const { data, result } = state;
  const f = state.filters;
  $('#software-filters').innerHTML = select('chipset', 'Chipset', chipsetIds(), f.chipset) + select('line', 'Line', lines(), f.line);
  const chips = data.chipsets.filter((c) => (!f.chipset || c.id === f.chipset) &&
    (!f.line || data.models.some((m) => m.chipset === c.id && m.line === f.line)));

  $('#software-list').innerHTML = chips.map((c) => {
    const info = result.chipsets[c.id];
    const eta = info.eta;
    const models = result.models.filter((m) => m.chipset === c.id);
    const tickets = openTickets(data, c.id);
    const teamRows = data.teams.map((t) => {
      const s = data.submissions.find((x) => x.chipset === c.id && x.team === t.id);
      let sub;
      if (s.submittedOn) sub = `<span class="ok">Submitted ${fmtDate(s.submittedOn, true)}</span>`;
      else if (s.expectedOn && s.expectedOn > s.dueDate) sub = `<span class="bad">Late: expected ${fmtDate(s.expectedOn, true)}</span>`;
      else if (s.expectedOn) sub = `<span>Due ${fmtDate(s.dueDate, true)}</span>`;
      else sub = '<span class="bad">No date</span>';
      const mine = tickets.filter((x) => x.team === t.id);
      const sev = (k) => mine.filter((x) => x.severity === k).length;
      const oldest = mine.length ? Math.max(...mine.map((x) => x.ageDays)) : null;
      const b = eta.backlog[t.id];
      return `<tr><th scope="row">${esc(t.name)}</th><td>${sub}</td><td>${s.newCodePct}%</td>
        <td class="num ${sev('critical') ? 'bad' : ''}">${sev('critical')}</td><td class="num">${sev('major')}</td><td class="num">${sev('minor')}</td>
        <td class="num">${oldest ?? '–'}</td><td class="num">${mine.length ? `${b.days[0]}–${b.days[1]}` : '–'}</td></tr>`;
    }).join('');
    const slip = eta.known && eta.slipDays > 0 ? ` <span class="bad">(${eta.slipDays} days late)</span>` : '';
    const ticketList = tickets.length ? `<details><summary>${tickets.length} open tickets</summary><div class="table-scroll"><table class="data-table small">
      <thead><tr><th>Ticket</th><th>Team</th><th>Severity</th><th>Raised by</th><th>Age</th><th>Title</th></tr></thead><tbody>
      ${tickets.sort((a, b) => b.ageDays - a.ageDays).map((t) => `<tr><td>${t.id}</td><td>${t.team}</td><td class="${t.severity === 'critical' ? 'bad' : ''}">${t.severity}</td><td>${t.raisedBy}</td><td class="num">${t.ageDays} d</td><td>${esc(t.title)}</td></tr>`).join('')}
      </tbody></table></div></details>` : '<p class="fine">No open tickets: testing has not started yet.</p>';
    return `<article class="card">
      <header class="card-head"><div><h2>${c.id} ${c.isNew ? '<em class="tag">new chipset</em>' : '<em class="tag muted">reused</em>'}</h2>
        <p>${models.map((m) => `${esc(m.name)} ${pill(m.software.status)}`).join(' &nbsp; ')}</p></div>
        <dl class="facts"><div><dt>Code deadline</dt><dd>${fmtDate(c.codeDeadline)}</dd></div>
        <div><dt>Testing ${c.testStartedOn ? 'started' : 'starts'}</dt><dd>${eta.known ? fmtDate(eta.testStart) : 'unknown'}${slip}</dd></div>
        <div><dt>Software ready</dt><dd><strong>${range(eta.early, eta.late)}</strong></dd></div></dl></header>
      ${!eta.known ? `<p class="bad">${esc(eta.notes.join('; '))}</p>` : ''}
      <div class="table-scroll"><table class="data-table"><thead><tr><th scope="col">Team</th><th scope="col">Code submission</th><th scope="col">New code</th>
        <th scope="col">Critical</th><th scope="col">Major</th><th scope="col">Minor</th><th scope="col">Oldest (days)</th><th scope="col">Fix backlog (days)</th></tr></thead>
        <tbody>${teamRows}</tbody></table></div>
      ${ticketList}
    </article>`;
  }).join('') || '<p class="empty">No chipsets match these filters.</p>';
}

// ---------- supply view ----------
function renderSupply() {
  const { data, result } = state;
  const f = state.filters;
  const partsUsed = data.parts.filter((p) => data.bom.some((b) => b.part === p.id) || data.substitutes.some((s) => s.substitute === p.id));
  $('#supply-filters').innerHTML = select('chipset', 'Chipset', chipsetIds(), f.chipset) +
    select('part', 'Part', partsUsed.map((p) => ({ value: p.id, label: `${p.id} · ${p.name}` })), f.part);
  const parts = partsUsed.filter((p) => (!f.part || p.id === f.part) &&
    (!f.chipset || data.bom.some((b) => b.chipset === f.chipset && b.part === p.id) ||
      data.substitutes.some((s) => s.substitute === p.id && s.approvedFor.includes(f.chipset))));
  const stock = stockSummary(data);
  const wh = data.warehouses;
  const supplierName = (id) => data.suppliers.find((s) => s.id === id)?.name.replace(' (fictional)', '') ?? id;

  $('#supply-list').innerHTML = parts.map((p) => {
    const st = stock.filter((s) => s.part === p.id);
    const tot = st.reduce((a, s) => ({ onHand: a.onHand + s.onHand, allocated: a.allocated + s.allocated, free: a.free + s.free }), { onHand: 0, allocated: 0, free: 0 });
    const usedBy = data.bom.filter((b) => b.part === p.id).map((b) => b.chipset);
    const sub = data.substitutes.find((s) => s.part === p.id);
    const subOf = data.substitutes.find((s) => s.substitute === p.id);
    const dels = data.deliveries.filter((d) => d.part === p.id);
    const lns = result.lines.filter((l) => l.part === p.id && (!f.chipset || l.chipset === f.chipset));
    const worstLine = lns.reduce((w, l) => (l.status === 'blocked' || (l.status === 'at-risk' && w !== 'blocked') ? l.status : w), 'ready');
    return `<article class="card">
      <header class="card-head"><div><h2>${p.id} <span class="sub">${esc(p.name)}</span> ${lns.length ? pill(worstLine) : ''}</h2>
        <p>${usedBy.length ? `Used by ${usedBy.join(', ')}` : `Approved substitute for ${subOf.part} on ${subOf.approvedFor.join(', ')}`}${usedBy.length > 1 ? ' <em class="tag muted">shared part</em>' : ''}</p></div>
        <dl class="facts"><div><dt>On hand</dt><dd>${n(tot.onHand)}</dd></div><div><dt>Already allocated</dt><dd>${n(tot.allocated)}</dd></div><div><dt>Free</dt><dd><strong>${n(tot.free)}</strong></dd></div></dl></header>
      ${sub ? `<p class="callout">Approved substitute: <strong>${sub.substitute}</strong> for ${sub.approvedFor.join(', ')}. ${esc(sub.note)} (${sub.driverChangeDays[0]}–${sub.driverChangeDays[1]} days).</p>` : ''}
      ${subOf ? `<p class="callout">${esc(subOf.note)}. A ${subOf.driverTeam} driver change takes ${subOf.driverChangeDays[0]}–${subOf.driverChangeDays[1]} days.</p>` : ''}
      <div class="split">
        <div><h3>Stock by warehouse</h3><div class="table-scroll"><table class="data-table small"><thead><tr><th>Warehouse</th><th>On hand</th><th>Allocated</th><th>Free</th></tr></thead><tbody>
          ${wh.map((w) => { const s = st.find((x) => x.warehouse === w.id); return s ? `<tr><th scope="row">${esc(w.name)}</th><td class="num">${n(s.onHand)}</td><td class="num">${n(s.allocated)}</td><td class="num">${n(s.free)}</td></tr>` : ''; }).join('')}
        </tbody></table></div></div>
        <div><h3>Deliveries</h3>${dels.length ? `<div class="table-scroll"><table class="data-table small"><thead><tr><th>PO</th><th>Supplier</th><th>Qty</th><th>Planned</th><th>Now</th><th>Status</th><th>For</th></tr></thead><tbody>
          ${dels.map((d) => {
            const delay = d.eta && d.eta !== d.originalEta ? daysBetween(d.eta, d.originalEta) : 0;
            const cls = d.status === 'rejected' || !d.eta ? 'bad' : delay > 0 ? 'warn' : '';
            return `<tr class="${cls}"><td>${d.id}</td><td>${esc(supplierName(d.supplier))}</td><td class="num">${n(d.qty)}</td><td>${fmtDate(d.originalEta, true)}</td>
              <td>${d.eta ? fmtDate(d.eta, true) : '<strong>no date</strong>'}${delay > 0 ? ` (+${delay} d)` : ''}</td><td>${d.status}${d.note ? `<small>${esc(d.note)}</small>` : ''}</td><td>${d.forChipset ?? 'any'}</td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="fine">No open deliveries.</p>'}</div>
      </div>
      ${lns.length ? `<details ${worstLine !== 'ready' ? 'open' : ''}><summary>Who gets this part (${lns.length} builds, earliest need first)</summary><div class="table-scroll"><table class="data-table small">
        <thead><tr><th>Build</th><th>Need</th><th>Qty</th><th>Covered from</th><th>Status</th></tr></thead><tbody>
        ${lns.map((l) => `<tr><td>${l.kind === 'test-boards' ? `${l.chipset} test boards` : esc(data.models.find((m) => m.id === l.model).name)}</td><td>${fmtDate(l.needDate, true)}</td><td class="num">${n(l.qty)}</td>
          <td>${l.allocations.map((a) => `${a.source.startsWith('STOCK') ? 'stock' : a.source} ${n(a.qty)}${a.date > l.needDate ? ` <span class="bad">(${fmtDate(a.date, true)})</span>` : ''}`).join(' + ') || '–'}${l.shortfall ? ` <span class="bad">short ${n(l.shortfall)}</span>` : ''}</td>
          <td>${pill(l.status)}</td></tr>`).join('')}
        </tbody></table></div></details>` : ''}
    </article>`;
  }).join('') || '<p class="empty">No parts match these filters.</p>';
}

// ---------- routing & events ----------
const VIEWS = { intro: () => {}, launch: renderLaunch, software: renderSoftware, supply: renderSupply, agent: () => renderAgent($('#agent-panel')) };
const currentView = () => (location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'intro');

function render() {
  const v = currentView();
  for (const k of Object.keys(VIEWS)) $(`#view-${k}`).hidden = k !== v;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
  document.body.dataset.view = v;
  VIEWS[v]();
}

document.addEventListener('click', (e) => {
  if (agentClick(e, render)) return;
  const sc = e.target.closest('[data-scenario]');
  if (sc) {
    const k = sc.dataset.scenario;
    state.active = state.active.includes(k) ? state.active.filter((x) => x !== k) : [...state.active, k];
    if (currentView() === 'intro') location.hash = 'launch';
    return recompute();
  }
  const row = e.target.closest('[data-model]');
  if (row) { const id = row.dataset.model; state.open.has(id) ? state.open.delete(id) : state.open.add(id); return render(); }
  const cnt = e.target.closest('[data-status]');
  if (cnt) { state.filters.status = state.filters.status === cnt.dataset.status ? '' : cnt.dataset.status; return render(); }
  if (e.target.id === 'reset') { state.active = []; state.open.clear(); state.filters = { line: '', chipset: '', status: '', part: '' }; recompute(); }
});
document.addEventListener('change', (e) => {
  if (agentChange(e, render)) return;
  const f = e.target.dataset.filter;
  if (f) { state.filters[f] = e.target.value; render(); }
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

(async () => {
  try {
    state.base = await loadData('./data/');
    state.baseline = computeAll(state.base);
    $('#asof').textContent = fmtDate(state.base.config.asOf);
    recompute();
  } catch (err) {
    $('#main').innerHTML = `<p class="empty">Could not load the demo data (${esc(err.message)}). If you opened the file directly, serve the folder instead: <code>python3 -m http.server</code>.</p>`;
  }
})();
