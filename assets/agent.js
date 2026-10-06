// Agent panel: replays recorded agent runs (runs/<scenario>.json) step by step.
// The runs are real API runs recorded during the build; nothing here calls an
// AI model. Approve / Assign owner / Mark done only update this page's log.
import { SCENARIOS } from '../src/scenarios.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const runs = {};
const ui = { key: 'usbDelay', shown: 0, log: [], decision: {} };
const OWNERS = ['Launch manager', 'USB team lead', 'Software lead (Volga-X)', 'Procurement planner', 'Supply planner', 'Product line manager'];

async function loadRun(key) {
  if (key in runs) return runs[key];
  try {
    const res = await fetch(`./runs/${key}.json`);
    runs[key] = res.ok ? await res.json() : null;
  } catch { runs[key] = null; }
  return runs[key];
}

const TOOL_LABEL = {
  get_launch_overview: 'Looked up all launch verdicts', get_chipset_software: 'Checked chipset software',
  get_part_supply: 'Checked part supply', check_substitute: 'Checked the approved substitute',
  simulate_move_stock: 'Simulated moving stock', simulate_move_launch: 'Simulated moving a launch date', propose_plan: 'Proposed a plan',
};

function summarise(step) {
  const o = step.output ?? {};
  switch (step.name) {
    case 'get_launch_overview': {
      const c = { ready: 0, 'at-risk': 0, blocked: 0 };
      (o.models ?? []).forEach((m) => c[m.status]++);
      return `${c.ready} ready, ${c['at-risk']} at risk, ${c.blocked} blocked`;
    }
    case 'get_chipset_software': return o.error ?? `test start ${o.computed_test_start}; software ready ${Array.isArray(o.software_ready) ? o.software_ready.join(' to ') : o.software_ready}`;
    case 'get_part_supply': return o.error ?? `${(o.deliveries ?? []).length} deliveries; ${(o.builds_in_need_order ?? []).filter((b) => b.status !== 'ready').length} builds not ready`;
    case 'check_substitute': return o.possible ? `possible: ${o.substitutes.map((s) => s.part).join(', ')}, test start ${o.testStart.join(' to ')}` : `not possible: ${o.reason}`;
    case 'simulate_move_stock': case 'simulate_move_launch':
      return o.error ?? ((o.changed ?? []).map((c) => `${c.model}: ${c.before} → ${c.after}`).join('; ') || 'no verdict changes');
    default: return '';
  }
}

function stepHtml(s, i) {
  if (s.type === 'thinking') return `<li class="step think"><span class="step-n">${i + 1}</span><div><strong>Reasoning (summary)</strong><p>${esc(s.text)}</p></div></li>`;
  if (s.type === 'text') return `<li class="step note"><span class="step-n">${i + 1}</span><div><p>${esc(s.text)}</p></div></li>`;
  if (s.name === 'propose_plan') return `<li class="step tool"><span class="step-n">${i + 1}</span><div><strong>${TOOL_LABEL[s.name]}</strong><p class="fine">See the plan below.</p></div></li>`;
  return `<li class="step tool"><span class="step-n">${i + 1}</span><div><strong>${esc(TOOL_LABEL[s.name] ?? s.name)}</strong> <code>${esc(s.name)}(${esc(Object.values(s.input ?? {}).join(', '))})</code>
    <p>${esc(summarise(s))}</p><details><summary>Raw tool result</summary><pre>${esc(JSON.stringify(s.output, null, 2))}</pre></details></div></li>`;
}

function planHtml(run) {
  const p = run.plan;
  const d = ui.decision[run.scenario] ?? {};
  const owners = (sel) => `<select data-agent-owner="${sel}">${['', ...OWNERS].map((o) => `<option ${d.owners?.[sel] === o ? 'selected' : ''} value="${esc(o)}">${o || 'Assign owner…'}</option>`).join('')}</select>`;
  return `<section class="plan">
    <h2>Proposed plan</h2><p class="plan-head">${esc(p.headline)}</p>
    <h3>Impact chain</h3><ol>${p.impact.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <h3>Options</h3><div class="table-scroll"><table class="data-table small"><thead><tr><th>Option</th><th>Result (from simulation)</th><th>Trade-offs</th><th>Remaining gap</th></tr></thead><tbody>
      ${p.options.map((o) => `<tr><th scope="row">${esc(o.name)}</th><td>${esc(o.result)}</td><td>${esc(o.tradeoffs)}</td><td>${esc(o.remaining_gap)}</td></tr>`).join('')}</tbody></table></div>
    <h3>Recommendation</h3><p class="rec">${esc(p.recommendation)}</p>
    ${p.uncertainties.length ? `<h3>Uncertainties</h3><ul>${p.uncertainties.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <h3>Draft messages (not sent)</h3>
    <div class="msgs">${p.messages.map((m, i) => `<article class="msg"><header><strong>To: ${esc(m.to)}</strong><span>${esc(m.subject)}</span></header><p>${esc(m.body).replace(/\n/g, '<br>')}</p>
      <footer>${owners(i)} <button type="button" class="small-btn" data-agent-done="${i}" ${d.done?.[i] ? 'disabled' : ''}>${d.done?.[i] ? 'Done ✓' : 'Mark done'}</button></footer></article>`).join('')}</div>
    <div class="approve"><button type="button" class="button" data-agent-approve ${d.approved ? 'disabled' : ''}>${d.approved ? 'Plan approved ✓' : 'Approve plan'}</button>
      <span class="fine">Approving here only records the decision in the log below. In a real deployment it would send the drafts to their owners.</span></div>
  </section>`;
}

export async function renderAgent(root) {
  const run = await loadRun(ui.key);
  const tabs = Object.entries(SCENARIOS).map(([k, s]) => `<button type="button" class="scenario ${k === ui.key ? 'on' : ''}" data-agent-scenario="${k}">${esc(s.title)}</button>`).join('');
  let body;
  if (!run) {
    body = `<div class="card empty-card"><strong>No run recorded for this scenario yet.</strong><p>The agent code and its tools are built and tested, but the runs have not been recorded yet, so there is nothing to replay. They are recorded with <code>node agent/run.mjs</code> (see the README). Meanwhile, the Launch, Software and Supply views show the same calculations the agent uses.</p></div>`;
  } else {
    const shown = Math.min(ui.shown, run.steps.length);
    const done = shown >= run.steps.length;
    body = `<p class="run-label"><strong>${esc(run.label)}.</strong> Model ${esc(run.model)}, recorded ${esc(run.recorded_at.slice(0, 10))}; ${run.usage.requests} API requests, ${run.steps.filter((s) => s.type === 'tool').length} tool calls. Every number the agent used came back from the tools below.</p>
      <p class="fine">Scenario: ${esc(run.summary)}</p>
      <ol class="steps">${run.steps.slice(0, shown).map(stepHtml).join('')}</ol>
      <div class="replay-controls">${done ? '' : `<button type="button" class="button" data-agent-next>${shown ? 'Next step' : 'Start replay'}</button><button type="button" class="reset" data-agent-all>Show all steps</button>`}
        ${shown ? '<button type="button" class="reset" data-agent-restart>Restart</button>' : ''}</div>
      ${done ? planHtml(run) : ''}`;
  }
  const log = ui.log.filter((l) => l.scenario === ui.key);
  root.innerHTML = `<div class="scenario-buttons agent-tabs">${tabs}</div>${body}
    <section class="log"><h3>Activity log</h3>${log.length ? `<ul>${log.map((l) => `<li><time>${l.time}</time> ${esc(l.text)}</li>`).join('')}</ul>` : '<p class="fine">No actions yet.</p>'}</section>`;
}

/** Handles clicks inside the agent panel. Returns true if it handled the event. */
export function agentClick(e, rerender) {
  const t = e.target;
  const add = (text) => ui.log.unshift({ scenario: ui.key, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text });
  const d = (ui.decision[ui.key] ??= { owners: {}, done: {} });
  if (t.closest('[data-agent-scenario]')) { ui.key = t.closest('[data-agent-scenario]').dataset.agentScenario; ui.shown = 0; }
  else if (t.closest('[data-agent-next]')) ui.shown++;
  else if (t.closest('[data-agent-all]')) ui.shown = Infinity;
  else if (t.closest('[data-agent-restart]')) ui.shown = 0;
  else if (t.closest('[data-agent-approve]')) { d.approved = true; add('Plan approved by you (demo: nothing was sent).'); }
  else if (t.closest('[data-agent-done]')) { const i = t.closest('[data-agent-done]').dataset.agentDone; d.done[i] = true; add(`Marked done: "${runs[ui.key].plan.messages[i].subject}".`); }
  else return false;
  rerender();
  return true;
}

export function agentChange(e, rerender) {
  const sel = e.target.closest('[data-agent-owner]');
  if (!sel) return false;
  const d = (ui.decision[ui.key] ??= { owners: {}, done: {} });
  d.owners[sel.dataset.agentOwner] = sel.value;
  if (sel.value) ui.log.unshift({ scenario: ui.key, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: `Assigned "${runs[ui.key].plan.messages[sel.dataset.agentOwner].subject}" to ${sel.value}.` });
  rerender();
  return true;
}
