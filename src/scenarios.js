// Demo scenarios and "what if" edits. Each one returns a NEW dataset (the
// original is never modified), so the app can stack them and Reset simply
// goes back to the original data.
const clone = (d) => structuredClone(d);
const delivery = (data, id) => {
  const d = data.deliveries.find((x) => x.id === id);
  if (!d) throw new Error(`unknown delivery ${id}`);
  return d;
};

export const SCENARIOS = {
  usbDelay: {
    title: 'USB controller delay',
    summary: 'The UC-300 USB controller shipment for Volga-X test boards slips from 6 Nov to 10 Dec.',
    apply(data) {
      const d = clone(data);
      Object.assign(delivery(d, 'DL-UC3-01'), { eta: '2026-12-10', status: 'delayed', note: 'Supplier slipped 34 days (capacity issue)' });
      return d;
    },
  },
  competing: {
    title: 'Two launches, one part',
    summary: 'A 3,000-unit MLD-2 mini-LED driver shipment fails inspection, so Zenith 55/65 and Zenith 75/85 compete for the stock left.',
    apply(data) {
      const d = clone(data);
      Object.assign(delivery(d, 'DL-MLD-03'), { status: 'rejected', note: 'Failed incoming inspection' });
      return d;
    },
  },
  missingDate: {
    title: 'Missing delivery date',
    summary: 'The supplier withdraws the date for 2,000 TCON-OLED boards needed for Halo 55 and Halo 65.',
    apply(data) {
      const d = clone(data);
      Object.assign(delivery(d, 'DL-TCO-02'), { eta: null, status: 'unconfirmed', note: 'Supplier could not confirm a ship date' });
      return d;
    },
  },
};

/** Move `qty` units of a delivery to another chipset's program (split the PO). */
export function reassignDelivery(data, deliveryId, qty, toChipset) {
  const d = clone(data);
  const src = delivery(d, deliveryId);
  if (qty <= 0 || qty > src.qty) throw new Error(`cannot move ${qty} of ${src.qty}`);
  src.qty -= qty;
  d.deliveries.push({ ...src, id: `${deliveryId}-R`, qty, forChipset: toChipset, note: `Moved ${qty} from ${deliveryId}` });
  return d;
}

/** Move a model's launch date. */
export function moveLaunch(data, modelId, newDate) {
  const d = clone(data);
  const m = d.models.find((x) => x.id === modelId);
  if (!m) throw new Error(`unknown model ${modelId}`);
  m.launchDate = newDate;
  return d;
}
