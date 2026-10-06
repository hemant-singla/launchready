// Recovery agent page: a SIMULATED agent workflow.
// The steps and their wording are scripted (deterministic, no AI model runs in
// the browser). Every number, status and option on the page is calculated now
// by the tested code in src/ (recovery.js -> engine.js). Approving an option
// changes the demo data; rejecting only records the decision.
import { recoveryOptions } from '../src/recovery.js';
import { explain } from '../src/lab.js';
import { fmtDate, daysBetween, addDays } from '../src/dates.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x) => Number(x).toLocaleString('en-US');
const LABEL = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };
const ICON = { ready: '✓', 'at-risk': '!', blocked: '✕' };
const pill = (s) => `<span class="pill ${s}"><b aria-hidden="true">${ICON[s]}</b>${LABEL[s]}</span>`;
const pretty = (t) => esc(t).replace(/\d{4}-\d{2}-\d{2}/g, (d) => fmtDate(d, true));
const range = (a, b) => (a ? `${fmtDate(a, true)} – ${fmtDate(b, true)}` : 'unknown');
const SCRIPTED = '<span class="tag-src scripted" title="Fixed wording written for this demo">Scripted step</span>';
const CALC = '<span class="tag-src calc" title="Calculated in your browser by the tested engine">Calculated now</span>';

const STEPS = ['Detect', 'Retrieve', 'Impact', 'Compare', 'Recommend', 'Decide'];
const ui = { step: 0, selected: null, outcome: null, cacheKey: '', cache: null };
let api; // set by initAgent: { get(), approve(opt), reject(opt), startDefault() }

export function initAgent(a) { api = a; }
export function resetAgent() { lastPreview = ''; Object.assign(ui, { step: 0, selected: null, outcome: null, cacheKey: '', cache: null }); }

function analysis(s) {
  const key = JSON.stringify([s.active, s.lab, s.demo.actions]);
  if (key !== ui.cacheKey) { ui.cacheKey = key; ui.cache = recoveryOptions(s.baseline, s.disrupted, s.demo.actions); }
  return ui.cache;
}

/** What differs between the original data and the disrupted data. */
function disruptions(base, d) {
  const out = [];
  for (const x of d.deliveries) {
    const o = base.deliveries.find((y) => y.id === x.id);
    if (!o) continue;
    const what = `${n(x.qty)} × ${x.part} (${x.id}${x.forChipset ? `, for ${x.forChipset}` : ''})`;
    if (x.status === 'rejected' && o.status !== 'rejected') out.push(`${what}: rejected at inspection`);
    else if (!x.eta && o.eta) out.push(`${what}: supplier withdrew the date (was ${fmtDate(o.eta, true)})`);
    else if (x.eta && o.eta && x.eta !== o.eta) out.push(`${what}: now ${fmtDate(x.eta, true)}, was ${fmtDate(o.eta, true)} (${daysBetween(x.eta, o.eta) > 0 ? '+' : ''}${daysBetween(x.eta, o.eta)} days)`);
  }
  for (const m of d.models) {
    const o = base.models.find((y) => y.id === m.id);
    if (o.launchDate !== m.launchDate) out.push(`${m.name} launch moved to ${fmtDate(m.launchDate, true)} (was ${fmtDate(o.launchDate, true)})`);
  }
  return out;
}

const lineName = (l, d) => (l.kind === 'test-boards' ? `${l.chipset} test boards` : `${d.models.find((m) => m.id === l.model).name} production`);

function stepCard(i, title, narration, body) {
  return `<li class="astep ${i === ui.step ? 'current' : ''}" id="astep-${i}"><div class="astep-n" aria-hidden="true">${i + 1}</div><div class="astep-body">
    <h3>${title}</h3><p class="narr">${SCRIPTED} ${narration}</p>${body}</div></li>`;
}

function optionRow(o, rec) {
  const sel = ui.selected === o.key;
  const restored = o.models.filter((m) => m.restored).map((m) => m.name);
  const notRestored = o.models.filter((m) => !m.restored).map((m) => `${m.name} (${LABEL[m.after]})`);
  const result = `${restored.length ? `Restores ${restored.join(', ')}.` : 'Improves the situation but restores no launch.'}${notRestored.length ? ` Still unresolved: ${notRestored.join(', ')}.` : ''}${o.remaining.length ? ` ${o.remaining.length} build${o.remaining.length > 1 ? 's' : ''} still short or late.` : ''}`;
  return `<label class="opt ${sel ? 'on' : ''}"><input type="radio" name="agent-opt" value="${esc(o.key)}" ${sel ? 'checked' : ''}>
    <span class="opt-main"><strong>${esc(o.title)}</strong>${o.key === rec?.key ? ' <em class="tag rec-tag">Recommended</em>' : ''}
      <dl class="opt-dl"><div><dt>Action</dt><dd>${esc(o.detail)}</dd></div>
      <div><dt>Expected result</dt><dd>${esc(result)} <span class="opt-res">${o.models.map((m) => `${pill(m.after)}`).join(' ')}</span></dd></div>
      <div><dt>Trade-off</dt><dd>${esc(o.tradeoffs.join('; '))}</dd></div>
      <div><dt>Approval needed</dt><dd>${esc(o.approval)}</dd></div></dl></span></label>`;
}

export function renderAgent(root) {
  const s = api.get();
  const intro = `<div class="agent-banner"><strong>Simulated agent workflow.</strong> The steps and their wording are scripted; no AI model runs on this page.
    Everything marked ${CALC} is calculated in your browser by the same tested code as the rest of the app.
    <a href="#about">How this differs from a live AI agent</a></div>`;
  const a = analysis(s);
  const banner = ui.outcome ? `<p class="outcome" role="status">${esc(ui.outcome)}</p>` : '';
  const log = s.demo.log.length ? `<ol class="log-list">${[...s.demo.log].reverse().map((l) => `<li class="${l.decision}"><span class="log-n">#${l.n}</span><span class="log-d">${l.decision === 'note' ? 'Note' : l.decision === 'approved' ? '✓ Approved' : '✕ Rejected'}</span><span>${esc(l.title)}${l.result ? `<small>${esc(l.result)}</small>` : ''}</span></li>`).join('')}</ol>` : '<p class="fine">No decisions yet.</p>';
  const logHtml = `<section class="log card" aria-labelledby="log-h"><h2 id="log-h">Activity log</h2>${log}<p class="fine">Reset demo (top of the page) clears decisions and this log.</p></section>`;

  const dis = disruptions(s.base, s.disrupted);
  if (!dis.length && !s.demo.actions.length) {
    root.innerHTML = `${intro}${banner}<div class="card agent-start"><h2>No disruption to work on yet</h2>
      <p>Start with one supplier delay, or set your own on the Start page (any shipment, any date).</p>
      <div class="actions"><button type="button" class="button accent" data-agent-start>Delay the USB controller shipment by 34 days</button><a class="button-link" href="#intro">Set my own delay</a></div></div>${logHtml}`;
    return;
  }
  if (!a.affected.models.length) {
    root.innerHTML = `${intro}<div class="card agent-start"><h2>${s.demo.actions.length ? 'All affected launches are back on plan' : 'This change does not affect any launch'}</h2>
      <p>${s.demo.actions.length ? 'The approved actions are applied to the demo data. Every view now shows the recovered plan.' : 'Free stock and schedule slack absorb it. Try a bigger delay or another shipment on the Start page.'}</p>
      <div class="actions"><a class="button" href="#launch">See the launch view</a></div></div>${banner}${logHtml}`;
    return;
  }

  const { now } = a;
  const d = s.data;
  if (!ui.selected || !a.options.some((o) => o.key === ui.selected)) ui.selected = a.recommended?.key ?? null;
  const sel = a.options.find((o) => o.key === ui.selected);
  const affLines = now.lines.filter((l) => a.affected.lines.includes(l.id));
  const affModels = a.affected.models.map((id) => now.models.find((m) => m.id === id));
  const origOf = (id) => s.baseline.models.find((m) => m.id === id);
  const cards = [];

  cards.push(stepCard(0, 'Detect the supplier change', 'The agent compares current supplier data with the original plan and flags what moved.',
    `<div class="calc">${CALC}<ul>${dis.map((x) => `<li>${esc(x)}</li>`).join('')}${s.demo.actions.length ? `<li>${s.demo.actions.length} recovery action${s.demo.actions.length > 1 ? 's' : ''} already approved (see the log)</li>` : ''}</ul></div>`));

  cards.push(stepCard(1, 'Retrieve supply and software records', 'It pulls the builds that use the affected parts and the software schedule of the affected chipsets.',
    `<div class="calc">${CALC}<div class="table-scroll"><table class="data-table small"><caption>Builds affected</caption><thead><tr><th>Build</th><th>Part</th><th>Needed</th><th>Qty</th><th>Covered from</th><th>Gap</th></tr></thead><tbody>
      ${affLines.map((l) => `<tr><th scope="row">${esc(lineName(l, d))}</th><td>${l.part}</td><td>${fmtDate(l.needDate, true)}</td><td class="num">${n(l.qty)}</td>
        <td>${l.allocations.map((x) => `${x.source.startsWith('STOCK') ? 'stock' : x.source} ${n(x.qty)}${x.date > l.needDate ? ` (${fmtDate(x.date, true)})` : ''}`).join(' + ') || '–'}</td>
        <td class="${l.shortfall || l.lateQty ? 'bad' : ''}">${l.shortfall ? `${n(l.shortfall)} short` : ''}${l.shortfall && l.lateQty ? ', ' : ''}${l.lateQty ? `${n(l.lateQty)} late ${l.lateDays} d` : ''}${!l.shortfall && !l.lateQty ? 'tight' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${a.affected.chipsets.length ? `<div class="table-scroll"><table class="data-table small"><caption>Software schedule</caption><thead><tr><th>Chipset</th><th>Testing planned</th><th>Testing now</th><th>Software ready</th></tr></thead><tbody>
      ${a.affected.chipsets.map((id) => { const c = now.chipsets[id]; return `<tr><th scope="row">${id}</th><td>${fmtDate(c.plannedTestStart, true)}</td><td class="${c.eta.slipDays > 0 ? 'bad' : ''}">${c.eta.known ? `${fmtDate(c.eta.testStart, true)}${c.eta.slipDays > 0 ? ` (+${c.eta.slipDays} d)` : ''}` : 'unknown'}</td><td>${range(c.eta.early, c.eta.late)}</td></tr>`; }).join('')}
      </tbody></table></div>` : ''}</div>`));

  cards.push(stepCard(2, 'Calculate affected launches', 'It recalculates every launch and keeps the ones that got worse than the original plan.',
    `<div class="calc">${CALC}<div class="table-scroll"><table class="data-table small"><thead><tr><th>Launch</th><th>Date</th><th>Original</th><th>Now</th><th>Why</th></tr></thead><tbody>
      ${affModels.map((m) => `<tr><th scope="row"><a href="#launch" data-open="${m.id}">${esc(m.name)}</a></th><td>${fmtDate(m.launchDate, true)}</td><td>${pill(origOf(m.id).status)}</td><td>${pill(m.status)}</td><td>${esc(m.status === 'ready' ? `Software now expected ${range(m.eta.early, m.eta.late)}, later than planned but still inside the buffer.` : explain(m, now, d))}</td></tr>`).join('')}
      </tbody></table></div></div>`));

  const preview = sel ? previewHtml(sel, now, affLines, d) : '';
  const considered = a.considered.length ? `<details class="considered"><summary>Considered but not offered (${a.considered.length})</summary><ul>${a.considered.map((o) => `<li><strong>${esc(o.title)}</strong>: ${esc(o.why)}</li>`).join('')}</ul></details>` : '';
  const compare = sel ? `<div class="table-scroll"><table class="data-table compare"><caption>Original plan vs current disruption vs this option</caption>
    <thead><tr><th scope="col">Launch</th><th scope="col">Original plan</th><th scope="col">Current disruption</th><th scope="col">With: ${esc(sel.title)}</th></tr></thead><tbody>
    ${sel.models.map((m) => { const o = origOf(m.id); const b = now.models.find((x) => x.id === m.id); return `<tr><th scope="row">${esc(m.name)}<small>launch ${fmtDate(m.launch, true)}</small></th>
      <td>${pill(o.status)}<small>SW ${range(o.eta.early, o.eta.late)}</small></td><td>${pill(b.status)}<small>SW ${range(b.eta.early, b.eta.late)}</small></td><td>${pill(m.after)}<small>SW ${range(m.eta[0], m.eta[1])}</small></td></tr>`; }).join('')}
    ${sel.testStarts.map((t) => `<tr><th scope="row">${t.id} testing starts</th><td>${fmtDate(t.planned, true)}</td><td>${t.before ? fmtDate(t.before, true) : 'unknown'}</td><td>${t.after ? fmtDate(t.after, true) : 'unknown'}</td></tr>`).join('')}
    <tr><th scope="row">Units short or late</th><td>0</td><td>${n(affLines.reduce((x, l) => x + l.shortfall + l.lateQty, 0))}</td><td>${n(sel.remaining.reduce((x, l) => x + l.shortfall + l.lateQty, 0))}</td></tr>
    </tbody></table></div>` : '';
  cards.push(stepCard(3, 'Compare recovery options', 'It generates every action the data allows (re-pegging a purchase order, an approved substitute, a later launch date), tests each one, and drops any that do not help or that hurt another launch.',
    `<div class="calc">${CALC}${a.options.length ? `<fieldset class="opts"><legend class="sr">Recovery options</legend>${a.options.map((o) => optionRow(o, a.recommended)).join('')}</fieldset>${preview}${compare}` : '<p class="bad">No eligible action improves the affected launches.</p>'}${considered}
      ${a.escalation ? `<p class="escalate"><strong>Needs escalation.</strong> ${esc(a.escalation)}</p>` : ''}</div>`));

  const rec = sel;
  cards.push(stepCard(4, 'Recommend an action', rec ? (rec.key === a.recommended?.key ? 'It ranks the options: most launches restored first, then the least disruptive action, then the earliest software date.' : 'You picked a different option than the agent ranked first; here is the evidence for your pick.') : 'Nothing to recommend.',
    rec ? `<div class="calc">${CALC}<h4>${esc(rec.title)}</h4><div class="split2"><div><h5>Evidence</h5><ul>
      ${rec.models.map((m) => `<li>${esc(m.name)}: ${LABEL[m.disrupted]} → <strong>${LABEL[m.after]}</strong>; software ready ${range(m.eta[0], m.eta[1])} vs cutoff ${fmtDate(addDays(m.launch, -d.config.bufferDays), true)}</li>`).join('')}
      ${rec.testStarts.map((t) => `<li>${t.id} testing starts ${t.after ? fmtDate(t.after, true) : 'unknown'} (planned ${fmtDate(t.planned, true)})</li>`).join('')}
      <li>${rec.remaining.length ? `${rec.remaining.length} build(s) still short or late: ${rec.remaining.map((x) => pretty(x.reason)).join('; ')}` : 'No affected build is left short or late'}</li>
      <li>No other launch gets worse (checked across all 16)</li></ul></div>
      <div><h5>Trade-offs</h5><ul>${rec.tradeoffs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><h5>Approval needed</h5><p>${esc(rec.approval)}</p></div></div></div>` : ''));

  cards.push(stepCard(5, 'Your decision', 'The agent never acts on its own. Approving applies the action to the demo data and recalculates every view; rejecting changes nothing.',
    `${rec ? `<div class="decide"><button type="button" class="button accent" data-agent-approve>Approve: ${esc(rec.title)}</button><button type="button" class="button-link" data-agent-reject>Reject</button></div>` : ''}
     `));

  const shown = cards.slice(0, ui.step + 1).join('');
  const more = ui.step < STEPS.length - 1;
  root.innerHTML = `${intro}${banner}<nav class="stepper" aria-label="Workflow steps">${STEPS.map((t, i) => `<button type="button" data-agent-goto="${i}" class="${i < ui.step ? 'done' : i === ui.step ? 'on' : ''}" ${i > ui.step ? 'disabled' : ''} aria-current="${i === ui.step ? 'step' : 'false'}"><b>${i + 1}</b>${t}</button>`).join('')}</nav>
    <ol class="asteps">${shown}</ol>
    ${more ? `<div class="replay-controls"><button type="button" class="button" data-agent-next>Next: ${STEPS[ui.step + 1]}</button><button type="button" class="button-link" data-agent-all>Show all steps</button></div>` : ''}
    ${logHtml}`;
  const pv = root.querySelector('[data-preview]');
  const pk = sel ? ui.cacheKey + sel.key : '';
  if (pv && pk !== lastPreview) { lastPreview = pk; playPreview(); } else pv?.classList.add('to');
}
let lastPreview = '';

/**
 * Visual preview of one option: where the part arrival, the start of testing,
 * the software range and the launch sit now (the disruption), and where the
 * option moves them. Rendered at the "now" positions, then animated to the
 * option's positions (instant under reduced motion). All dates are calculated.
 */
function previewHtml(sel, now, affLines, d) {
  const m = sel.models[0];
  const b = now.models.find((x) => x.id === m.id);
  const t = sel.testStarts.find((x) => x.id === b.chipset) ?? sel.testStarts[0];
  const line = affLines.find((l) => l.kind === 'test-boards' && l.chipset === b.chipset) ?? affLines[0];
  const cutoffBefore = addDays(b.launchDate, -d.config.bufferDays);
  const cutoffAfter = addDays(m.launch, -d.config.bufferDays);
  const partsAfter = sel.type === 'transfer' ? sel.arrive : sel.type === 'substitute' ? d.config.asOf : line?.readyDate;
  const rows = [];
  if (line && (line.readyDate || partsAfter)) rows.push({ label: `${line.part} for ${line.chipset} test boards`, kind: 'dot', from: line.readyDate ?? partsAfter, to: partsAfter ?? line.readyDate, ok: sel.type !== 'moveLaunch' && !sel.remaining.some((x) => x.id === line.id), note: sel.type === 'substitute' ? `substitute ${sel.sub.part} in stock` : sel.type === 'transfer' ? `re-pegged units arrive ${fmtDate(sel.arrive, true)}` : 'unchanged' });
  if (t?.before && t?.after) rows.push({ label: `${t.id} testing starts`, kind: 'dot', from: t.before, to: t.after, plan: t.planned, ok: t.after <= t.planned, note: `${fmtDate(t.after, true)} (planned ${fmtDate(t.planned, true)})` });
  if (b.eta.known && m.eta[0]) rows.push({ label: `Software ready (range)`, kind: 'bar', from: [b.eta.early, b.eta.late], to: [m.eta[0], m.eta[1]], cut: [cutoffBefore, cutoffAfter], ok: m.eta[1] <= cutoffAfter, note: `${range(m.eta[0], m.eta[1])} vs cutoff ${fmtDate(cutoffAfter, true)}` });
  rows.push({ label: `${m.name} launch`, kind: 'launch', from: b.launchDate, to: m.launch, sFrom: b.status, sTo: m.after, note: `${fmtDate(m.launch, true)} · ${LABEL[m.after]}` });
  const all = rows.flatMap((r) => [r.from, r.to, r.plan, r.cut]).flat().filter(Boolean).sort();
  const lo = addDays(all[0], -4), span = Math.max(1, daysBetween(addDays(all.at(-1), 4), lo));
  const x = (dt) => ((daysBetween(dt, lo) / span) * 100).toFixed(2);
  const row = (r) => {
    let mark;
    if (r.kind === 'bar') mark = `<span class="pv-cut" style="--a:${x(r.cut[0])}%;--b:${x(r.cut[1])}%" title="Cutoff"></span><span class="pv-bar pv-ghost" style="left:${x(r.from[0])}%;width:${x(r.from[1]) - x(r.from[0])}%"></span><span class="pv-bar" data-ok="${r.ok ? 1 : 0}" style="--a:${x(r.from[0])}%;--b:${x(r.to[0])}%;--wa:${x(r.from[1]) - x(r.from[0])}%;--wb:${x(r.to[1]) - x(r.to[0])}%"></span>`;
    else if (r.kind === 'launch') mark = `<span class="pv-launch pv-ghost" data-from="${r.sFrom}" style="left:${x(r.from)}%"></span><span class="pv-launch" data-from="${r.sFrom}" data-to="${r.sTo}" style="--a:${x(r.from)}%;--b:${x(r.to)}%"></span>`;
    else mark = `${r.plan ? `<span class="pv-plan" style="left:${x(r.plan)}%" title="Planned"></span>` : ''}<span class="pv-dot pv-ghost" style="left:${x(r.from)}%"></span><span class="pv-dot" data-ok="${r.ok ? 1 : 0}" style="--a:${x(r.from)}%;--b:${x(r.to)}%"></span>`;
    return `<div class="pv-row"><span class="pv-label">${esc(r.label)}</span><div class="pv-track">${mark}</div><span class="pv-note">${esc(r.note)}</span></div>`;
  };
  return `<figure class="preview" data-preview><figcaption><strong>Preview:</strong> what this option moves, from the current disruption to the result <button type="button" class="button-link" data-preview-replay>Replay</button></figcaption>
    ${rows.map(row).join('')}<p class="pv-legend"><span class="pv-k ghost"></span>current disruption <span class="pv-k cut"></span>software cutoff (launch − ${d.config.bufferDays} days) <span class="pv-k plan"></span>planned</p></figure>`;
}

/** Animate the preview from "now" to the option (call after rendering). */
export function playPreview() {
  const f = document.querySelector('[data-preview]');
  if (!f) return;
  f.classList.remove('to');
  void f.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.add('to')));
}

function approve(sel) {
  const before = api.get().result.models;
  api.approve(sel, (after) => {
    const changed = after.models.filter((m) => before.find((b) => b.id === m.id).status !== m.status).map((m) => `${m.name} ${LABEL[before.find((b) => b.id === m.id).status]} → ${LABEL[m.status]}`);
    return changed.length ? changed.join('; ') : 'No verdict changed';
  });
  ui.outcome = `Applied "${sel.title}". ${api.get().demo.log.at(-1).result}. Every view now uses the updated plan.`;
  ui.step = 3; ui.selected = null;
}

// Used by the guided tour.
export function agentSetStep(i) { ui.step = i; }
export function agentApproveSelected() {
  const s = api.get();
  const a = analysis(s);
  const sel = a.options.find((o) => o.key === (ui.selected ?? a.recommended?.key));
  if (sel) approve(sel);
  return sel;
}
export const agentOutcome = () => ui.outcome;

/** Click handling for the agent page. Returns true when handled. */
export function agentClick(e, rerender) {
  const t = e.target;
  const s = api.get();
  const a = ui.cache;
  if (t.closest('[data-preview-replay]')) { playPreview(); return true; }
  if (t.closest('[data-agent-start]')) { ui.step = 0; api.startDefault(); return true; }
  if (t.closest('[data-agent-next]')) { ui.step = Math.min(STEPS.length - 1, ui.step + 1); rerender(); focusStep(); return true; }
  if (t.closest('[data-agent-all]')) { ui.step = STEPS.length - 1; rerender(); focusStep(); return true; }
  if (t.closest('[data-agent-goto]')) { ui.step = +t.closest('[data-agent-goto]').dataset.agentGoto; rerender(); focusStep(); return true; }
  const sel = a?.options.find((o) => o.key === ui.selected);
  if (t.closest('[data-agent-approve]') && sel) { approve(sel); rerender(); return true; }
  if (t.closest('[data-agent-reject]') && sel) {
    api.reject(sel);
    ui.outcome = `Rejected "${sel.title}". Nothing changed; pick another option or adjust the disruption.`;
    rerender();
    return true;
  }
  return false;
}

export function agentChange(e, rerender) {
  if (e.target.name !== 'agent-opt') return false;
  ui.selected = e.target.value;
  ui.outcome = null;
  rerender();
  document.querySelector(`[name="agent-opt"][value="${CSS.escape(ui.selected)}"]`)?.focus();
  return true;
}

function focusStep() {
  const el = document.getElementById(`astep-${ui.step}`);
  if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
}
