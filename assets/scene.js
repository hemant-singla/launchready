// The animated product scene on the TV in the hero. It plays one calculated
// story: a supplier shipment slips, the delay moves through parts -> testing
// -> software -> launch, then a recovery option restores the launch.
// All facts are passed in from app.js, which takes them from the engine
// (USB delay scenario + the recommended recovery option). Nothing is typed in.

const STAGES = ['Parts', 'Testing', 'Software', 'Launch'];
const FRAME_MS = 2800;
let facts, frame = 0, timer = null, root, controls;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** f = { part, chip, model, launch, dueFrom, dueTo, slip, lateQty, qty, testFrom, testTo,
 *        swFrom, swTo, swFixed, cutoff, fixTitle, fixArrive, fixTest } (display strings) */
export function initScene(screen, ctrl, f) {
  facts = f; root = screen; controls = ctrl;
  root.innerHTML = `
    <div class="sc-bar"><span class="live-dot" aria-hidden="true"></span><span>Northwind Vision · launch control</span><span class="sc-step" id="sc-step"></span></div>
    <div class="sc-ship" id="sc-ship"><span class="sc-ship-k">Supplier shipment</span><b>${f.part}</b><span id="sc-ship-v"></span></div>
    <ol class="sc-flow">${STAGES.map((s, i) => `<li class="sc-node" data-i="${i}"><span class="sc-dot" aria-hidden="true"></span><b>${s}</b><span class="sc-val"></span></li>`).join('')}<span class="sc-pulse" aria-hidden="true"></span></ol>
    <p class="sc-cap" id="sc-cap"></p>`;
  controls.innerHTML = `<button type="button" class="sc-play" data-scene-play aria-pressed="false"></button>
    <div class="sc-dots" role="group" aria-label="Scene steps">${frames().map((_, i) => `<button type="button" data-scene-go="${i}" aria-label="Step ${i + 1}"></button>`).join('')}</div>
    <button type="button" class="button accent sc-try" data-preset-go="0">Try this yourself</button>`;
  show(0);
  if (!reduced()) play(); else syncPlay();
}

// Each frame: which stages are hit (amber), the caption, and the values shown.
function frames() {
  const f = facts;
  const ok = { ship: `due ${f.dueFrom}`, vals: [`${f.qty} boards on time`, `starts ${f.testFrom}`, f.swFrom, `${f.model} · Ready`] };
  const late = [`${f.lateQty} of ${f.qty} late`, `starts ${f.testTo}`, f.swTo, `${f.model} · At risk`];
  const fixed = [`${f.qty} boards on time`, `starts ${f.fixTest}`, f.swFixed, `${f.model} · Ready`];
  return [
    { hit: 0, ship: ok.ship, vals: ok.vals, cap: `The plan: ${f.model} launches ${f.launch}. Parts, testing and software are on track.` },
    { hit: 0, shipLate: true, ship: `now ${f.dueTo} (+${f.slip} days)`, vals: ok.vals, cap: `A supplier says the ${f.part} shipment will arrive ${f.slip} days late.` },
    { hit: 1, shipLate: true, ship: `now ${f.dueTo} (+${f.slip} days)`, vals: [late[0], ...ok.vals.slice(1)], cap: `${f.lateQty} of ${f.qty} ${f.chip} test boards can't be built on time.` },
    { hit: 2, shipLate: true, ship: `now ${f.dueTo} (+${f.slip} days)`, vals: [...late.slice(0, 2), ...ok.vals.slice(2)], cap: `${f.chip} testing starts ${f.testTo} instead of ${f.testFrom}.` },
    { hit: 3, shipLate: true, ship: `now ${f.dueTo} (+${f.slip} days)`, vals: [...late.slice(0, 3), ok.vals[3]], cap: `Software is now expected ${f.swTo}, after the ${f.cutoff} cutoff.` },
    { hit: 4, shipLate: true, ship: `now ${f.dueTo} (+${f.slip} days)`, vals: late, cap: `${f.model} is now at risk of missing its ${f.launch} launch.` },
    { hit: 0, fixed: true, ship: f.fixArrive ? `re-pegged units arrive ${f.fixArrive}` : "recovery option applied", vals: fixed, cap: `Recovery: ${f.fixTitle}. ${f.model} is back to Ready (needs approval).` },
  ];
}

function show(i) {
  const all = frames();
  frame = (i + all.length) % all.length;
  const fr = all[frame];
  root.querySelector('#sc-step').textContent = `${frame + 1} / ${all.length}`;
  const ship = root.querySelector('#sc-ship');
  ship.className = `sc-ship${fr.shipLate ? ' late' : ''}${fr.fixed ? ' fixed' : ''}`;
  root.querySelector('#sc-ship-v').textContent = fr.ship;
  root.querySelectorAll('.sc-node').forEach((n, k) => {
    n.className = `sc-node${k < fr.hit ? ' hit' : ''}${fr.fixed ? ' fixed' : ''}`;
    n.querySelector('.sc-val').textContent = fr.vals[k];
  });
  root.querySelector('.sc-flow').style.setProperty('--p', fr.hit ? (fr.hit - 1) / 3 : 0);
  root.querySelector('.sc-flow').classList.toggle('running', fr.hit > 0);
  root.querySelector('#sc-cap').textContent = fr.cap;
  controls.querySelectorAll('[data-scene-go]').forEach((b, k) => b.setAttribute('aria-current', k === frame ? 'step' : 'false'));
}

function play() {
  clearInterval(timer);
  timer = setInterval(() => show(frame + 1), FRAME_MS);
  syncPlay();
}
function pause() { clearInterval(timer); timer = null; syncPlay(); }
function syncPlay() {
  const b = controls.querySelector('[data-scene-play]');
  b.textContent = timer ? '❚❚ Pause' : '▶ Play';
  b.setAttribute('aria-pressed', String(!timer));
  b.setAttribute('aria-label', timer ? 'Pause the animation' : 'Play the animation');
}

/** Click handling; returns true when handled. */
export function sceneClick(e) {
  if (e.target.closest('[data-scene-play]')) { timer ? pause() : play(); return true; }
  const go = e.target.closest('[data-scene-go]');
  if (go) { pause(); show(+go.dataset.sceneGo); return true; }
  return false;
}
export const pauseScene = () => timer && pause();
