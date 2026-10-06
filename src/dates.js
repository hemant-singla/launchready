// Date helpers. All dates are ISO strings "YYYY-MM-DD", handled in UTC so
// results never depend on the viewer's time zone.
const DAY_MS = 86400000;

export const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
export const fromDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromDay(toDay(iso) + n);
/** Days from b to a (positive when a is later). */
export const daysBetween = (a, b) => toDay(a) - toDay(b);
export const latest = (...dates) => dates.filter(Boolean).sort().at(-1) ?? null;
export const earliest = (...dates) => dates.filter(Boolean).sort()[0] ?? null;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-12" -> "12 Nov 2026" (or "12 Nov" when short). */
export function fmtDate(iso, short = false) {
  if (!iso) return 'no date';
  const d = `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
  return short ? d : `${d} ${iso.slice(0, 4)}`;
}
