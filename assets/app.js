// LaunchReady web app. No framework: each view is a function that turns the
// computed result into HTML. All numbers come from src/ (the same code the
// tests check); this file only displays them.
import { loadData } from '../src/data.js';
import { computeAll } from '../src/engine.js';
import { SCENARIOS } from '../src/scenarios.js';
import { openTickets } from '../src/software.js';
import { stockSummary } from '../src/supply.js';
import { fmtDate, daysBetween, addDays } from '../src/dates.js';
import { renderAgent, agentClick, agentChange, initAgent, resetAgent, agentSetStep, agentApproveSelected, agentOutcome } from './agent.js';
import { computeWith, affectedBy, recoveryOptions } from '../src/recovery.js';
import { initialDemo, decide } from '../src/demo.js';
import { startTour, tourClick, endTour, initTour } from './tour.js';
import { renderTimeline } from './timeline.js';
import { initScene, sceneClick } from './scene.js';
import { applyLab, knockOn, mainReason, explain } from '../src/lab.js';

const state = { base: null, data: null, active: [], result: null, baseline: null, filters: { line: '', chipset: '', status: '', part: '' }, open: new Set(), lab: null, demo: initialDemo(), affectedOnly: true };
const LAB0 = { delivery: 'DL-UC3-01', mode: 'delay', delay: 0, model: 'HAL-77', shift: 0 };
const DELAY_MIN = -14; const DELAY_MAX = 60; // bounds for a what-if shipment date
const labChanged = (l = state.lab) => l.mode !== 'delay' || l.delay !== 0 || l.shift !== 0;
const disrupted = () => state.active.length > 0 || labChanged() || state.demo.actions.length > 0;
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x) => Number(x).toLocaleString('en-US');
const LABEL = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
const ICON = { ready: '✓', 'at-risk': '!', blocked: '✕' };
const pill = (s) => `<span class="pill ${s}"><b aria-hidden="true">${ICON[s]}</b>${LABEL[s]}</span>`;
// Turn ISO dates inside reason text into "12 Nov 2026".
const prettyDates = (t) => esc(t).replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d));
const range = (a, b) => (a ? `${fmtDate(a, true)} – ${fmtDate(b)}` : 'unknown');

// ---------- state ----------
function recompute() {
  computeState();
  renderScenarioBar();
  render();
}
// Order: scenarios, then the user's own what-if edits from the lab (together:
// the disruption), then the recovery actions the user approved.
function computeState() {
  let d = state.base;
  for (const key of state.active) d = SCENARIOS[key].apply(d);
  state.scenarioData = d;
  state.disrupted = applyLab(d, state.lab);
  const { data, result, useSubstituteFor } = computeWith(state.disrupted, state.demo.actions);
  state.data = data;
  state.result = result;
  state.useSubstituteFor = useSubstituteFor;
  state.affected = affectedBy(state.baseline, result);
}

function renderScenarioBar() {
  $('#scenario-buttons').innerHTML = Object.entries(SCENARIOS).map(([key, s]) =>
    `<button type="button" class="scenario ${state.active.includes(key) ? 'on' : ''}" data-scenario="${key}" aria-pressed="${state.active.includes(key)}">${esc(s.title)}</button>`).join('');
  $('#scenario-active').innerHTML = state.active.map((k) => `<p><strong>${esc(SCENARIOS[k].title)}:</strong> ${esc(SCENARIOS[k].summary)}</p>`).join('') +
    (labChanged() ? `<p><strong>Your what-if:</strong> ${esc(labSummary())} <a href="#intro">Edit</a></p>` : '') +
    (state.demo.actions.length ? `<p class="ok-line"><strong>Recovery applied:</strong> ${state.demo.log.filter((l) => l.decision === 'approved').map((l) => esc(l.title)).join('; ')} <a href="#agent">Log</a></p>` : '');
  $('#reset').disabled = state.active.length === 0 && !labChanged() && !state.demo.log.length;
}

// ---------- affected records ----------
const partOfLine = (id) => id.split(':')[2];
const affectedParts = () => [...new Set(state.affected.lines.map(partOfLine))];
const onlyAffected = () => disrupted() && state.affectedOnly && state.affected.models.length > 0;
function affectedToggle(count, noun) {
  if (!disrupted() || !state.affected.models.length) return '';
  return `<div class="aff-toggle" role="group" aria-label="Which ${noun} to show"><button type="button" data-aff="1" aria-pressed="${state.affectedOnly}">Affected only <b>${count}</b></button><button type="button" data-aff="0" aria-pressed="${!state.affectedOnly}">Show all</button></div>`;
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
    `<button type="button" class="count ${s} ${f.status === s ? 'on' : ''}" data-status="${s}" aria-pressed="${f.status === s}"><span class="count-icon" aria-hidden="true">${ICON[s]}</span><strong>${c}</strong><span>${LABEL[s]}</span></button>`).join('');
  renderTimeline($('#launch-timeline'), r, state.data, state.baseline, { preview: previewLaunch, commit: commitLaunch, select: selectModel });
  $('#launch-filters').innerHTML = affectedToggle(state.affected.models.length, 'launches') + select('line', 'Line', lines(), f.line) + select('chipset', 'Chipset', chipsetIds(), f.chipset) +
    select('status', 'Status', Object.keys(LABEL).map((s) => ({ value: s, label: LABEL[s] })), f.status);

  const aff = (m) => state.affected.models.includes(m.id);
  const rows = r.models.filter((m) => (!f.line || m.line === f.line) && (!f.chipset || m.chipset === f.chipset) && (!f.status || m.status === f.status) && (!onlyAffected() || aff(m)))
    .sort((a, b) => (aff(b) - aff(a)) || a.launchDate.localeCompare(b.launchDate) || a.id.localeCompare(b.id));
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
          <span class="model"><strong>${esc(m.name)}</strong><small>${esc(m.segment)}</small>${aff(m) ? `<small class="why">${esc(m.status === 'ready' ? `Software now expected ${fmtDate(m.eta.early, true)}–${fmtDate(m.eta.late, true)}, later than planned but inside the buffer.` : explain(m, r, state.data))}</small>` : ''}</span>
          <span data-label="Chipset">${esc(m.chipset)}${chip.isNew ? ' <em class="tag">new</em>' : ''}</span>
          <span data-label="Launch">${fmtDate(m.launchDate)}</span>
          <span data-label="Software ready">${range(m.eta.early, m.eta.late)}</span>
          <span class="status-cell">${pill(m.status)}${changed}</span>
        </button>
        ${isOpen ? `<div class="detail">${reasons('Software', m.software)}${reasons('Supply', m.supply)}
          <p class="evidence">Evidence: <a href="#software" data-goto-chipset="${m.chipset}">${esc(m.chipset)} software →</a>${[...new Set(r.lines.filter((l) => (l.model === m.id || (l.kind === 'test-boards' && l.chipset === m.chipset)) && l.status !== 'ready').map((l) => l.part))].map((p) => ` <a href="#supply" data-goto-part="${p}">${esc(p)} supply →</a>`).join('')}</p>
          <p class="fine">First production build: ${n(m.firstBuildUnits)} units; parts needed by ${fmtDate(addDays(m.launchDate, -state.data.config.productionLeadDays))}. Software must be ready by ${fmtDate(addDays(m.launchDate, -state.data.config.bufferDays))}.</p></div>` : ''}
      </article>`;
    }).join('');
}

// Dragging a launch on the timeline uses the lab's "move a launch" edit, so the
// start page and every view stay in step. Only one launch move at a time.
function launchEdit(id, date) {
  const planned = state.base.models.find((m) => m.id === id).launchDate;
  return { ...state.lab, model: id, shift: daysBetween(date, planned) };
}
function previewLaunch(id, date) {
  const { result: r } = computeWith(applyLab(state.scenarioData, launchEdit(id, date)), state.demo.actions);
  const m = r.models.find((x) => x.id === id);
  return { status: m.status, why: prettyDates(mainReason(m, r)) };
}
// Click / tap / Enter on a timeline row: open that model's details below.
function selectModel(id) {
  state.open.add(id);
  if (onlyAffected() && !state.affected.models.includes(id)) state.affectedOnly = false;
  render();
  const row = document.querySelector(`.launch-row[data-model="${id}"]`);
  row?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  row?.focus({ preventScroll: true });
}
function commitLaunch(id, date, keyboard) {
  state.lab = launchEdit(id, date);
  recompute();
  if (keyboard) $(`.tl-launch-g[data-model="${id}"]`)?.closest('.tl-row')?.focus();
}

// ---------- software view ----------
function renderSoftware() {
  const { data, result } = state;
  const f = state.filters;
  const affC = (c) => state.affected.chipsets.includes(c.id) || state.affected.models.some((id) => data.models.find((m) => m.id === id).chipset === c.id);
  const nAff = data.chipsets.filter(affC).length;
  $('#software-filters').innerHTML = affectedToggle(nAff, 'chipsets') + select('chipset', 'Chipset', chipsetIds(), f.chipset) + select('line', 'Line', lines(), f.line);
  const chips = data.chipsets.filter((c) => (!f.chipset || c.id === f.chipset) &&
    (!f.line || data.models.some((m) => m.chipset === c.id && m.line === f.line)) && (!onlyAffected() || !nAff || affC(c)))
    .sort((a, b) => affC(b) - affC(a));

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
    const was = state.baseline.chipsets[c.id].eta;
    const why = affC(c) ? `<p class="why-line"><b>Affected:</b> ${eta.known ? `testing ${fmtDate(eta.testStart, true)} (planned ${fmtDate(c.plannedTestStart, true)}), software ready ${range(eta.early, eta.late)}; originally ${range(was.early, was.late)}` : esc(eta.notes.join('; '))}.</p>` : '';
    return `<article class="card ${affC(c) ? 'affected' : ''}">
      ${why}<header class="card-head"><div><h2>${c.id} ${c.isNew ? '<em class="tag">new chipset</em>' : '<em class="tag muted">reused</em>'}</h2>
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
  const affP = affectedParts();
  $('#supply-filters').innerHTML = affectedToggle(affP.length, 'parts') + select('chipset', 'Chipset', chipsetIds(), f.chipset) +
    select('part', 'Part', partsUsed.map((p) => ({ value: p.id, label: `${p.id} · ${p.name}` })), f.part);
  const parts = partsUsed.filter((p) => (!f.part || p.id === f.part) &&
    (!f.chipset || data.bom.some((b) => b.chipset === f.chipset && b.part === p.id) ||
      data.substitutes.some((s) => s.substitute === p.id && s.approvedFor.includes(f.chipset))) &&
    (!onlyAffected() || !affP.length || affP.includes(p.id) || f.part === p.id))
    .sort((a, b) => affP.includes(b.id) - affP.includes(a.id));
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
    const isAff = affP.includes(p.id);
    const affReasons = isAff ? result.lines.filter((l) => l.part === p.id && state.affected.lines.includes(l.id)).flatMap((l) => l.reasons).slice(0, 3) : [];
    const openRecords = isAff || f.part === p.id || worstLine !== 'ready';
    return `<article class="card ${isAff ? 'affected' : ''}">
      ${isAff ? `<div class="why-line"><b>Affected:</b><ul>${affReasons.map((x) => `<li>${prettyDates(x)}</li>`).join('') || '<li>Allocation changed by the disruption</li>'}</ul></div>` : ''}
      <header class="card-head"><div><h2>${p.id} <span class="sub">${esc(p.name)}</span> ${lns.length ? pill(worstLine) : ''}</h2>
        <p>${usedBy.length ? `Used by ${usedBy.join(', ')}` : `Approved substitute for ${subOf.part} on ${subOf.approvedFor.join(', ')}`}${usedBy.length > 1 ? ' <em class="tag muted">shared part</em>' : ''}</p></div>
        <dl class="facts"><div><dt>On hand</dt><dd>${n(tot.onHand)}</dd></div><div><dt>Already allocated</dt><dd>${n(tot.allocated)}</dd></div><div><dt>Free</dt><dd><strong>${n(tot.free)}</strong></dd></div></dl></header>
      ${sub ? `<p class="callout">Approved substitute: <strong>${sub.substitute}</strong> for ${sub.approvedFor.join(', ')}. ${esc(sub.note)}: driver change ${sub.driverChangeDays[0]}–${sub.driverChangeDays[1]} days, then ${sub.validationDays?.[0] ?? 0}–${sub.validationDays?.[1] ?? 0} days of validation in testing.</p>` : ''}
      ${subOf ? `<p class="callout">${esc(subOf.note)}. A ${subOf.driverTeam} driver change takes ${subOf.driverChangeDays[0]}–${subOf.driverChangeDays[1]} days.</p>` : ''}
      <details class="records" ${openRecords ? 'open' : ''}><summary>Stock and deliveries</summary><div class="split">
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
      </div></details>
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
// ---------- start page ----------
function labSummary() {
  const l = state.lab;
  const parts = [];
  const d = state.base.deliveries.find((x) => x.id === l.delivery);
  if (l.mode === 'reject') parts.push(`${d.part} shipment ${d.id} rejected`);
  else if (l.mode === 'nodate') parts.push(`${d.part} shipment ${d.id} has no date`);
  else if (l.delay) parts.push(`${d.part} shipment ${d.id} ${l.delay > 0 ? `${l.delay} days late` : `${-l.delay} days early`}`);
  if (l.shift) parts.push(`${state.base.models.find((m) => m.id === l.model).name} launch ${l.shift > 0 ? '+' : ''}${l.shift} days`);
  return parts.join(' · ') || 'Today, nothing changed';
}

const PRESETS = [
  { label: 'USB controller ships 34 days late', lab: { delivery: 'DL-UC3-01', mode: 'delay', delay: 34 } },
  { label: 'Mini-LED drivers fail inspection', lab: { delivery: 'DL-MLD-03', mode: 'reject' } },
  { label: 'A supplier loses its date', lab: { delivery: 'DL-TCO-02', mode: 'nodate' } },
  { label: 'Pull Halo 77 in by 3 weeks', lab: { model: 'HAL-77', shift: -21 } },
];

// Build the lab's controls once; after that only the outputs are updated, so
// dragging a slider stays smooth.
function buildLab() {
  const { base } = state;
  const byPart = {};
  for (const d of base.deliveries) (byPart[d.part] ??= []).push(d);
  $('#lab-delivery').innerHTML = Object.entries(byPart).map(([part, ds]) => `<optgroup label="${esc(part)} · ${esc(base.parts.find((p) => p.id === part).name)}">${ds.map((d) =>
    `<option value="${d.id}">${d.id} · ${n(d.qty)} units · ${d.eta ? fmtDate(d.eta, true) : 'no date'}${d.status === 'rejected' ? ' (rejected)' : ''}</option>`).join('')}</optgroup>`).join('');
  $('#lab-model').innerHTML = [...base.models].sort((a, b) => a.launchDate.localeCompare(b.launchDate)).map((m) => `<option value="${m.id}">${esc(m.name)} · launches ${fmtDate(m.launchDate, true)}</option>`).join('');
  $('#lab-presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-preset="${i}">${esc(p.label)}</button>`).join('');
  $('#lab-wall').innerHTML = [...base.models].sort((a, b) => a.launchDate.localeCompare(b.launchDate) || a.id.localeCompare(b.id)).map((m) =>
    `<a role="listitem" href="#launch" class="tile" data-tile="${m.id}" data-open="${m.id}"><span class="t-name">${esc(m.name)}</span><span class="t-date"></span><span class="t-status"></span><span class="t-was"></span></a>`).join('');
  $('#lab-asof').textContent = `as of ${fmtDate(base.config.asOf, true)}`;
  $('#lab').dataset.built = '1';
}

function syncLabControls() {
  const l = state.lab;
  const d = state.base.deliveries.find((x) => x.id === l.delivery);
  $('#lab-delivery').value = l.delivery;
  $('#lab-model').value = l.model;
  document.querySelectorAll('[name=lab-mode]').forEach((r) => { r.checked = r.value === l.mode; });
  $('#lab-delay').min = DELAY_MIN; $('#lab-delay').max = DELAY_MAX; $('#lab-delay').value = l.delay; $('#lab-delay').disabled = l.mode !== 'delay' || !d.eta || d.status === 'rejected';
  $('#lab-shift').value = l.shift;
  const sup = state.base.suppliers.find((s) => s.id === d.supplier)?.name.replace(' (fictional)', '') ?? d.supplier;
  $('#lab-delivery-info').textContent = `${n(d.qty)} × ${d.part} from ${sup}${d.forChipset ? `, ordered for ${d.forChipset}` : ''}. ${d.eta ? `Due ${fmtDate(d.eta)}` : 'No date'}${d.status !== 'confirmed' ? ` (${d.status})` : ''}.`;
  $('#lab-delay-out').textContent = l.mode !== 'delay' ? '–' : !d.eta ? 'no date to shift' : l.delay === 0 ? `on time, ${fmtDate(d.eta, true)}` : `${fmtDate(addDays(d.eta, l.delay), true)} (${l.delay > 0 ? '+' : ''}${l.delay} days)`;
  const m = state.base.models.find((x) => x.id === l.model);
  $('#lab-shift-out').textContent = l.shift === 0 ? `as planned, ${fmtDate(m.launchDate, true)}` : `${fmtDate(addDays(m.launchDate, l.shift), true)} (${l.shift > 0 ? '+' : ''}${l.shift} days)`;
  const dateIn = $('#lab-date');
  dateIn.disabled = $('#lab-delay').disabled;
  if (d.eta) { dateIn.min = addDays(d.eta, DELAY_MIN); dateIn.max = addDays(d.eta, DELAY_MAX); if (document.activeElement !== dateIn) dateIn.value = addDays(d.eta, l.delay); }
  $('#lab-date-hint').textContent = d.eta ? `Allowed: ${fmtDate(dateIn.min, true)} – ${fmtDate(dateIn.max, true)}` : '';
  $('#lab-date-hint').classList.remove('bad');
}

let lastStatus = {};
/** Count a number from one value to another (skipped under reduced motion). */
function tickCount(el, from, to) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = 500;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
  el.classList.add('ticking'); requestAnimationFrame(step); setTimeout(() => el.classList.remove('ticking'), dur + 50);
}
function renderIntro() {
  if (!$('#lab').dataset.built) buildLab();
  syncLabControls();
  const r = state.result;
  const base = state.baseline;
  // counts with change against today
  const counts = { ready: 0, 'at-risk': 0, blocked: 0 }; const was = { ready: 0, 'at-risk': 0, blocked: 0 };
  r.models.forEach((m) => counts[m.status]++); base.models.forEach((m) => was[m.status]++);
  $('#lab-counts').innerHTML = Object.keys(counts).map((s) => {
    const dlt = counts[s] - was[s];
    return `<div class="lc ${s}"><span class="lc-icon" aria-hidden="true">${ICON[s]}</span><strong>${counts[s]}</strong><span>${LABEL[s]}</span>${dlt ? `<em>${dlt > 0 ? '+' : ''}${dlt}</em>` : ''}</div>`;
  }).join('');
  $('#lab-label').textContent = state.active.length || labChanged()
    ? [...state.active.map((k) => SCENARIOS[k].title), labChanged() ? labSummary() : ''].filter(Boolean).join(' + ') : 'Today, nothing changed';
  // What changed since the last edit (not since the original plan), so each
  // change gets its own message, and the counts tick to their new values.
  const prev = Object.keys(lastStatus).length ? lastStatus : null;
  if (prev) {
    const RANKS = { ready: 0, 'at-risk': 1, blocked: 2 };
    const worse = r.models.filter((m) => prev[m.id] && RANKS[m.status] > RANKS[prev[m.id]]);
    const better = r.models.filter((m) => prev[m.id] && RANKS[m.status] < RANKS[prev[m.id]]);
    const names = (xs) => xs.map((m) => m.name).join(', ');
    const msg = [worse.length ? `${worse.length} more launch${worse.length > 1 ? 'es' : ''} now need${worse.length > 1 ? '' : 's'} attention: ${names(worse)}` : '',
      better.length ? `${better.length} launch${better.length > 1 ? 'es' : ''} back on track: ${names(better)}` : ''].filter(Boolean).join(' · ');
    const el = $('#lab-delta');
    if (msg) { el.textContent = msg; el.className = `lab-delta ${worse.length ? 'worse' : 'better'}`; el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    for (const s of Object.keys(counts)) {
      const from = Object.values(prev).filter((x) => x === s).length;
      if (from !== counts[s]) tickCount($(`.lc.${s} strong`), from, counts[s]);
    }
  }
  // tiles: update in place and flash the ones whose status just changed
  for (const m of r.models) {
    const t = $(`[data-tile="${m.id}"]`);
    const before = base.models.find((x) => x.id === m.id);
    t.className = `tile ${m.status}${before.status !== m.status || before.launchDate !== m.launchDate ? ' moved' : ''}`;
    t.querySelector('.t-date').textContent = fmtDate(m.launchDate, true) + (before.launchDate !== m.launchDate ? ' ✎' : '');
    t.querySelector('.t-status').innerHTML = `<b aria-hidden="true">${ICON[m.status]}</b>${LABEL[m.status]}`;
    t.querySelector('.t-was').textContent = before.status !== m.status ? `was ${LABEL[before.status]}` : '';
    t.title = m.status === 'ready' ? `${m.name}: Ready` : `${m.name}: ${mainReason(m, r)}`.replace(/\d{4}-\d{2}-\d{2}/g, (x) => fmtDate(x, true));
    if (lastStatus[m.id] && lastStatus[m.id] !== m.status) { t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
    lastStatus[m.id] = m.status;
  }
  // Three questions a visitor asks: which launches, what changed, what next?
  const effects = knockOn(base, r, state.data);
  const STAGES = [['parts', 'Parts'], ['testing', 'Testing'], ['software', 'Software'], ['launch', 'Launch']];
  const attention = r.models.filter((m) => state.affected.models.includes(m.id));
  if (!state.active.length && !labChanged() && !state.demo.actions.length) {
    $('#lab-trail').innerHTML = `<p class="trail-empty">Change something on the left, or press <b>Try a supplier delay</b>. You'll see which launches need attention, what changed step by step (<b>parts</b> → <b>testing</b> → <b>software</b> → <b>launch</b>), and what you can do next.</p>`;
  } else if (!effects.length && !attention.length) {
    $('#lab-trail').innerHTML = `<p class="trail-empty">No launch is affected. Free stock and schedule slack absorb this change. Try a bigger shift, or a shipment that's already tight.</p>`;
  } else {
    $('#lab-trail').innerHTML = `
      <div class="qa"><h4>Which launches need attention?</h4>${attention.length ? `<ul class="attn">${attention.map((m) => `<li>${pill(m.status)}<span>${esc(m.status === 'ready' ? `${m.name}: software now expected ${fmtDate(m.eta.early, true)}–${fmtDate(m.eta.late, true)}, later than planned but still inside the buffer.` : explain(m, r, state.data))}</span></li>`).join('')}</ul>` : '<p class="trail-empty">None: every launch is back on plan.</p>'}</div>
      ${effects.length ? `<div class="qa"><h4>What changed, step by step?</h4><ol class="trail-steps">${STAGES.map(([k, t]) => {
        const items = effects.filter((e) => e.stage === k);
        return `<li class="ts ${items.length ? 'hit' : ''}"><h5>${t}</h5>${items.length ? `<ul>${items.slice(0, 4).map((e) => `<li class="${e.status}">${esc(e.text)}</li>`).join('')}${items.length > 4 ? `<li class="more">+${items.length - 4} more</li>` : ''}</ul>` : '<p>No change</p>'}</li>`;
      }).join('')}</ol></div>` : ''}
      ${attention.some((m) => m.status !== 'ready') ? `<div class="qa next"><div><h4>What can we do next?</h4><p>Compare recovery options, each with its expected result, trade-off and who must approve it.</p></div><a class="button accent" id="lab-cta" href="#agent">Compare recovery options →</a></div>` : ''}`;
  }

  // The example story: original plan, after the delay, after the recommended
  // recovery. Everything is calculated from the USB delay scenario.
  if ($('#story').dataset.built) return;
  const usbData = SCENARIOS.usbDelay.apply(state.base);
  const usb = computeAll(usbData);
  const rec = recoveryOptions(state.baseline, usbData).recommended;
  const fixed = rec ? computeWith(usbData, [rec]).result : null;
  const cfg = state.base.config;
  const card = (title, res, data, extra) => {
    const m = res.models.find((x) => x.id === 'HAL-77');
    const c = res.chipsets[m.chipset];
    const cutoff = addDays(m.launchDate, -cfg.bufferDays);
    return `<li class="story-step ${m.status}"><span class="kicker">${title}</span><p class="story-status">${pill(m.status)} <strong>${esc(m.name)}</strong> launches ${fmtDate(m.launchDate, true)}</p>
      <p>${esc(m.status === 'ready' ? `On track: testing starts ${fmtDate(c.eta.testStart, true)} and the software is expected ${fmtDate(m.eta.early, true)}–${fmtDate(m.eta.late, true)}, before the ${fmtDate(cutoff, true)} cutoff.` : explain(m, res, data))}</p>${extra}</li>`;
  };
  const dl = usbData.deliveries.find((d) => d.id === 'DL-UC3-01');
  $('#story').innerHTML = card('1 · Original plan', state.baseline, state.base, '') +
    card('2 · After the delay', usb, usbData, `<p class="story-note">USB controller delivery moved ${fmtDate(dl.originalEta, true)} → <mark>${fmtDate(dl.eta, true)}</mark></p>`) +
    (rec ? card('3 · After recovery', fixed, usbData, `<p class="story-note"><b>Action:</b> ${esc(rec.title)}<br><b>Trade-off:</b> ${esc(rec.tradeoffs[0])}<br><b>Approval:</b> ${esc(rec.approval)}</p>`) : '');
  $('#story').dataset.built = '1';
  // Facts for the animated TV scene in the hero, from the same calculation.
  if (rec) {
    const hal = (res) => res.models.find((x) => x.id === 'HAL-77');
    const [m0, m1, m2] = [hal(state.baseline), hal(usb), hal(fixed)];
    const tb = usb.lines.find((l) => l.kind === 'test-boards' && l.chipset === m1.chipset && (l.lateQty || l.shortfall));
    const orig = state.base.deliveries.find((x) => x.id === dl.id);
    const sw = (m) => `${fmtDate(m.eta.early, true)}–${fmtDate(m.eta.late, true)}`;
    initScene($('#scene'), $('#scene-controls'), {
      part: state.base.parts.find((p) => p.id === dl.part).name, chip: m1.chipset, model: m1.name, launch: fmtDate(m1.launchDate, true),
      dueFrom: fmtDate(orig.eta, true), dueTo: fmtDate(dl.eta, true), slip: daysBetween(dl.eta, orig.eta),
      lateQty: n(tb.lateQty || tb.shortfall), qty: n(tb.qty), testFrom: fmtDate(state.baseline.chipsets[m0.chipset].eta.testStart, true),
      testTo: fmtDate(usb.chipsets[m1.chipset].eta.testStart, true), swFrom: sw(m0), swTo: sw(m1), swFixed: sw(m2),
      cutoff: fmtDate(addDays(m1.launchDate, -cfg.bufferDays), true), fixTitle: rec.title.replace(/^Move/, 'move'),
      fixArrive: rec.arrive ? fmtDate(rec.arrive, true) : '', fixTest: fmtDate(fixed.chipsets[m2.chipset].eta.testStart, true),
    });
  }
}

// Lab inputs: recompute and refresh only the start page (no full re-render).
function labUpdate(patch) {
  Object.assign(state.lab, patch);
  computeState();
  renderScenarioBar();
  renderIntro();
}
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'lab-delay') labUpdate({ delay: +e.target.value });
  else if (id === 'lab-shift') labUpdate({ shift: +e.target.value });
});

const VIEWS = { intro: renderIntro, launch: renderLaunch, software: renderSoftware, supply: renderSupply, agent: () => renderAgent($('#agent-panel')) };
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
  const play = e.target.closest('[data-play]');
  if (play) { if (!state.active.includes(play.dataset.play)) state.active = [...state.active, play.dataset.play]; state.open.add('HAL-77'); location.hash = 'launch'; return recompute(); }
  const affBtn = e.target.closest('[data-aff]');
  if (affBtn) { state.affectedOnly = affBtn.dataset.aff === '1'; return render(); }
  const gc = e.target.closest('[data-goto-chipset]');
  if (gc) { state.filters.chipset = gc.dataset.gotoChipset; state.filters.part = ''; state.filters.line = ''; return; }
  const gp = e.target.closest('[data-goto-part]');
  if (gp) { state.filters.part = gp.dataset.gotoPart; state.filters.chipset = ''; return; }
  if (sceneClick(e)) return;
  const ts = e.target.closest('[data-tour-start]');
  if (ts) return startTour();
  if (tourClick(e)) return;
  const go = e.target.closest('[data-preset-go]');
  if (go) {
    if (currentView() !== 'intro') { history.pushState(null, '', '#intro'); render(); }
    labUpdate({ ...LAB0, ...PRESETS[+go.dataset.presetGo].lab });
    document.querySelector('.lab-out').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const pre = e.target.closest('[data-preset]');
  if (pre) {
    labUpdate({ ...LAB0, ...PRESETS[+pre.dataset.preset].lab });
    // on narrow screens the results sit below the controls: bring them into view
    if (innerWidth < 1020) document.querySelector('.lab-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (e.target.id === 'lab-reset') return labUpdate({ ...LAB0 });
  const opener = e.target.closest('[data-open]');
  if (opener) {
    // Go straight to that launch's details, even if it isn't affected.
    e.preventDefault();
    if (currentView() !== 'launch') history.pushState(null, '', '#launch');
    return selectModel(opener.dataset.open);
  }
  if (sc) {
    const k = sc.dataset.scenario;
    state.active = state.active.includes(k) ? state.active.filter((x) => x !== k) : [...state.active, k];
    return recompute();
  }
  const row = e.target.closest('[data-model]');
  if (row) { const id = row.dataset.model; state.open.has(id) ? state.open.delete(id) : state.open.add(id); return render(); }
  const cnt = e.target.closest('[data-status]');
  if (cnt) { state.filters.status = state.filters.status === cnt.dataset.status ? '' : cnt.dataset.status; return render(); }
  if (e.target.id === 'reset') { state.lab = { ...LAB0 }; state.demo = initialDemo(); state.affectedOnly = true; resetAgent(); endTour(); lastStatus = {}; $('#lab-delta').hidden = true; state.active = []; state.open.clear(); state.filters = { line: '', chipset: '', status: '', part: '' }; recompute(); }
});
document.addEventListener('change', (e) => {
  if (agentChange(e, render)) return;
  const id = e.target.id;
  if (id === 'lab-delivery') return labUpdate({ delivery: e.target.value, mode: 'delay', delay: 0 });
  if (id === 'lab-date') {
    const d = state.base.deliveries.find((x) => x.id === state.lab.delivery);
    const v = e.target.value;
    const days = /^\d{4}-\d{2}-\d{2}$/.test(v) ? daysBetween(v, d.eta) : NaN;
    if (Number.isNaN(days) || days < DELAY_MIN || days > DELAY_MAX) {
      $('#lab-date-hint').textContent = `Pick a date between ${fmtDate(e.target.min, true)} and ${fmtDate(e.target.max, true)} (up to ${-DELAY_MIN} days early or ${DELAY_MAX} days late).`;
      $('#lab-date-hint').classList.add('bad');
      return;
    }
    return labUpdate({ delay: days });
  }
  if (id === 'lab-model') return labUpdate({ model: e.target.value, shift: 0 });
  if (e.target.name === 'lab-mode') return labUpdate({ mode: e.target.value, delay: 0 });
  const f = e.target.dataset.filter;
  if (f) { state.filters[f] = e.target.value; render(); }
});
window.addEventListener('hashchange', () => { render(); const t = document.getElementById(location.hash.slice(1)); if (t && !(location.hash.slice(1) in VIEWS)) t.scrollIntoView(); else window.scrollTo(0, 0); });
window.addEventListener('popstate', () => render());

(async () => {
  try {
    state.base = await loadData('./data/');
    state.baseline = computeAll(state.base);
    state.lab = { ...LAB0 };
    $('#asof').textContent = fmtDate(state.base.config.asOf);
    const b = state.base;
    const ev = [[b.models.length, 'TV models'], [b.chipsets.length, 'chipsets'], [b.tickets.length, 'software tickets'], [b.deliveries.length, 'supplier deliveries'], [32, 'automated tests on the engine']];
    $('#evidence').innerHTML = ev.map(([v, l]) => `<li><b>${v}</b><span>${l}</span></li>`).join('') + '<li class="ev-note">All fictional. The recovery workflow is simulated: scripted steps, calculated results.</li>';
    initAgent({
      get: () => ({ base: state.base, baseline: state.baseline, disrupted: state.disrupted, data: state.data, result: state.result, demo: state.demo, active: state.active, lab: state.lab }),
      approve: (opt, summarize) => { state.demo = decide(state.demo, opt, true); computeState(); state.demo.log.at(-1).result = summarize(state.result); renderScenarioBar(); },
      reject: (opt) => { state.demo = decide(state.demo, opt, false, 'Nothing changed'); renderScenarioBar(); },
      startDefault: () => { state.lab = { ...LAB0, delay: 34 }; recompute(); },
    });
    initTour({
      preset: (i) => { state.active = []; state.demo = initialDemo(); resetAgent(); state.open.clear(); state.affectedOnly = true; labUpdate({ ...LAB0, ...PRESETS[i].lab }); },
      chain: () => {
        const fx = knockOn(state.baseline, state.result, state.data);
        return ['parts', 'testing', 'software', 'launch'].map((k) => fx.find((e) => e.stage === k)?.text).filter(Boolean);
      },
      view: (v) => { if (currentView() !== v) history.pushState(null, '', `#${v}`); render(); },
      agentStep: (i) => agentSetStep(i),
      approveIfPending: () => { if (!state.demo.actions.length) agentApproveSelected(); renderScenarioBar(); },
      outcome: () => agentOutcome(),
    });
    recompute();
  } catch (err) {
    $('#main').innerHTML = `<p class="empty">Could not load the demo data (${esc(err.message)}). If you opened the file directly, serve the folder instead: <code>python3 -m http.server</code>.</p>`;
  }
})();
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (currentView() === 'launch') render(); }, 150); });
