// Date helpers. All dates are ISO strings "YYYY-MM-DD", handled in UTC so
// results never depend on the viewer's time zone.
import type { IsoDate } from './types';

const DAY_MS = 86_400_000;

export const toDay = (iso: IsoDate): number =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
export const fromDay = (n: number): IsoDate => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (iso: IsoDate, n: number): IsoDate => fromDay(toDay(iso) + n);
/** Days from b to a (positive when a is later). */
export const daysBetween = (a: IsoDate, b: IsoDate): number => toDay(a) - toDay(b);

type MaybeDate = IsoDate | null | undefined;
export const latest = (...dates: MaybeDate[]): IsoDate | null =>
  dates.filter((d): d is IsoDate => Boolean(d)).sort().at(-1) ?? null;
export const earliest = (...dates: MaybeDate[]): IsoDate | null =>
  dates.filter((d): d is IsoDate => Boolean(d)).sort()[0] ?? null;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-12" -> "12 Nov 2026" (or "12 Nov" when short). */
export function fmtDate(iso: MaybeDate, short = false): string {
  if (!iso) return 'no date';
  const d = `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
  return short ? d : `${d} ${iso.slice(0, 4)}`;
}
