// Small typed lookups shared by the tests.
import type { ModelResult, Result, Status } from '../src/engine/types';

export function model(r: Result, id: string): ModelResult {
  const m = r.models.find((x) => x.id === id);
  if (!m) throw new Error(`no model ${id}`);
  return m;
}
export const status = (r: Result, id: string): Status => model(r, id).status;
export const count = (r: Result, s: Status): number => r.models.filter((m) => m.status === s).length;
