// Launch timeline chart (SVG). One row per model:
//   bar     = software-ready range (earliest .. latest), coloured by verdict
//   hatched = the 7-day buffer before launch the software must clear
//   diamond = launch date
// All positions come from the computed result; nothing is typed in.
import { toDay, fmtDate, addDays } from '../src/dates.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LABEL = { ready: 'Ready', 'at-risk': 'At risk', blocked: 'Blocked' };

export function renderTimeline(root, result, data, baseline) {
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
    return `<g class="tl-row ${moved ? 'moved' : ''}" data-tip="${esc(tip)}" tabindex="0" role="listitem" aria-label="${esc(tip.replace(/\|/g, '. '))}">
      <rect class="tl-hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
      <text class="tl-label" x="${labelW}" y="${cy + 4}" text-anchor="end">${esc(m.name)}</text>
      <rect class="tl-buffer" x="${x(cutoff)}" y="${cy - 9}" width="${lx - x(cutoff)}" height="18"/>
      ${bar}
      <path class="tl-launch" d="M${lx} ${cy - 7} L${lx + 7} ${cy} L${lx} ${cy + 7} L${lx - 7} ${cy} Z"/>
    </g>`;
  }).join('');

  root.innerHTML = `<div class="tl-legend" aria-hidden="true">
      <span><i class="lg-bar ready"></i>Software ready range (Ready)</span><span><i class="lg-bar at-risk"></i>At risk</span><span><i class="lg-bar blocked"></i>Blocked</span>
      <span><i class="lg-buffer"></i>7-day buffer</span><span><i class="lg-launch"></i>Launch</span></div>
    <div class="tl-scroll"><svg class="timeline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="list" aria-label="Launch timeline: software-ready range against each launch date">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="tl-hatch"/></pattern></defs>
      ${grid}${todayLine}${rows}</svg><div class="tl-tip" hidden></div></div>`;

  const tipEl = root.querySelector('.tl-tip');
  const show = (g, evt) => {
    const [head, ...lines] = g.dataset.tip.split('|');
    tipEl.innerHTML = `<strong>${esc(head)}</strong>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}`;
    tipEl.hidden = false;
    const box = root.querySelector('.tl-scroll').getBoundingClientRect();
    const r = g.querySelector('.tl-hit').getBoundingClientRect();
    const px = evt && evt.clientX ? evt.clientX - box.left : r.left - box.left + 160;
    tipEl.style.left = `${Math.min(px + 12, box.width - 240)}px`;
    tipEl.style.top = `${r.bottom - box.top + 4}px`;
  };
  root.querySelectorAll('.tl-row').forEach((g) => {
    g.addEventListener('mousemove', (e) => show(g, e));
    g.addEventListener('focus', () => show(g));
    g.addEventListener('mouseleave', () => { tipEl.hidden = true; });
    g.addEventListener('blur', () => { tipEl.hidden = true; });
  });
}
