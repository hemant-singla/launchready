// Demo scenarios and "what if" edits. Each one returns a NEW dataset (the
// original is never modified), so the app can stack them and Reset simply
// goes back to the original data.
import { addDays, daysBetween } from './dates';
import type { Dataset, Delivery, IsoDate, ShipmentEvent } from './types';

const clone = (d: Dataset): Dataset => structuredClone(d);
const delivery = (data: Dataset, id: string): Delivery => {
  const d = data.deliveries.find((x) => x.id === id);
  if (!d) throw new Error(`unknown delivery ${id}`);
  return d;
};

/** Record a disruption in a shipment's tracking history (and shift later planned steps). */
export function noteShipmentChange(d: Delivery, stage: ShipmentEvent['stage'], text: string, at: IsoDate, shiftDays = 0): void {
  if (!d.events) return;
  if (shiftDays) for (const e of d.events) if (e.planned && ['shipped', 'customs', 'arrived'].includes(e.stage)) e.at = addDays(e.at, shiftDays);
  d.events = [...d.events, { at, stage, text, planned: false }].sort((a, b) => a.at.localeCompare(b.at));
  d.lastUpdate = { at, text };
}

export interface Scenario {
  title: string;
  summary: string;
  apply: (data: Dataset) => Dataset;
}

export const SCENARIOS = {
  usbDelay: {
    title: 'USB controller delay',
    summary: 'The USB 3.2 controller shipment for the Volga-X test boards (UC-300) slips from 6 Nov to 10 Dec.',
    apply(data) {
      const d = clone(data);
      const dl = delivery(d, 'DL-UC3-01');
      noteShipmentChange(dl, 'delayed', 'Supplier notice: UC-300 line capacity reallocated to a larger order; new ship date gives arrival 10 Dec (+34 days).', d.config.asOf, daysBetween('2026-12-10', dl.eta ?? '2026-12-10'));
      Object.assign(dl, { eta: '2026-12-10', status: 'delayed', note: 'Supplier slipped 34 days (capacity issue)' });
      return d;
    },
  },
  competing: {
    title: 'Two launches, one part',
    summary: 'A shipment of 3,000 mini-LED drivers (MLD-2) fails inspection, so Zenith 55/65 and Zenith 75/85 compete for the stock left.',
    apply(data) {
      const d = clone(data);
      const dl = delivery(d, 'DL-MLD-03');
      noteShipmentChange(dl, 'inspection', 'Incoming inspection: 14 of 80 sampled drivers failed the thermal derating test. Lot rejected.', d.config.asOf);
      Object.assign(dl, { status: 'rejected', note: 'Failed incoming inspection', inspection: { sampled: 80, failed: 14, result: 'rejected', reason: 'Thermal derating test' } });
      return d;
    },
  },
  missingDate: {
    title: 'Missing delivery date',
    summary: 'The supplier withdraws the date for 2,000 OLED timing controllers (TCON-OLED) needed for Halo 55 and Halo 65.',
    apply(data) {
      const d = clone(data);
      const dl = delivery(d, 'DL-TCO-02');
      noteShipmentChange(dl, 'delayed', 'Supplier withdrew the ship date: panel line requalification after an equipment fault. New date to follow.', d.config.asOf);
      Object.assign(dl, { eta: null, status: 'unconfirmed', note: 'Supplier could not confirm a ship date' });
      return d;
    },
  },
} satisfies Record<string, Scenario>;

export type ScenarioKey = keyof typeof SCENARIOS;

/** Move `qty` units of a delivery to another chipset's program (split the PO). */
export function reassignDelivery(data: Dataset, deliveryId: string, qty: number, toChipset: string): Dataset {
  const d = clone(data);
  const src = delivery(d, deliveryId);
  if (qty <= 0 || qty > src.qty) throw new Error(`cannot move ${qty} of ${src.qty}`);
  src.qty -= qty;
  d.deliveries.push({ ...src, id: `${deliveryId}-R`, qty, forChipset: toChipset, note: `Moved ${qty} from ${deliveryId}` });
  return d;
}

/** Move a model's launch date. */
export function moveLaunch(data: Dataset, modelId: string, newDate: IsoDate): Dataset {
  const d = clone(data);
  const m = d.models.find((x) => x.id === modelId);
  if (!m) throw new Error(`unknown model ${modelId}`);
  m.launchDate = newDate;
  return d;
}
