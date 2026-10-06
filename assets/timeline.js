// Launch timeline chart (SVG). One row per model:
//   bar     = software-ready range (earliest .. latest), coloured by verdict
//   hatched = the 7-day buffer before launch the software must clear
//   diamond = launch date
// All positions come from the computed result; nothing is typed in.
// Interactive: drag a launch diamond (or focus a row and press ← / →) to try a
// new launch date. `opts.preview(id, date)` returns the status that date would
// give (calculated by the engine), `opts.commit(id, date)` applies it.
import { toDay, fromDay, fmtDate, addDays } from '../src/dates.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LABEL = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };

export function renderTimeline(root, result, data, baseline, opts = {}) {
  const models = [...result.models].sort((a, b) => a.launchDate.localeCompare(b.launchDate) || a.id.localeCompare(b.id));
  const start = '2026-10-01';
  const end = '2027-02-01';
  const W = Math.max(root.clientWidth || 900, 330);
  const labelW = W < 520 ? 70 : W < 760 ? 92 : 132;
  const rowH = 30;
  const top = 34;
  const H = top + models.length * rowH + 12;
  const x0 = labelW + 8;
  const x1 = W - 16;
  const x = (iso) => x0 + ((toDay(iso) - toDay(start)) / (toDay(end) - toDay(start))) * (x1 - x0);
  const clampX = (iso) => Math.min(x1, Math.max(x0, x(iso)));

  const months = ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'];
  const grid = months.map((m) => `<line class="tl-grid" x1="${x(m)}" x2="${x(m)}" y1="${top - 8}" y2="${H - 8}"/>` +
    (m < end ? `<text class="tl-month" x="${x(m) + 6}" y="${top - 14}">${fmtDate(m, true).split(' ')[1]}${(m.endsWith('01-01') || m === start) && W >= 520 ? ` ${m.slice(0, 4)}` : ''}</text>` : '')).join('');
  const today = data.config.asOf;
  const todayLine = `<line class="tl-today" x1="${x(today)}" x2="${x(today)}" y1="${top - 8}" y2="${H - 8}"/><text class="tl-today-label" x="${x(today) + 4}" y="${H - 2}">As of ${fmtDate(today, true)}</text>`;

  const rows = models.map((m, i) => {
    const y = top + i * rowH;
    const cy = y + rowH / 2;
    const cutoff = addDays(m.launchDate, -data.config.bufferDays);
    const was = baseline.models.find((b) => b.id === m.id);
    const moved = was.status !== m.status;
    const tip = `${m.name} · ${LABEL[m.status]}|Launch ${fmtDate(m.launchDate)}|Software ready ${m.eta.known ? `${fmtDate(m.eta.early)} – ${fmtDate(m.eta.late)}` : 'unknown'}|Must be ready by ${fmtDate(cutoff)}${moved ? `|Was ${LABEL[was.status]} before the scenario` : ''}`;
    const bar = m.eta.known
      ? `<rect class="tl-bar ${m.status}" x="${clampX(m.eta.early)}" y="${cy - 6}" width="${Math.max(4, clampX(m.eta.late) - clampX(m.eta.early))}" height="12" rx="4"/>`
      : `<text class="tl-unknown" x="${x0 + 4}" y="${cy + 4}">software date unknown</text>`;
    const lx = x(m.launchDate);
    return `<g class="tl-row ${moved ? 'moved' : ''}" data-tip="${esc(tip)}" tabindex="0" role="listitem" aria-label="${esc(tip.replace(/\|/g, '. '))}. Enter opens details; left and right arrows move the launch date.">
      <rect class="tl-hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
      <text class="tl-label" x="${labelW}" y="${cy + 4}" text-anchor="end">${esc(m.name)}</text>
      ${bar}
      <g class="tl-launch-g" data-model="${m.id}" data-launch="${m.launchDate}" data-cy="${cy}" transform="translate(${lx} 0)">
        <rect class="tl-buffer tl-buffer-drag" x="${x(cutoff) - lx}" y="${cy - 9}" width="${lx - x(cutoff)}" height="18"/>
        <circle class="tl-grab" cx="0" cy="${cy}" r="13"/>
        <path class="tl-launch" d="M0 ${cy - 7} L7 ${cy} L0 ${cy + 7} L-7 ${cy} Z"/></g>
    </g>`;
  }).join('');

  root.innerHTML = `<div class="tl-legend" aria-hidden="true">
      <span><i class="lg-bar ready"></i>Software ready range (Ready)</span><span><i class="lg-bar at-risk"></i>At risk</span><span><i class="lg-bar blocked"></i>Blocked</span>
      <span><i class="lg-buffer"></i>7-day buffer</span><span><i class="lg-launch"></i>Launch</span></div>
    <div class="tl-scroll"><svg class="timeline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="list" aria-label="Launch timeline: software-ready range against each launch date">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="tl-hatch"/></pattern></defs>
      ${grid}${todayLine}${rows}</svg><div class="tl-tip" hidden></div></div>`;

  const tipEl = root.querySelector('.tl-tip');
  let drag = null;
  // below the row, or above it when there's no room left inside the chart
  const placeTip = (r, box) => {
    const below = r.bottom - box.top + 4;
    tipEl.style.top = `${below + tipEl.offsetHeight > box.height ? r.top - box.top - tipEl.offsetHeight - 4 : below}px`;
  };
  const show = (g, evt) => {
    if (drag) return;
    const [head, ...lines] = g.dataset.tip.split('|');
    tipEl.innerHTML = `<strong>${esc(head)}</strong>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}`;
    tipEl.hidden = false;
    const box = root.querySelector('.tl-scroll').getBoundingClientRect();
    const r = g.querySelector('.tl-hit').getBoundingClientRect();
    const px = evt && evt.clientX ? evt.clientX - box.left : r.left - box.left + 160;
    tipEl.style.left = `${Math.min(px + 12, box.width - 270)}px`;
    placeTip(r, box);
  };
  root.querySelectorAll('.tl-row').forEach((g) => {
    const id = g.querySelector('.tl-launch-g').dataset.model;
    g.addEventListener('click', (e) => { if (!e.target.closest('.tl-launch-g')) opts.select?.(id); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.select?.(id); } });
    g.addEventListener('mousemove', (e) => show(g, e));
    g.addEventListener('focus', () => show(g));
    g.addEventListener('mouseleave', () => { if (!drag) tipEl.hidden = true; });
    g.addEventListener('blur', () => { tipEl.hidden = true; });
  });

  if (!opts.commit) return;
  const dateAt = (px) => fromDay(Math.round(toDay(start) + ((px - x0) / (x1 - x0)) * (toDay(end) - toDay(start))));
  const svg = root.querySelector('svg');
  const toSvgX = (clientX) => { const b = svg.getBoundingClientRect(); return ((clientX - b.left) / b.width) * W; };
  const place = (lg, date) => {
    lg.setAttribute('transform', `translate(${x(date)} 0)`);
    const { status, why } = opts.preview(lg.dataset.model, date);
    lg.querySelector('.tl-launch').setAttribute('class', `tl-launch ${status}`);
    const name = models.find((m) => m.id === lg.dataset.model).name;
    tipEl.innerHTML = `<strong>${esc(name)} · launch ${fmtDate(date)}</strong><span>Would be: <b>${LABEL[status]}</b></span>${why ? `<span>${why}</span>` : ''}<span>Planned ${fmtDate(lg.dataset.launch)} · release to apply</span>`;
    tipEl.hidden = false;
    const box = root.querySelector('.tl-scroll').getBoundingClientRect();
    const r = lg.getBoundingClientRect();
    tipEl.style.left = `${Math.max(0, Math.min(r.left - box.left + 16, box.width - 270))}px`;
    placeTip(r, box);
  };
  root.querySelectorAll('.tl-launch-g').forEach((lg) => {
    lg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      lg.setPointerCapture(e.pointerId);
      drag = { lg, date: lg.dataset.launch };
      lg.classList.add('dragging');
    });
    lg.addEventListener('pointermove', (e) => {
      if (!drag || drag.lg !== lg) return;
      const date = dateAt(Math.min(x1, Math.max(x0, toSvgX(e.clientX))));
      if (date !== drag.date) { drag.date = date; place(lg, date); }
    });
    const finish = () => {
      if (!drag || drag.lg !== lg) return;
      const { date } = drag; drag = null;
      lg.classList.remove('dragging');
      if (date !== lg.dataset.launch) opts.commit(lg.dataset.model, date);
    };
    lg.addEventListener('pointerup', finish);
    lg.addEventListener('pointercancel', finish);
  });
  // keyboard: ← / → move the focused row's launch by a day (Shift: a week)
  root.querySelectorAll('.tl-row').forEach((g) => g.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const lg = g.querySelector('.tl-launch-g');
    opts.commit(lg.dataset.model, addDays(lg.dataset.launch, (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 7 : 1)), true);
  }));
}
