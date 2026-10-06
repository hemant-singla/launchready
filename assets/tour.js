// "Take the 60-second tour": a small, skippable card that walks through one
// supplier delay, its impact, the recovery comparison and an approval.
// Non-modal: the page stays usable, Esc or Skip ends it at any time.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let api; // set by initTour
let step = -1;
let focused = null;

export function initTour(a) { api = a; }

const STEPS = [
  { title: 'The problem', target: '.hero-copy', view: 'intro',
    text: () => 'Software readiness (code, tickets, testing) and parts supply are planned in different tools. When a supplier slips, nobody sees which TV launch it reaches until late. LaunchReady joins both sides.' },
  { title: 'One supplier delay', target: '.lab-out', view: 'intro', enter: () => api.preset(0),
    text: () => 'We just delayed the USB controller shipment for the Volga-X test boards by 34 days. The tiles recalculated: watch the one that changed.' },
  { title: 'The dependency chain', target: '#lab-trail', view: 'intro',
    text: () => `Left to right: ${api.chain().map(esc).join(' → ')}.` },
  { title: 'Compare recovery options', target: '#astep-3', view: 'agent', enter: () => api.agentStep(3),
    text: () => 'The agent tried every action the data allows and dropped any that hurt another launch. The table compares the original plan, the disruption and the selected option.' },
  { title: 'Approve it', target: '[data-agent-approve]', view: 'agent', enter: () => api.agentStep(5),
    text: () => 'Nothing changes without your approval. Click Approve (or press Next and the tour approves the recommended option for you).' },
  { title: 'Outcome', target: '.outcome', view: 'agent', enter: () => api.approveIfPending(),
    text: () => `${esc(api.outcome() ?? 'Approved.')} The decision is in the activity log. Reset demo restores the original plan.` },
];

function draw() {
  const el = document.getElementById('tour');
  if (step < 0) { el.hidden = true; el.innerHTML = ''; return; }
  const s = STEPS[step];
  el.hidden = false;
  el.innerHTML = `<div class="tour-head"><span>Tour · ${step + 1} of ${STEPS.length}</span><button type="button" class="tour-x" data-tour="skip" aria-label="Skip the tour">Skip</button></div>
    <h2>${s.title}</h2><p>${s.text()}</p>
    <div class="tour-nav">${step > 0 ? '<button type="button" class="button-link" data-tour="back">Back</button>' : '<span></span>'}
      <button type="button" class="button accent" data-tour="next">${step === STEPS.length - 1 ? 'Finish' : 'Next'}</button></div>`;
  focused?.classList.remove('tour-focus');
  focused = document.querySelector(s.target);
  if (focused) {
    focused.classList.add('tour-focus');
    focused.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }
  el.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

function go(i) {
  step = i;
  if (step >= STEPS.length) return endTour();
  const s = STEPS[step];
  s.enter?.();
  api.view(s.view);
  // wait one frame so the view has rendered before we highlight it
  requestAnimationFrame(draw);
}

export function startTour() { go(0); }
export function endTour() { step = -1; focused?.classList.remove('tour-focus'); focused = null; draw(); }
export function tourActive() { return step >= 0; }

/** Click handling for the tour card. Returns true when handled. */
export function tourClick(e) {
  const b = e.target.closest('[data-tour]');
  if (!b) return false;
  const a = b.dataset.tour;
  if (a === 'skip') endTour();
  else if (a === 'back') go(Math.max(0, step - 1));
  else go(step + 1);
  return true;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && step >= 0) endTour(); });
