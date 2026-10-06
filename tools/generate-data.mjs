// Generates the fictional dataset in data/*.json.
// Run: node tools/generate-data.mjs
// Everything here is made up (company, models, chipsets, suppliers, tickets).
// The plan tables are written out by hand; tickets are generated from a fixed
// seed so the output is identical every run.
import { writeFileSync, mkdirSync } from 'node:fs';
import { addDays } from '../src/dates.js';

const AS_OF = '2026-10-05';
const out = {};

out.config = {
  company: 'Northwind Vision (fictional)',
  asOf: AS_OF,
  bufferDays: 7,              // software must be ready this many days before launch
  productionLeadDays: 21,     // first production build needs parts this long before launch
  productionSlackDays: 7,     // production parts up to this late = at risk; later = blocked
  tightDeliveryDays: 3,       // a delivery landing closer than this to the need date = at risk
  boardBringUpDays: 3,        // days from code complete to boards on the test bench
  testWindowDays: { new: 28, reused: 14 },
  stabilisationDays: { new: [3, 10], reused: [1, 4] },
  fixDays: { critical: [3, 14], major: [2, 7], minor: [1, 3] },
};

out.teams = [
  { id: 'USB', name: 'USB', fixCapacity: 2 },
  { id: 'Display', name: 'Display', fixCapacity: 3 },
  { id: 'Audio', name: 'Audio', fixCapacity: 2 },
  { id: 'Connectivity', name: 'Connectivity (Wi-Fi/BT)', fixCapacity: 2 },
  { id: 'Platform', name: 'Platform (boot, power)', fixCapacity: 3 },
];

// id, isNew, test boards, code deadline, planned test start, started?
const CHIPS = [
  ['Indus-S', false, 30, '2026-09-14', '2026-09-17', true],
  ['Indus-M', false, 30, '2026-09-21', '2026-09-24', true],
  ['Indus-L', true, 60, '2026-10-12', '2026-10-15', false],
  ['Rhine-M', false, 30, '2026-09-28', '2026-10-01', true],
  ['Rhine-L', true, 60, '2026-11-02', '2026-11-05', false],
  ['Volga-M', false, 30, '2026-10-05', '2026-10-08', false],
  ['Volga-L', false, 30, '2026-10-05', '2026-10-08', false],
  ['Volga-X', true, 60, '2026-11-09', '2026-11-12', false],
];
out.chipsets = CHIPS.map(([id, isNew, testBoards, codeDeadline, plannedTestStart, started]) => ({
  id, isNew, testBoards, codeDeadline, plannedTestStart, testStartedOn: started ? plannedTestStart : null,
}));

// line, size, chipset, launch, first build units
const MODELS = [
  ['Aurora', 43, 'Indus-S', '2026-11-09', 6000], ['Aurora', 50, 'Indus-S', '2026-11-09', 6000],
  ['Aurora', 55, 'Indus-M', '2026-11-16', 5000], ['Aurora', 65, 'Indus-M', '2026-11-16', 4000],
  ['Aurora', 75, 'Indus-M', '2026-11-16', 2000],
  ['Lumen', 50, 'Indus-M', '2026-11-30', 4000], ['Lumen', 55, 'Indus-M', '2026-11-30', 4000],
  ['Lumen', 65, 'Indus-L', '2026-12-14', 3000], ['Lumen', 75, 'Indus-L', '2026-12-14', 2000],
  ['Zenith', 55, 'Rhine-M', '2026-11-23', 2500], ['Zenith', 65, 'Rhine-M', '2026-11-23', 2500],
  ['Zenith', 75, 'Rhine-L', '2027-01-11', 1500], ['Zenith', 85, 'Rhine-L', '2027-01-11', 800],
  ['Halo', 55, 'Volga-M', '2026-12-07', 1200], ['Halo', 65, 'Volga-L', '2026-12-07', 1200],
  ['Halo', 77, 'Volga-X', '2027-01-18', 600],
];
const LINE_INFO = {
  Aurora: 'Entry 4K', Lumen: 'Mid-range', Zenith: 'Premium mini-LED', Halo: 'Flagship OLED',
};
out.models = MODELS.map(([line, size, chipset, launchDate, firstBuildUnits]) => ({
  id: `${line.slice(0, 3).toUpperCase()}-${size}`, name: `${line} ${size}"`, line, segment: LINE_INFO[line],
  size, chipset, launchDate, firstBuildUnits,
}));

// Code submissions: [chipset, team, submittedOn | null, expectedOn | null, % new code]
const SUBS = [];
const subPlan = {
  'Indus-S': { all: ['2026-09-12', null], pct: [8, 5, 6, 10, 4] },
  'Indus-M': { all: ['2026-09-19', null], pct: [12, 9, 7, 15, 6] },
  'Indus-L': { pct: [70, 75, 55, 60, 80] },
  'Rhine-M': { all: ['2026-09-26', null], pct: [10, 18, 8, 12, 7] },
  'Rhine-L': { pct: [65, 85, 60, 55, 75] },
  'Volga-M': { all: ['2026-10-02', null], pct: [6, 11, 9, 8, 5] },
  'Volga-L': { all: ['2026-10-03', null], pct: [7, 14, 10, 9, 6] },
  'Volga-X': { pct: [80, 70, 65, 72, 85] },
};
const teamIds = out.teams.map((t) => t.id);
for (const c of out.chipsets) {
  const plan = subPlan[c.id];
  teamIds.forEach((team, i) => {
    let submittedOn = plan.all?.[0] ?? null;
    let expectedOn = plan.all ? null : c.codeDeadline;
    if (c.id === 'Indus-L' && ['USB', 'Platform'].includes(team)) { submittedOn = '2026-10-02'; expectedOn = null; }
    if (c.id === 'Indus-L' && team === 'Display') expectedOn = '2026-11-02'; // new panel pipeline, running late
    if (c.id === 'Volga-L' && team === 'Audio') submittedOn = '2026-10-05';
    SUBS.push({ chipset: c.id, team, dueDate: c.codeDeadline, submittedOn, expectedOn, newCodePct: plan.pct[i] });
  });
}
out.submissions = SUBS;

// Tickets: seeded generator for chipsets already in testing.
let seed = 20261005;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const TITLES = {
  USB: ['USB drive not detected after standby', 'USB camera drops frames at 4K', 'Mouse lag on USB hub', 'Firmware update over USB fails at 90%', 'Hard-disk recording stops after 2 h'],
  Display: ['Banding in dark gradients', 'HDR tone mapping too bright', 'Picture mode resets after reboot', 'Flicker at 120 Hz with game mode', 'Local dimming halo on subtitles'],
  Audio: ['Audio out of sync over eARC', 'Pop noise at power on', 'Dolby passthrough drops', 'Bluetooth headphones choppy', 'Volume jumps on input switch'],
  Connectivity: ['Wi-Fi reconnect takes 40 s', 'Screen mirroring fails on 5 GHz', 'BT remote pairing lost', 'Network stalls during streaming', 'Wi-Fi scan misses DFS channels'],
  Platform: ['Boot time over target', 'Wakes from standby by itself', 'Memory leak after 24 h playback', 'Crash when changing language', 'Thermal throttling in demo mode'],
};
// [chipset, team, open critical, open major, open minor, fixed]
const TICKET_PLAN = [
  ['Indus-S', 'USB', 0, 1, 2, 9], ['Indus-S', 'Display', 0, 0, 2, 6], ['Indus-S', 'Audio', 0, 1, 1, 5],
  ['Indus-S', 'Connectivity', 0, 0, 1, 4], ['Indus-S', 'Platform', 0, 1, 1, 7],
  ['Indus-M', 'USB', 0, 4, 3, 8], ['Indus-M', 'Display', 0, 2, 3, 7], ['Indus-M', 'Audio', 0, 1, 2, 4],
  ['Indus-M', 'Connectivity', 0, 2, 2, 5], ['Indus-M', 'Platform', 0, 1, 3, 6],
  ['Rhine-M', 'USB', 0, 1, 2, 3], ['Rhine-M', 'Display', 0, 3, 4, 4], ['Rhine-M', 'Audio', 1, 2, 1, 2],
  ['Rhine-M', 'Connectivity', 0, 1, 2, 2], ['Rhine-M', 'Platform', 0, 1, 1, 3],
];
out.tickets = [];
let n = 4100;
for (const [chipset, team, crit, maj, min, fixed] of TICKET_PLAN) {
  const start = out.chipsets.find((c) => c.id === chipset).testStartedOn;
  const span = (Date.parse(AS_OF) - Date.parse(start)) / 86400000;
  const make = (severity, status) => {
    const opened = addDays(start, Math.floor(rand() * span));
    const t = {
      id: `NWV-${n++}`, chipset, team, severity, status,
      raisedBy: rand() < 0.15 ? 'Client' : 'Testing',
      openedOn: opened, fixedOn: null, title: pick(TITLES[team]),
    };
    if (status === 'fixed') t.fixedOn = addDays(opened, 1 + Math.floor(rand() * Math.max(1, Math.min(14, span - 1))));
    if (t.fixedOn && t.fixedOn > AS_OF) t.fixedOn = AS_OF;
    return t;
  };
  for (let i = 0; i < crit; i++) out.tickets.push(make('critical', 'open'));
  for (let i = 0; i < maj; i++) out.tickets.push(make('major', 'open'));
  for (let i = 0; i < min; i++) out.tickets.push(make('minor', 'open'));
  for (let i = 0; i < fixed; i++) out.tickets.push(make(pick(['major', 'minor', 'minor']), 'fixed'));
}
// Pin the one critical so the story is stable: raised by a client 9 days ago.
const crit = out.tickets.find((t) => t.severity === 'critical');
Object.assign(crit, { openedOn: '2026-09-26', raisedBy: 'Client', title: 'No sound over eARC with soundbars from two brands' });

// Parts and bill of materials (key parts only).
out.parts = [
  ...out.chipsets.map((c) => ({ id: `SOC-${c.id.replace('-', '')}`, name: `${c.id} SoC`, category: 'SoC' })),
  { id: 'UC-200', name: 'USB 3.0 controller', category: 'USB' },
  { id: 'UC-300', name: 'USB 3.2 controller', category: 'USB' },
  { id: 'UC-310', name: 'USB 3.2 controller (alt. supplier)', category: 'USB' },
  { id: 'WM-5', name: 'Wi-Fi 5 module', category: 'Connectivity' },
  { id: 'WM-6', name: 'Wi-Fi 6 module', category: 'Connectivity' },
  { id: 'TCON-4K', name: '4K timing controller', category: 'Display' },
  { id: 'MLD-2', name: 'Mini-LED driver', category: 'Display' },
  { id: 'TCON-OLED', name: 'OLED timing controller', category: 'Display' },
  { id: 'AMP-20', name: 'Audio amplifier', category: 'Audio' },
];
const BOM = {
  'Indus-S': ['UC-200', 'WM-5', 'TCON-4K'], 'Indus-M': ['UC-200', 'WM-5', 'TCON-4K'],
  'Indus-L': ['UC-300', 'WM-6', 'TCON-4K'], 'Rhine-M': ['UC-200', 'WM-6', 'MLD-2'],
  'Rhine-L': ['UC-300', 'WM-6', 'MLD-2'], 'Volga-M': ['UC-200', 'WM-6', 'TCON-OLED'],
  'Volga-L': ['UC-200', 'WM-6', 'TCON-OLED'], 'Volga-X': ['UC-300', 'WM-6', 'TCON-OLED'],
};
out.bom = Object.entries(BOM).flatMap(([chipset, parts]) =>
  [`SOC-${chipset.replace('-', '')}`, ...parts, 'AMP-20'].map((part) => ({ chipset, part, qtyPerUnit: 1 })));

out.warehouses = [
  { id: 'WH-HB', name: 'Harbor DC' }, { id: 'WH-CT', name: 'Central DC' }, { id: 'WH-PL', name: 'Plant store' },
];
// part: [free units, units already allocated elsewhere (service, spares)]. Split 50/30/20.
const STOCK = {
  'SOC-IndusS': [13000, 400], 'SOC-IndusM': [12000, 500], 'SOC-IndusL': [200, 0], 'SOC-RhineM': [5500, 200],
  'SOC-RhineL': [150, 0], 'SOC-VolgaM': [1400, 100], 'SOC-VolgaL': [1400, 100], 'SOC-VolgaX': [100, 0],
  'UC-200': [25000, 1500], 'UC-300': [100, 300], 'UC-310': [500, 0], 'WM-5': [24000, 800], 'WM-6': [9000, 600],
  'TCON-4K': [30000, 1000], 'MLD-2': [5500, 400], 'TCON-OLED': [1000, 150], 'AMP-20': [30000, 1200],
};
out.stock = [];
for (const [part, [free, alloc]] of Object.entries(STOCK)) {
  const split = [0.5, 0.3, 0.2];
  let fLeft = free, aLeft = alloc;
  out.warehouses.forEach((w, i) => {
    const last = i === split.length - 1;
    const f = last ? fLeft : Math.round(free * split[i]);
    const a = last ? aLeft : Math.round(alloc * split[i]);
    fLeft -= f; aLeft -= a;
    if (f + a > 0) out.stock.push({ part, warehouse: w.id, onHand: f + a, allocated: a });
  });
}

out.suppliers = [
  { id: 'SUP-KS', name: 'Kestrel Semi (fictional)' }, { id: 'SUP-NB', name: 'Northbay Components (fictional)' },
  { id: 'SUP-OD', name: 'Orinoco Display Tech (fictional)' }, { id: 'SUP-PA', name: 'Pallas Audio (fictional)' },
  { id: 'SUP-TW', name: 'Tamarind Wireless (fictional)' }, { id: 'SUP-QL', name: 'Quill Logic (fictional)' },
];
// id, part, supplier, qty, original ETA, current ETA, status, for chipset, note
const DL = [
  ['DL-SIM-01', 'SOC-IndusM', 'SUP-KS', 8000, '2026-10-27', '2026-10-27', 'confirmed', 'Indus-M', ''],
  ['DL-SIL-01', 'SOC-IndusL', 'SUP-KS', 5000, '2026-11-03', '2026-11-10', 'delayed', 'Indus-L', 'Wafer lot re-test, +7 days'],
  ['DL-SRL-01', 'SOC-RhineL', 'SUP-KS', 2400, '2026-12-07', '2026-12-07', 'confirmed', 'Rhine-L', ''],
  ['DL-SVX-01', 'SOC-VolgaX', 'SUP-KS', 600, '2026-12-10', '2026-12-10', 'confirmed', 'Volga-X', ''],
  ['DL-UC2-01', 'UC-200', 'SUP-NB', 10000, '2026-10-22', '2026-10-22', 'confirmed', null, ''],
  ['DL-UC2-02', 'UC-200', 'SUP-NB', 6000, '2026-11-02', '2026-11-02', 'confirmed', null, ''],
  ['DL-UC3-01', 'UC-300', 'SUP-NB', 100, '2026-11-06', '2026-11-06', 'confirmed', 'Volga-X', 'Test boards + pilot'],
  ['DL-UC3-02', 'UC-300', 'SUP-NB', 5200, '2026-11-09', '2026-11-09', 'confirmed', 'Indus-L', ''],
  ['DL-UC3-04', 'UC-300', 'SUP-NB', 2500, '2026-10-29', '2026-10-29', 'confirmed', 'Rhine-L', ''],
  ['DL-UC3-05', 'UC-300', 'SUP-NB', 600, '2026-12-08', '2026-12-08', 'confirmed', 'Volga-X', ''],
  ['DL-WM5-01', 'WM-5', 'SUP-TW', 10000, '2026-10-30', '2026-10-30', 'confirmed', null, ''],
  ['DL-WM6-00', 'WM-6', 'SUP-TW', 500, '2026-09-28', '2026-09-28', 'rejected', null, 'Failed RF test at incoming inspection'],
  ['DL-WM6-01', 'WM-6', 'SUP-TW', 8000, '2026-11-10', '2026-11-10', 'confirmed', null, ''],
  ['DL-T4K-01', 'TCON-4K', 'SUP-QL', 8000, '2026-11-01', '2026-11-01', 'confirmed', null, ''],
  ['DL-MLD-03', 'MLD-2', 'SUP-OD', 3000, '2026-12-01', '2026-12-01', 'confirmed', null, ''],
  ['DL-MLD-04', 'MLD-2', 'SUP-OD', 2000, '2027-01-05', '2027-01-05', 'confirmed', null, ''],
  ['DL-TCO-02', 'TCON-OLED', 'SUP-OD', 2000, '2026-11-06', '2026-11-06', 'confirmed', null, ''],
  ['DL-TCO-03', 'TCON-OLED', 'SUP-OD', 700, '2026-12-14', '2026-12-14', 'confirmed', null, ''],
  ['DL-AMP-01', 'AMP-20', 'SUP-PA', 12000, '2026-10-20', '2026-10-20', 'confirmed', null, ''],
  ['DL-AMP-02', 'AMP-20', 'SUP-PA', 8000, '2026-11-15', '2026-11-15', 'confirmed', null, ''],
];
out.deliveries = DL.map(([id, part, supplier, qty, originalEta, eta, status, forChipset, note]) =>
  ({ id, part, supplier, qty, originalEta, eta, status, forChipset, note }));

out.substitutes = [
  { part: 'UC-300', substitute: 'UC-310', approvedFor: ['Volga-X', 'Rhine-L'], driverTeam: 'USB', driverChangeDays: [1, 14],
    note: 'Pin-compatible, different firmware interface; USB team must port the driver' },
];

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
for (const [name, value] of Object.entries(out)) {
  writeFileSync(new URL(`../data/${name}.json`, import.meta.url), JSON.stringify(value, null, 2) + '\n');
}
console.log('wrote', Object.keys(out).map((k) => `${k}(${Array.isArray(out[k]) ? out[k].length : 1})`).join(' '));
