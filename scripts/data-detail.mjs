// Operational detail for the fictional dataset: how issues are found (24/7 test
// lab runs and customer reports), how they're routed to teams (log
// signatures), what each team last said and when they expect a fix; and on the
// supply side, purchase orders, shipment tracking, inspections and supplier
// track records. Everything is made up. Uses its own seed so the base tables
// (tickets, deliveries) are unchanged.
import { addDays } from '../src/engine/dates.ts';

let seed = 77001;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const daysApart = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// ---------- test suites (what the lab runs around the clock) ----------

export const TEST_SUITES = [
  { id: 'TS-USB-MEDIA', name: 'USB media playback soak', hours: 24, teams: ['USB', 'Audio', 'Display', 'Platform'], steps: [
    'Insert a USB drive with the media test set',
    'Drive pops up on the home screen within 5 s',
    'Open the 4K HDR test video and play it on a loop',
    'Every hour: check audio and video (A/V sync, no freezes, no artefacts)',
    'Record live TV to a USB hard disk for 4 h',
    'Eject and reinsert the drive every 2 h',
  ] },
  { id: 'TS-STANDBY', name: 'Standby and wake cycling', hours: 48, teams: ['Platform', 'USB', 'Display', 'Audio', 'Connectivity'], steps: [
    'Cold boot to the home screen',
    'Enter standby for 30 min',
    'Wake with the Bluetooth remote',
    'USB drive remounts within 5 s of wake',
    'Picture and sound settings are unchanged after reboot',
    'Power on with speakers: no pops or clicks',
    'Stay in standby 8 h without waking by itself',
  ] },
  { id: 'TS-STREAM', name: 'Streaming endurance', hours: 24, teams: ['Connectivity', 'Platform'], steps: [
    'Connect to the lab Wi-Fi 6 network',
    'Stream 4K video for 24 h',
    'Every hour: log memory, temperature and buffer health',
    'Run the store demo loop for 2 h',
  ] },
  { id: 'TS-AUDIO', name: 'Audio output matrix', hours: 12, teams: ['Audio'], steps: [
    'Play the A/V sync clip through an eARC soundbar and measure the offset',
    'Pass Dolby Atmos through to the soundbar for 2 h',
    'Play music to Bluetooth headphones on 2.4 GHz Wi-Fi',
    'Switch HDMI inputs and check the volume level',
  ] },
  { id: 'TS-PQ', name: 'Picture quality regression', hours: 8, teams: ['Display'], steps: [
    'Compare the dark gradient pattern with the golden capture',
    'Measure HDR10 peak luminance on the test clips',
    'Switch to a 4K/120 game input and measure frame pacing',
    'Play the subtitle clip with local dimming on high',
  ] },
  { id: 'TS-WIFI', name: 'Wi-Fi and screen mirroring', hours: 12, teams: ['Connectivity'], steps: [
    'Reconnect after the access point restarts',
    'Mirror a phone screen on a 5 GHz network',
    'Scan for networks on DFS channels',
  ] },
  { id: 'TS-PERIPH', name: 'Camera and USB peripherals', hours: 6, teams: ['USB'], steps: [
    'Run a 30-minute 4K video call with a USB camera',
    'Use a mouse through a powered USB hub',
  ] },
  { id: 'TS-UPDATE', name: 'Software update and settings', hours: 6, teams: ['USB', 'Platform'], steps: [
    'Insert a USB drive with an update package and start the update',
    'Update completes and the TV reboots on the new build',
    'Change the system language and back',
  ] },
];

// What each known problem looks like: the suite and step that catches it, the
// log signature the triage rules match, the component, a sample of the TV log,
// a likely root cause, and what a customer would say.
const ISSUE = {
  'USB drive not detected after standby': { suite: 'TS-STANDBY', step: 3, component: 'USB host controller', sig: 'usb 1-1: device descriptor read/64, error -71',
    log: ['[  812.402118] pm: resume from standby complete', '[  812.733901] usb 1-1: new high-speed USB device number 4 using xhci-hcd', '[  817.940222] usb 1-1: device descriptor read/64, error -71', '[  818.112009] usb 1-1: device not accepting address 4, error -71', '[  818.112450] mediascan: no storage volumes found'],
    cause: 'xHCI controller is powered up 300 ms after the port; the drive enumerates before the link is ready', quote: 'My USB stick disappears every time I turn the TV back on.' },
  'USB camera drops frames at 4K': { suite: 'TS-PERIPH', step: 0, component: 'USB video class', sig: 'uvcvideo: Dropped frames',
    log: ['[ 1520.004311] uvcvideo: Found UVC 1.10 device NWV Cam 4K (2bd9:0410)', '[ 1544.120876] uvcvideo: Dropped 214 frames (bandwidth)', '[ 1544.121004] videocall: encoder starved, fps 17.2 (target 30)'],
    cause: 'isochronous bandwidth is reserved for USB 2 speeds on the shared root hub', quote: 'Video calls get choppy after a few minutes.' },
  'Mouse lag on USB hub': { suite: 'TS-PERIPH', step: 1, component: 'USB input (HID)', sig: 'hid-generic: urb timeout',
    log: ['[  301.554012] hub 1-1:1.0: 4 ports detected', '[  322.004101] hid-generic 0003:046D:C077: urb timeout (-110)', '[  322.004530] input: pointer latency 412 ms'],
    cause: 'HID polling interval is reset to 64 ms behind powered hubs', quote: 'The mouse lags when I use it with a hub.' },
  'Firmware update over USB fails at 90%': { suite: 'TS-UPDATE', step: 1, component: 'Software updater', sig: 'swupdate: verify chunk failed: CRC mismatch',
    log: ['[  44.100002] swupdate: package NWV-OS 7.5.0 (2.1 GB) found on /mnt/usb0', '[ 611.230981] swupdate: writing chunk 18/20', '[ 640.004412] swupdate: verify chunk 18/20 failed: CRC mismatch', '[ 640.004600] swupdate: rolling back to slot A'],
    cause: 'read-ahead buffer is reused before verification finishes on large files', quote: 'Software update from USB stops at 90% and goes back to the old version.' },
  'Hard-disk recording stops after 2 h': { suite: 'TS-USB-MEDIA', step: 4, component: 'USB mass storage', sig: 'usb-storage: reset high-speed USB device',
    log: ['[ 7204.330019] pvr: recording ch 101 to /mnt/usb1/rec/0412.ts', '[ 7212.001842] usb 1-2: reset high-speed USB device number 5 using xhci-hcd', '[ 7212.402311] blk_update_request: I/O error, dev sda, sector 23488312', '[ 7212.402900] pvr: write failed, recording stopped'],
    cause: 'USB autosuspend kicks in during long sequential writes to spinning disks', quote: 'Recordings to my external hard drive stop after about two hours.' },
  'Banding in dark gradients': { suite: 'TS-PQ', step: 0, component: 'Picture processing', sig: 'pq_check: gradient_dark delta-E above limit',
    log: ['[pq] pattern=gradient_dark_10bit capture=bench-07', '[pq] delta-E 4.8 (limit 3.0) FAIL', '[pq] suspected: dither disabled in low-latency path'],
    cause: 'temporal dithering is skipped when the noise filter is off', quote: 'I see stripes in dark scenes.' },
  'HDR tone mapping too bright': { suite: 'TS-PQ', step: 1, component: 'HDR tone mapping', sig: 'pq_check: hdr10_peak above target',
    log: ['[pq] clip=hdr10_1000nit_ramp', '[pq] measured peak 1180 nits (target 1000 ±5%) FAIL', '[pq] tone_curve=v3.2 panel_lut=2026A'],
    cause: 'tone curve uses last year\'s panel luminance table', quote: 'HDR movies look washed out and too bright.' },
  'Picture mode resets after reboot': { suite: 'TS-STANDBY', step: 4, component: 'Settings storage', sig: 'settings: picture_mode reverted',
    log: ['[    3.410221] settings: loading user profile 0', '[    3.411004] settings: picture_mode reverted to Standard (expected Movie)', '[    3.411110] settings: profile checksum mismatch, using defaults'],
    cause: 'settings file is written after the power rail drops on fast shutdown', quote: 'My picture settings go back to Standard every morning.' },
  'Flicker at 120 Hz with game mode': { suite: 'TS-PQ', step: 2, component: 'Variable refresh rate', sig: 'vrr: frame pacing jitter above limit',
    log: ['[vrr] input=HDMI2 4K/120 VRR on', '[vrr] frame pacing jitter 7.9 ms (limit 2 ms) FAIL', '[vrr] panel_od table switched mid-frame'],
    cause: 'overdrive table switches mid-frame when the refresh rate changes', quote: 'The screen flickers when I play games at 120 Hz.' },
  'Local dimming halo on subtitles': { suite: 'TS-PQ', step: 3, component: 'Local dimming', sig: 'pq_check: halo_score above limit',
    log: ['[pq] clip=subtitles_dark_scene dimming=high', '[pq] halo_score 0.31 (limit 0.15) FAIL'],
    cause: 'zone spread filter is too wide for small bright objects', quote: 'There is a glow around subtitles in dark scenes.' },
  'Audio out of sync over eARC': { suite: 'TS-AUDIO', step: 0, component: 'HDMI eARC audio', sig: 'av_sync: offset above limit',
    log: ['[audio] sink=eARC soundbar (Brand B, fw 3.1)', '[av_sync] measured offset +142 ms (limit ±40 ms) FAIL', '[audio_hal] latency report from sink ignored'],
    cause: 'the latency the soundbar reports over eARC is not applied to video', quote: 'Voices are out of sync with lips when using my soundbar.' },
  'Pop noise at power on': { suite: 'TS-STANDBY', step: 5, component: 'Audio amplifier control', sig: 'audio_probe: power-on transient',
    log: ['[    0.912004] amp: unmute at t=0.40 s', '[audio_probe] transient 18 dB above noise floor at t=0.41 s FAIL'],
    cause: 'amplifier is unmuted before the DC offset settles', quote: 'There is a loud pop when I turn the TV on.' },
  'Dolby passthrough drops': { suite: 'TS-AUDIO', step: 1, component: 'Audio passthrough', sig: 'audio_hal: bitstream underrun, fallback to PCM',
    log: ['[audio_hal] passthrough E-AC3-JOC 768 kbps', '[ 3611.220004] audio_hal: bitstream underrun, fallback to PCM', '[ 3611.220090] earc: format changed, sink re-sync 1.4 s'],
    cause: 'passthrough buffer is sized for stereo bitrates', quote: 'Dolby Atmos keeps dropping to stereo.' },
  'Bluetooth headphones choppy': { suite: 'TS-AUDIO', step: 2, component: 'Bluetooth audio', sig: 'bt_a2dp: packet drops',
    log: ['[bt] a2dp sink=Headphones (SBC 328 kbps)', '[bt_a2dp] 23 packet drops in 60 s', '[coex] wlan 2.4 GHz duty 71% bt 29%'],
    cause: 'Wi-Fi/Bluetooth coexistence gives Bluetooth too little airtime on 2.4 GHz', quote: 'My Bluetooth headphones keep cutting out.' },
  'Volume jumps on input switch': { suite: 'TS-AUDIO', step: 3, component: 'Audio policy', sig: 'audio_policy: volume reset on source change',
    log: ['[audio_policy] source HDMI1 -> HDMI2', '[audio_policy] volume reset 12 -> 35 on source change FAIL'],
    cause: 'per-input volume table is not loaded before the source switch', quote: 'Volume suddenly gets very loud when I switch inputs.' },
  'Wi-Fi reconnect takes 40 s': { suite: 'TS-WIFI', step: 0, component: 'Wi-Fi driver', sig: 'wlan0: association took too long',
    log: ['[  990.100221] wlan0: deauthenticated from 3c:84:6a:..:21 (reason 3)', '[ 1031.322019] wlan0: associated', '[ 1031.322400] wlan0: association took 41.2 s (target 10 s)'],
    cause: 'full-band scan runs before trying the last known channel', quote: 'Wi-Fi takes ages to come back after my router restarts.' },
  'Screen mirroring fails on 5 GHz': { suite: 'TS-WIFI', step: 1, component: 'Wi-Fi Direct (mirroring)', sig: 'p2p0: GO negotiation failed',
    log: ['[p2p] invite from Phone-QA-12 on ch 149', '[ 402.110922] p2p0: GO negotiation failed, status=7', '[cast] session aborted: no group'],
    cause: 'channel list for the group owner excludes UNII-3', quote: 'Screen mirroring from my phone doesn\'t connect.' },
  'BT remote pairing lost': { suite: 'TS-STANDBY', step: 2, component: 'Bluetooth', sig: 'bt: link key missing for remote',
    log: ['[bt] wake source: remote (le)', '[bt] link key missing for remote E4:5F:..:0A, pairing required'],
    cause: 'link keys live in a cache that is cleared on deep standby', quote: 'The remote stops working and has to be paired again.' },
  'Network stalls during streaming': { suite: 'TS-STREAM', step: 1, component: 'Network stack', sig: 'net: tcp retransmits above limit',
    log: ['[stream] 4K 25 Mbps session 6h12m', '[net] tcp retransmits 3.2% (limit 1%)', '[player] buffer underrun, rebuffering 6.1 s'],
    cause: 'receive buffer is not tuned for high-bitrate streams on Wi-Fi 6', quote: 'Streaming apps keep buffering in 4K.' },
  'Wi-Fi scan misses DFS channels': { suite: 'TS-WIFI', step: 2, component: 'Wi-Fi regulatory', sig: 'wlan0: scan results missing DFS channels',
    log: ['[wifi] regdomain=US', '[wifi] scan results missing ch 52-64 (DFS)'],
    cause: 'passive scan dwell time on DFS channels is too short', quote: 'My TV can\'t see my 5 GHz network.' },
  'Boot time over target': { suite: 'TS-STANDBY', step: 0, component: 'Boot and startup', sig: 'boot: home ready above target',
    log: ['[    0.000000] boot: NWV-OS 7.5.0 cold boot', '[   14.812004] boot: home ready at 14.8 s (target 10 s)', '[boot] slowest: media_index 3.9 s, app_store 2.2 s'],
    cause: 'media indexing runs before the home screen is shown', quote: 'The TV takes a long time to start.' },
  'Wakes from standby by itself': { suite: 'TS-STANDBY', step: 6, component: 'Power management', sig: 'pm: unexpected wakeup source',
    log: ['[28812.004101] pm: wakeup source: hdmi_cec (unexpected)', '[28812.004330] cec: <Image View On> from logical addr 4'],
    cause: 'CEC wake requests from playback devices are not filtered in eco mode', quote: 'The TV turns itself on in the middle of the night.' },
  'Memory leak after 24 h playback': { suite: 'TS-STREAM', step: 2, component: 'Media player memory', sig: 'lowmemorykiller: killing home app',
    log: ['[86400.000210] meminfo: free 38 MB (start 610 MB)', '[86400.120004] lowmemorykiller: killing com.nwv.home (adj 0)', '[player] texture pool 412 MB (expected < 120 MB)'],
    cause: 'subtitle textures are never released after each segment', quote: 'The TV gets slow and the menu restarts after watching all day.' },
  'Crash when changing language': { suite: 'TS-UPDATE', step: 2, component: 'Settings app', sig: 'FATAL: com.nwv.settings NullPointerException',
    log: ['[ui] locale change en-US -> de-DE', 'FATAL EXCEPTION: main com.nwv.settings', 'java.lang.NullPointerException at LocaleRepo.apply(LocaleRepo.kt:88)'],
    cause: 'region list is read before the new locale resources are loaded', quote: 'Settings crash when I change the language.' },
  'Thermal throttling in demo mode': { suite: 'TS-STREAM', step: 3, component: 'Thermal management', sig: 'thermal: cpu throttled',
    log: ['[demo] store loop brightness 100%', '[thermal] cpu throttled at 92 C', '[demo] animation fps 41 (target 60)'],
    cause: 'demo mode forces max brightness and the fan curve ignores it', quote: 'The store demo stutters after an hour.' },
  'No sound over eARC with soundbars from two brands': { suite: 'TS-AUDIO', step: 0, component: 'HDMI eARC audio', sig: 'earc: capability handshake timeout',
    log: ['[  41.220004] cec: <Report Physical Address> 1.0.0.0 from soundbar', '[  43.221980] earc: capability handshake timeout (2000 ms)', '[  43.222004] audio_hal: route fallback to TV speakers muted', '[uploaded] same signature in logs from 1,240 TVs'],
    cause: 'CEC retry timing changed in 7.4.2; two soundbar brands answer after the new 2 s timeout', quote: 'No sound from my soundbar since the last update; I have to unplug HDMI to get it back.' },
};

const ROLE = { USB: 'USB team', Display: 'Display team', Audio: 'Audio team', Connectivity: 'Connectivity team', Platform: 'Platform team' };
const PREV_MODELS = { 'Indus-S': 'Aurora 2025 43"/50"', 'Indus-M': 'Aurora 2025 55"–75"', 'Rhine-M': 'Zenith 2025 55"/65"' };

/** Add origin, logs, triage, workflow, comments and ETA to each ticket. */
export function enrichTickets(out, asOf) {
  const { fixDays } = out.config;
  let change = 51230;
  let build = 140;
  for (const t of out.tickets) {
    const meta = ISSUE[t.title];
    const suite = TEST_SUITES.find((s) => s.id === meta.suite);
    const customer = t.raisedBy === 'Client';
    t.source = customer ? 'customer' : 'test-lab';
    t.component = meta.component;
    if (customer) {
      const units = t.severity === 'critical' ? 1240 : between(12, 380);
      t.report = { units, firstSeen: t.openedOn, firmware: 'NWV-OS 7.4.2', devices: `${PREV_MODELS[t.chipset]} (same software branch)`, quote: meta.quote };
      t.log = [`# logs uploaded with "Report this issue" from ${units.toLocaleString('en-US')} TVs`, ...meta.log];
    } else {
      t.testCase = { suite: suite.id, step: meta.step };
      t.log = meta.log;
    }
    // The log line the signature matched: the one sharing the most words with it.
    const words = meta.sig.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 2);
    const score = (line) => words.filter((w) => line.toLowerCase().includes(w)).length;
    const line = t.log.reduce((best, l, i) => (score(l) > score(t.log[best]) ? i : best), 0);
    t.triage = { signature: meta.sig, rule: `${meta.component} → ${ROLE[t.team]}`, routedOn: t.openedOn, line };

    const comments = [{ at: t.openedOn, by: 'Triage bot', text: `Log signature "${meta.sig}" matches the ${meta.component} rule. Routed to the ${ROLE[t.team]}.` }];
    const ack = addDays(t.openedOn, between(0, 1));
    comments.push({ at: ack, by: ROLE[t.team], text: customer
      ? `Reproduced on a lab TV with the customer logs (${meta.component}). Affects ${t.report.units.toLocaleString('en-US')} reports so far.`
      : `Reproduced on bench rig ${between(1, 12)} running ${suite.name}. Looking at ${meta.component}.` });

    if (t.status === 'fixed') {
      comments.push({ at: t.fixedOn, by: ROLE[t.team], text: `Root cause: ${meta.cause}. Fix merged in build 7.5.0.${build++}; ${customer ? 'rolling out with the next update' : 're-test passed'}.` });
      t.workflow = 'fixed';
    } else {
      const age = daysApart(asOf, t.openedOn);
      const [lo, hi] = fixDays[t.severity];
      // Older and more severe issues are further along.
      const stage = age < 2 ? pick(['new', 'triaged']) : age < 5 ? pick(['triaged', 'in-progress', 'in-progress']) : pick(['in-progress', 'in-review', 'verifying', 'in-progress']);
      t.workflow = stage;
      if (stage !== 'new' && stage !== 'triaged') comments.push({ at: addDays(ack, between(1, 2)) > asOf ? asOf : addDays(ack, between(1, 2)), by: ROLE[t.team], text: `Root cause: ${meta.cause}.` });
      if (stage === 'in-review') comments.push({ at: asOf, by: ROLE[t.team], text: `Fix up for review as change ${change++}.` });
      if (stage === 'verifying') comments.push({ at: asOf, by: 'Test lab', text: `Fix in build 7.5.0.${build++}; re-running ${suite.name} on 3 rigs.` });
      // ETA: committed once the fix is in review or verifying, or in progress with a known cause.
      if (stage === 'in-review' || stage === 'verifying' || (stage === 'in-progress' && rand() < 0.6)) {
        const days = stage === 'verifying' ? between(1, 2) : stage === 'in-review' ? between(2, Math.max(2, lo + 1)) : between(lo, hi);
        t.eta = { fixBy: addDays(asOf, days), confidence: stage === 'in-progress' ? pick(['committed', 'estimate']) : 'committed' };
        comments.push({ at: asOf, by: ROLE[t.team], text: t.eta.confidence === 'committed' ? `Committed: fix in a release build by ${t.eta.fixBy}.` : `Rough estimate: ${t.eta.fixBy}, depends on what the fix review finds.` });
      }
    }
    t.comments = comments.sort((a, b) => a.at.localeCompare(b.at));
  }

  // The critical eARC issue: a customer report on last year's Zenith, with a firm date.
  const crit = out.tickets.find((t) => t.severity === 'critical');
  crit.workflow = 'in-review';
  crit.eta = { fixBy: '2026-10-09', confidence: 'committed' };
  crit.comments = [
    { at: '2026-09-26', by: 'Triage bot', text: 'Log signature "earc: capability handshake timeout" in 214 uploads in 6 hours. Matches the HDMI eARC audio rule. Routed to the Audio team. Marked critical: customer-facing, no workaround.' },
    { at: '2026-09-27', by: 'Audio team', text: 'Reproduced with two soundbar brands (B and K). Does not happen on 7.4.1, so it came in with 7.4.2.' },
    { at: '2026-09-30', by: 'Audio team', text: 'Root cause: CEC retry timing changed in 7.4.2; these soundbars answer after the new 2 s timeout.' },
    { at: '2026-10-02', by: 'Customer support', text: '1,240 reports so far. Workaround shared: unplug HDMI for 10 s. Escalation from two retail partners.' },
    { at: '2026-10-05', by: 'Audio team', text: 'Fix up for review (change 51199): timeout back to 5 s with a retry. Committed: in a release build by 2026-10-09; test lab verification 1–3 days after.' },
  ];
  return out.tickets;
}

/** 24/7 test lab runs for every platform in testing, linked to the issues they found. */
export function makeTestRuns(out, asOf) {
  const runs = [];
  let n = 1;
  const perDay = (s) => (s.hours >= 48 ? 0.5 : Math.floor(24 / s.hours));
  for (const c of out.chipsets.filter((x) => x.testStartedOn)) {
    for (let day = c.testStartedOn; day <= asOf; day = addDays(day, 1)) {
      const dayIndex = daysApart(day, c.testStartedOn);
      for (const s of TEST_SUITES) {
        const count = perDay(s) >= 1 ? perDay(s) : dayIndex % 2 === 0 ? 1 : 0;
        for (let i = 0; i < count; i++) {
          const found = out.tickets.filter((t) => t.source === 'test-lab' && t.chipset === c.id && t.openedOn === day && t.testCase.suite === s.id && !runs.some((r) => r.ticketIds.includes(t.id)));
          const running = day === asOf;
          // Each issue is found by one failed run; other runs pass, with an occasional known-issue repeat.
          const ticketIds = i === 0 ? found.map((t) => t.id) : [];
          const repeat = !ticketIds.length && !running && rand() < 0.04;
          const known = repeat ? out.tickets.find((t) => t.source === 'test-lab' && t.chipset === c.id && t.testCase.suite === s.id && t.openedOn < day && (!t.fixedOn || t.fixedOn > day)) : undefined;
          runs.push({
            id: `RUN-${String(n++).padStart(5, '0')}`, suite: s.id, chipset: c.id, rig: `${c.id}-R${between(1, Math.max(3, c.testBoards / 10))}`,
            startedOn: day, hours: running ? between(2, s.hours - 1) : s.hours,
            result: running ? 'running' : ticketIds.length || known ? 'fail' : 'pass',
            failedStep: ticketIds.length ? out.tickets.find((t) => t.id === ticketIds[0]).testCase.step : known ? known.testCase.step : null,
            ticketIds: known ? [known.id] : ticketIds,
            newIssue: ticketIds.length > 0,
          });
        }
      }
    }
  }
  // Any test-lab ticket whose day had no matching run gets one.
  for (const t of out.tickets.filter((x) => x.source === 'test-lab' && !runs.some((r) => r.ticketIds.includes(x.id)))) {
    const s = TEST_SUITES.find((x) => x.id === t.testCase.suite);
    runs.push({ id: `RUN-${String(n++).padStart(5, '0')}`, suite: s.id, chipset: t.chipset, rig: `${t.chipset}-R${between(1, 3)}`, startedOn: t.openedOn, hours: s.hours, result: 'fail', failedStep: t.testCase.step, ticketIds: [t.id], newIssue: true });
  }
  for (const t of out.tickets.filter((x) => x.source === 'test-lab')) t.testCase.runId = runs.find((r) => r.newIssue && r.ticketIds.includes(t.id)).id;
  return runs.sort((a, b) => a.startedOn.localeCompare(b.startedOn) || a.id.localeCompare(b.id));
}

/** Why code isn't in yet, in the team's own words. */
export function enrichSubmissions(out) {
  const NOTES = {
    'Indus-L|Display': { note: 'New 120 Hz panel: the 4K/120 timing fails our own pre-integration test (frame drops at 4K/120 with VRR). Panel vendor sent a new timing table on 1 Oct; integrating and re-testing.', updatedOn: '2026-10-04' },
    'Indus-L|Audio': { note: 'On track for 12 Oct. Remaining: Dolby MS12 v2.6 certification run.', updatedOn: '2026-10-03' },
    'Indus-L|Connectivity': { note: 'On track for 12 Oct; Wi-Fi 6 driver merged, BT LE audio behind a flag.', updatedOn: '2026-10-02' },
    'Rhine-L|Display': { note: 'Mini-LED local dimming algorithm v4 in final tuning; on track for 2 Nov.', updatedOn: '2026-10-04' },
    'Volga-X|USB': { note: 'USB 3.2 controller driver bring-up done on 10 pre-production boards; on track for 9 Nov.', updatedOn: '2026-10-05' },
    'Volga-X|Display': { note: 'OLED compensation (burn-in protection) needs 3 more weeks of panel data; still on track for 9 Nov.', updatedOn: '2026-10-01' },
    'Volga-M|Audio': { note: 'Submitted on 2 Oct. Last fix: eARC timeout change aligned with the 7.4.2 hotfix.', updatedOn: '2026-10-02' },
    'Volga-L|Audio': { note: 'Submitted on 5 Oct, 2 days late: waited for the eARC hotfix so it ships in the first test build.', updatedOn: '2026-10-05' },
  };
  for (const s of out.submissions) {
    const n = NOTES[`${s.chipset}|${s.team}`];
    if (n) Object.assign(s, n);
  }
  return out.submissions;
}

const SUPPLIER = {
  'SUP-KS': { region: 'Hsinchu, Taiwan', leadTimeDays: 84, onTimeRate: 0.91, avgDelayDays: 4.2, defectPpm: 120, contact: 'Account manager', last: 'Allocation for Q1 confirmed; wafer capacity tight on the new node.' },
  'SUP-NB': { region: 'Penang, Malaysia', leadTimeDays: 56, onTimeRate: 0.82, avgDelayDays: 6.8, defectPpm: 350, contact: 'Supply planner', last: 'Running a second shift on the UC-300 line until December.' },
  'SUP-OD': { region: 'Gumi, South Korea', leadTimeDays: 70, onTimeRate: 0.88, avgDelayDays: 3.1, defectPpm: 210, contact: 'Key account team', last: 'TCON-OLED rev C qualified; MLD-2 on schedule.' },
  'SUP-PA': { region: 'Hai Phong, Vietnam', leadTimeDays: 42, onTimeRate: 0.95, avgDelayDays: 1.2, defectPpm: 90, contact: 'Order desk', last: 'No open issues.' },
  'SUP-TW': { region: 'Shenzhen, China', leadTimeDays: 49, onTimeRate: 0.86, avgDelayDays: 5.0, defectPpm: 610, contact: 'Quality engineer', last: 'Corrective action for the RF failure (lot 2609) submitted; replacement lot ships with DL-WM6-01.' },
  'SUP-QL': { region: 'Osaka, Japan', leadTimeDays: 63, onTimeRate: 0.97, avgDelayDays: 0.8, defectPpm: 40, contact: 'Sales engineer', last: 'No open issues.' },
};

export function enrichSuppliers(out) {
  for (const s of out.suppliers) {
    const x = SUPPLIER[s.id];
    Object.assign(s, { region: x.region, leadTimeDays: x.leadTimeDays, onTimeRate: x.onTimeRate, avgDelayDays: x.avgDelayDays, defectPpm: x.defectPpm, contact: x.contact, latestNote: x.last });
  }
  return out.suppliers;
}

const UNIT_COST = { SoC: [14, 42], USB: [1.6, 3.4], Connectivity: [3.8, 7.5], Display: [2.2, 9.8], Audio: [1.1, 1.9] };

/** Purchase order, transport, tracking events and inspection for each shipment. */
export function enrichDeliveries(out, asOf) {
  let po = 4410;
  for (const d of out.deliveries) {
    const sup = out.suppliers.find((s) => s.id === d.supplier);
    const part = out.parts.find((p) => p.id === d.part);
    const [cLo, cHi] = UNIT_COST[part.category];
    const air = d.qty <= 700 || d.part.startsWith('SOC-') && d.qty <= 2500;
    const transit = air ? between(3, 5) : between(16, 24);
    const placedOn = addDays(d.originalEta, -sup.leadTimeDays);
    const planned = d.originalEta;
    d.po = { number: `PO-26-${po++}`, placedOn, unitCost: Math.round((cLo + rand() * (cHi - cLo)) * 100) / 100, currency: 'USD', incoterm: air ? 'FCA' : 'FOB' };
    d.transport = { mode: air ? 'air' : 'sea', carrier: air ? 'Skylane Air Cargo (fictional)' : 'Bluewater Lines (fictional)', tracking: `${air ? 'SKY' : 'BWL'}${between(100000, 999999)}` };
    const ev = (at, stage, text) => ({ at, stage, text, planned: at > asOf });
    const events = [
      ev(placedOn, 'ordered', `${d.po.number} placed: ${d.qty.toLocaleString('en-US')} × ${part.name} at $${d.po.unitCost}`),
      ev(addDays(placedOn, between(1, 3)), 'confirmed', `${sup.name.replace(' (fictional)', '')} confirmed the order and ship date`),
      ev(addDays(planned, -transit - between(10, 20)), 'production', 'Production started'),
      ev(addDays(planned, -transit), 'shipped', `Shipped by ${d.transport.mode} (${d.transport.tracking})`),
      ev(addDays(planned, -2), 'customs', 'Customs clearance'),
      ev(planned, 'arrived', 'Arrives at Plant store'),
    ];
    if (d.status === 'delayed') {
      events.push(ev('2026-09-29', 'delayed', `Supplier notice: ${d.note}. New arrival ${d.eta}.`));
      for (const e of events) if (['shipped', 'customs', 'arrived'].includes(e.stage)) {
        e.at = addDays(e.at, daysApart(d.eta, d.originalEta));
        e.planned = e.at > asOf;
      }
    }
    if (d.status === 'rejected') {
      events.push(ev(addDays(planned, 1), 'inspection', 'Incoming inspection: 9 of 80 sampled modules failed RF sensitivity. Lot rejected, return authorised.'));
      d.inspection = { sampled: 80, failed: 9, result: 'rejected', reason: 'RF sensitivity below spec (−3 dB on 5 GHz)' };
    } else if (planned <= asOf) {
      events.push(ev(addDays(planned, 1), 'inspection', 'Incoming inspection passed (sample of 80).'));
      d.inspection = { sampled: 80, failed: 0, result: 'passed' };
    }
    d.events = events.sort((a, b) => a.at.localeCompare(b.at));
    const lastReal = [...d.events].reverse().find((e) => !e.planned);
    d.lastUpdate = lastReal ? { at: lastReal.at, text: lastReal.text } : null;
  }
  return out.deliveries;
}
