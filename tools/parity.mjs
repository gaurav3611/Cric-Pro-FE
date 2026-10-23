/*
  Parity tool: proves that the Angular app shows what the original dashboard showed.

    node tools/parity.mjs record     Opens the ORIGINAL dashboard (../Cricket/frontend) in headless Chrome,
                                     feeds it fixed sensor readings and saves everything it displays to
                                     tools/golden/original-dashboard.json.

    node tools/parity.mjs check      Does the same with the Angular build in dist/ and compares every
                                     value with the recording. Build first: npm run build:demo

  The app words some things differently from the original on purpose. Those phrases, and only those,
  are listed in tools/golden/copy-changes.json. `check` rewrites the recorded texts with that list
  before comparing, so the numbers inside every text are still the original's.

  Both apps run in demo mode with canned API answers, so no Firebase account and no backend are needed.
  Options: --original <folder>   --dist <folder>   --chrome <path to Chrome>
*/
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CHROME, openChrome, serve, sleep } from "./browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, "..");
const GOLDEN = join(HERE, "golden", "original-dashboard.json");
const COPY_CHANGES = join(HERE, "golden", "copy-changes.json");
const args = process.argv.slice(2);
const mode = args[0];
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : fallback; };
const ORIGINAL = resolve(option("original", join(PROJECT, "..", "Cricket", "frontend")));
const DIST = resolve(option("dist", join(PROJECT, "dist", "angular-cricket-frontend", "browser")));
const CHROME = option("chrome", DEFAULT_CHROME);

// ---------------------------------------------------------------- fixed input

const round2 = d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.round(v * 100) / 100]));

/** One swing as a list of sensor readings: quiet backlift, the swing, follow-through. No randomness. */
function swing({ n, peakGyro, side, accelPeak }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const phase = i / n;
    let d;
    if (phase < 0.25) {
      d = { ax: 0.1 * Math.sin(i), ay: 1 + 0.05 * Math.cos(i), az: 0.1 * Math.cos(i * 0.7),
            gx: Math.sin(phase * 8) * 15, gy: 5 + 3 * Math.sin(i * 0.9), gz: 4 * Math.sin(i * 1.3) };
    } else if (phase < 0.5) {
      const k = Math.sin((phase - 0.25) / 0.25 * Math.PI);
      d = { ax: k * accelPeak, ay: k * accelPeak * 0.75, az: k * accelPeak * 0.5,
            gx: -k * peakGyro * 0.3, gy: k * peakGyro, gz: side * k * peakGyro * 0.15 };
    } else {
      const decay = Math.max(0, 1 - (phase - 0.5) * 3);
      d = { ax: decay * 1.2, ay: 1 + decay * 0.5, az: decay * 0.4, gx: -decay * 40, gy: decay * 60, gz: side * 2.5 };
    }
    out.push(round2(d));
  }
  return out;
}

/** A bat held almost still, so the control score lands in its middle range. */
function steady({ n, wobble }) {
  return Array.from({ length: n }, (_, i) => round2({ ax: 0.02, ay: 1, az: 0.05, gx: 0.4 * Math.sin(i), gy: 30 + wobble * Math.sin(i * 1.7), gz: 0.3 * Math.cos(i) }));
}

const SHOTS = [
  { name: "weak off-side push", samples: swing({ n: 40, peakGyro: 300, side: -1, accelPeak: 2 }) },
  { name: "steady bat, excellent control", samples: steady({ n: 30, wobble: 1 }) },
  { name: "steady bat, moderate control", samples: steady({ n: 30, wobble: 2.55 }) },
  { name: "straight drive", samples: swing({ n: 60, peakGyro: 900, side: 0, accelPeak: 6 }) },
  { name: "stopped without any reading", samples: [] },
  { name: "medium impact", samples: swing({ n: 50, peakGyro: 700, side: 0, accelPeak: 11.5 }) },
  { name: "hard hit", samples: swing({ n: 60, peakGyro: 1300, side: 0, accelPeak: 20 }) },
  { name: "leg-side power hit", samples: swing({ n: 80, peakGyro: 1900, side: 1, accelPeak: 7.9 }) },
  { name: "long swing, more readings than the chart shows at once", samples: swing({ n: 260, peakGyro: 1200, side: 0, accelPeak: 5 }) },
];

const DEMO_USER = { email: "asha@example.org", displayName: "Asha Rao", uid: "demo-1", team: "Blue" };
const API = {
  empty: { profile: { uid: "demo-user", email: "demo@sswingg.com", display_name: "Demo User", stats: { total_sessions: 0, total_swings: 0, best_score: 0, avg_speed: 0 } },
           sessions: { sessions: [] } },
  filled: { profile: { uid: "demo-user", stats: { total_sessions: 5, avg_speed: 84.5, best_score: 92, off_side_shots: 15, leg_side_shots: 20, total_swings: 120 } },
            sessions: { sessions: [
              { session_id: "67fd183d", started_at: "2026-04-18T10:00:00Z", duration_seconds: 1200, swing_count: 24, peak_speed_kmh: 88.5, overall_score: 85 },
              { session_id: "25ae77beXYZ", started_at: "2026-04-16T15:30:00Z", duration_seconds: 900, swing_count: 18, peak_speed_kmh: 52.1, overall_score: 55 },
              { session_id: "ab", started_at: "2026-04-15T08:05:00Z", swing_count: 0, overall_score: 12 } ] } },
};

// ---------------------------------------------------------------- what is read off the page

/** Runs inside the page. Works on both apps because the Angular templates keep the original ids and classes. */
const PROBE = `(() => {
  const text = el => el ? el.textContent.replace(/\\s+/g, " ").trim() : null;
  const byId = id => document.getElementById(id);
  const out = { title: document.title, text: {}, classes: {}, shown: {}, style: {}, lists: {} };
  for (const id of ["userName","userAvatar","bleText","statusText","liveMode","statSessions","statBestSpeed","statOffSide","statLegSide","statSwings",
      "homeShotCount","sessionCount","swingStatusText","swingHelpText","shotCounterDisplay","valSpeed","valImpact","valControl","valFollow",
      "badgeSpeed","badgeImpact","badgeControl","badgeFollow","chartNavInfo","scoreNum","scoreLabel","gxVal","gyVal","gzVal","axVal","ayVal","azVal",
      "shotLabel","shotDetailTitle","shotDetailMetrics","shotDetailNoData","aiAnalysisCard","clearText","clearAllBtn","selectCount"]) out.text[id] = text(byId(id));
  for (const id of ["bleDot","statusDot","navHome","navLive","badgeSpeed","badgeImpact","badgeControl","badgeFollow","kpiSpeed","kpiImpact","kpiControl","kpiFollow",
      "sectorLeg","sectorOff","sectorStraight","shotDetailOverlay","clearOverlay","homeShotsGrid"]) out.classes[id] = byId(id) ? [...byId(id).classList].sort().join(" ") : null;
  for (const id of ["homeView","liveView","startShotBtn","stopShotBtn","shotsPanel","homeShotsCard","sessionsLoading","sessionList","noSessions","shotDetailChart","shotDetailNoData","selectBar"])
    out.shown[id] = byId(id) ? getComputedStyle(byId(id)).display !== "none" : null;
  for (const id of ["gxBar","gyBar","gzBar","axBar","ayBar","azBar"]) out.style[id] = byId(id) ? byId(id).style.width : null;
  const ring = byId("scoreFill"), marker = byId("batMarker"), label = byId("shotLabel");
  const colour = c => { if (!c) return c; const s = document.createElement("span"); s.style.color = c; return s.style.color; };
  out.style.ring = ring ? [String(parseFloat(ring.style.strokeDashoffset || "NaN")), colour(ring.style.stroke)] : null;
  out.style.marker = marker ? [marker.style.left, marker.style.top] : null;
  out.style.shotLabel = label ? colour(label.style.color) : null;
  const cards = sel => [...document.querySelectorAll(sel)].map(c => [...c.classList].sort().join(" ") + " | " +
      [...c.children].filter(ch => !/font-size:\\s*0\\.62rem/.test(ch.getAttribute("style") || "")).map(text).join(" / "));
  out.lists.shots = cards("#shotsGrid .shot-card");
  out.lists.homeShots = cards("#homeShotsGrid .shot-card");
  out.lists.sessions = [...document.querySelectorAll("#sessionList .session-item")].map(li => text(li) + " | " + (li.querySelector(".session-score")?.getAttribute("style") || "").replace(/\\s+/g, ""));
  // An icon is read as its name where it is drawn as SVG, and as its text where it is a character.
  const icon = el => { const svg = el && el.querySelector("svg[data-icon]"); return svg ? svg.getAttribute("data-icon") : text(el); };
  out.lists.log = [...document.querySelectorAll("#logList .log-item")].map(li => icon(li.querySelector(".log-icon")) + " " + text(li.querySelector(".log-msg")));
  const toasts = [...document.querySelectorAll(".toast")];
  out.lists.lastToast = toasts.length ? toasts[toasts.length - 1].className + " | " + text(toasts[toasts.length - 1]) : null;
  return out;
})()`;

// How each app is driven. The original exposes plain global functions. The Angular app exposes
// window.sswinggTest, which exists only in builds made with test hooks switched on.
const ADAPTERS = {
  original: {
    dashboardPath: "/dashboard.html",
    ready: "typeof processData === 'function' && document.getElementById('userName').textContent !== 'Player'",
    connect: "bleActive = true; document.getElementById('bleDot').classList.add('connected'); document.getElementById('bleText').textContent = 'TEST BAT'; showView('live'); document.getElementById('liveMode').textContent = '(BLUETOOTH)';",
    feed: "(samples => samples.forEach(d => processData(d)))",
    internals: `(() => ({
      shots: allShots.map(s => ({ ...s, timestamp: null })), speed: allSpeedData.slice(), accel: allAccelData.slice(),
      chart: speedChart ? { labels: speedChart.data.labels.slice(), data: speedChart.data.datasets[0].data.slice(),
                            radius: [].concat(speedChart.data.datasets[0].pointRadius), colours: [].concat(speedChart.data.datasets[0].pointBackgroundColor || []) } : null,
      accelChart: accelChart ? accelChart.data.datasets[0].data.slice() : null,
      detailChart: (typeof shotDetailChart !== "undefined" && shotDetailChart) ? { data: shotDetailChart.data.datasets[0].data.slice(), radius: [].concat(shotDetailChart.data.datasets[0].pointRadius) } : null,
      bat: typeof integratedRot !== "undefined" ? { x: integratedRot.x, y: integratedRot.y, z: integratedRot.z, tx: batTargetRot.x, ty: batTargetRot.y, tz: batTargetRot.z } : null,
      stored: JSON.parse(localStorage.getItem("sswingg_shots") || "[]").map(s => ({ ...s, timestamp: null })),
    }))()`,
  },
  angular: {
    dashboardPath: "/#/dashboard/home",
    ready: "!!window.sswinggTest && !!document.getElementById('userName') && document.getElementById('userName').textContent !== 'Player'",
    connect: "window.sswinggTest.simulateSensor('TEST BAT');",
    feed: "(samples => window.sswinggTest.feed(samples))",
    internals: "window.sswinggTest.internals()",
  },
};

// ---------------------------------------------------------------- running the scenario

/** The backend's answers, canned. apiState.mode chooses between an empty account and one with data. */
const cannedApi = apiState => path => (path === "/api/profile" || path === "/api/sessions") ? API[apiState.mode][path.slice(5)] : null;

/** Drives one app through the whole scenario and returns what it showed at each step. */
async function run(kind, baseUrl, apiState) {
  const adapter = ADAPTERS[kind];
  const chrome = await openChrome({ chromePath: CHROME });
  const steps = [];
  const settle = () => sleep(180);
  const snap = async name => {
    await settle();
    const internals = await chrome.js(adapter.internals);
    // The long arrays are kept only for the steps that change them, to keep the recording small.
    if (!/stopped and saved|reloaded|clear history|home after/.test(name)) { delete internals.shots; delete internals.speed; delete internals.accel; delete internals.stored; }
    steps.push({ name, page: await chrome.js(PROBE), internals });
  };
  const click = chrome.click;
  try {
    // The demo user and an empty shot history are in place before any page script runs.
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source:
      `if (!sessionStorage.getItem("parityPrepared")) { sessionStorage.setItem("parityPrepared", "1"); localStorage.clear(); localStorage.setItem("sswingg_demo_user", ${JSON.stringify(JSON.stringify(DEMO_USER))}); }` });
    apiState.mode = "empty";
    await chrome.send("Page.navigate", { url: baseUrl + adapter.dashboardPath });
    await chrome.until(adapter.ready);
    await chrome.until("getComputedStyle(document.getElementById('sessionsLoading')).display === 'none'");
    await snap("home, nothing recorded yet");

    await chrome.js(adapter.connect);
    await sleep(600);   // the live view sets up its charts and 3D scene shortly after it is shown
    await snap("live view, sensor connected");

    for (const [index, shot] of SHOTS.entries()) {
      await click("#startShotBtn");
      await snap(`shot ${index + 1} (${shot.name}): recording started`);
      if (shot.samples.length) {
        const half = Math.ceil(shot.samples.length / 2);
        await chrome.js(`${adapter.feed}(${JSON.stringify(shot.samples.slice(0, half))})`);
        await snap(`shot ${index + 1}: half of the readings in`);
        await chrome.js(`${adapter.feed}(${JSON.stringify(shot.samples.slice(half))})`);
      }
      await click("#stopShotBtn");
      await snap(`shot ${index + 1}: stopped and saved`);
    }

    for (const [label, selector] of [["earlier", ".chart-nav-btn:nth-of-type(1)"], ["earlier again", ".chart-nav-btn:nth-of-type(1)"], ["later", ".chart-nav-btn:nth-of-type(2)"],
                                     ["back to live", ".chart-nav-btn:nth-of-type(3)"]]) {
      await click(".chart-nav " + selector);
      await snap("speed chart: " + label);
    }

    await click("#shotsGrid .shot-card:nth-child(8)");
    await sleep(900);   // the detail chart animates in
    await snap("shot detail open, shot 8");
    await click(".shot-detail-close");
    await snap("shot detail closed");

    await click("#navHome");
    await snap("home via the header button: its data is reloaded");
    await click("#navLive");
    await sleep(300);
    await snap("live view opened again from the header");

    await click(".btn-back");
    await chrome.until("getComputedStyle(document.getElementById('sessionsLoading')).display === 'none'");
    await snap("home via the BACK button: its data is reloaded");

    await click("#homeShotsGrid .shot-card:nth-child(2)");
    await sleep(900);
    await snap("shot detail open from the home view");
    await click(".shot-detail-close");

    // An old stored shot that has no speed profile, as older versions of the dashboard saved them.
    await chrome.js(`(() => { const h = JSON.parse(localStorage.getItem("sswingg_shots") || "[]");
      h.unshift({ number: 99, peakSpeed: 55.5, peakImpact: 9.9, accuracy: 44, controlScore: 12, direction: "off", followGrade: "WEAK", grade: "average", dataPoints: 77, timestamp: "2026-01-05T10:20:30.000Z" });
      localStorage.setItem("sswingg_shots", JSON.stringify(h)); })()`);

    // A fresh page load with stored shots and an API that has sessions and stats.
    apiState.mode = "filled";
    await chrome.js("window.parityOldPage = true");
    await chrome.send("Page.reload");
    await chrome.until("!window.parityOldPage && (" + adapter.ready + ")");
    await chrome.until("getComputedStyle(document.getElementById('sessionsLoading')).display === 'none'");
    await snap("reloaded: stored shots, sessions and stats from the API");

    await click("#homeShotsGrid .shot-card:nth-child(1)");
    await sleep(400);
    await snap("shot detail for a stored shot with no speed profile");
    await click(".shot-detail-close");
    await click("#homeShotsGrid .shot-card:nth-child(3)");
    await sleep(900);
    await snap("shot detail for a stored shot with a speed profile, opened afterwards");
    await click(".shot-detail-close");

    await click("#clearShotsBtn");
    await snap("clear history: the warning");
    await click("#clearCancelBtn");
    await snap("clear history: cancelled, every shot kept");
    await click("#clearShotsBtn");
    await click("#clearChooseBtn");
    await click("#homeShotsGrid .shot-card:nth-child(1)");
    await click("#homeShotsGrid .shot-card:nth-child(3)");
    await snap("clear history: two shots chosen");
    await click("#deleteSelectedBtn");
    await snap("clear history: the two chosen shots deleted");
    await click("#clearShotsBtn");
    await click("#clearAllBtn");
    await snap("clear history: all deleted");

    return { steps, problems: chrome.problems };
  } finally {
    chrome.close();
  }
}

/** Lists every difference between two values, with the path to it. Numbers may differ by a rounding hair. */
function differences(expected, actual, path, out) {
  if (typeof expected === "number" && typeof actual === "number") {
    if (Math.abs(expected - actual) > 1e-9) out.push(`${path}: expected ${expected} but was ${actual}`);
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) { out.push(`${path}: expected ${expected.length} items but were ${actual.length}`); return; }
    expected.forEach((e, i) => differences(e, actual[i], `${path}[${i}]`, out));
  } else if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) differences(expected[key], actual[key], path ? path + "." + key : key, out);
  } else if (expected !== actual) {
    out.push(`${path}: expected ${JSON.stringify(expected)} but was ${JSON.stringify(actual)}`);
  }
}

/**
 * What the Angular app should show where the original showed `page`: the same, with the wording
 * changes of copy-changes.json applied. The same rules run on the recorded internals, for the chart colours. `used` collects the rules that changed something.
 */
function reworded(page, changes, used) {
  const out = structuredClone(page);
  changes.forEach((change, index) => {
    const [group, key] = change.where.split(".");
    const holder = key ? out[group] : out;
    const name = key ?? group;
    if (!holder || holder[name] == null) return;
    const apply = value => {
      if (typeof value !== "string" || !value.includes(change.from)) return value;
      used.add(index);
      return value.split(change.from).join(change.to);
    };
    holder[name] = Array.isArray(holder[name]) ? holder[name].map(apply) : apply(holder[name]);
  });
  return out;
}

// ---------------------------------------------------------------- the two commands

if (mode === "record") {
  if (!existsSync(join(ORIGINAL, "dashboard.html"))) throw new Error("Original frontend not found at " + ORIGINAL + ". Pass --original <folder>.");
  // Work on a copy, with the Firebase key blanked so the page runs in its own demo mode. The original is never edited.
  const copy = mkdtempSync(join(tmpdir(), "sswingg-original-"));
  cpSync(ORIGINAL, copy, { recursive: true });
  const configFile = join(copy, "js", "firebase-config.js");
  const config = readFileSync(configFile, "utf8");
  const blanked = config.replace(/apiKey:\s*"[^"]*"/, 'apiKey: "YOUR_API_KEY"');
  if (blanked === config) throw new Error("Could not find the apiKey line in firebase-config.js");
  writeFileSync(configFile, blanked);
  const apiState = { mode: "empty" };
  const server = await serve(copy, cannedApi(apiState));
  try {
    const result = await run("original", `http://127.0.0.1:${server.address().port}`, apiState);
    if (result.problems.length) throw new Error("The original page reported errors:\n  " + result.problems.join("\n  "));
    mkdirSync(dirname(GOLDEN), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify({ source: "Cricket/frontend/dashboard.html, driven in headless Chrome by tools/parity.mjs",
      shots: SHOTS, steps: result.steps }) + "\n");
    console.log(`recorded ${result.steps.length} steps to ${GOLDEN}`);
  } finally { server.close(); rmSync(copy, { recursive: true, force: true }); }
} else if (mode === "check") {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("No Angular build at " + DIST + ". Run: npm run build:demo");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const changes = JSON.parse(readFileSync(COPY_CHANGES, "utf8")).changes;
  const usedChanges = new Set();
  const apiState = { mode: "empty" };
  const server = await serve(DIST, cannedApi(apiState));
  try {
    const result = await run("angular", `http://127.0.0.1:${server.address().port}`, apiState);
    let failed = 0;
    golden.steps.forEach((expected, i) => {
      const actual = result.steps[i];
      const diffs = [];
      const expectedPage = reworded(expected.page, changes, usedChanges);
      const expectedInternals = expected.internals && reworded(expected.internals, changes, usedChanges);
      if (!actual) diffs.push("step missing"); else differences({ page: expectedPage, internals: expectedInternals }, { page: actual.page, internals: actual.internals }, "", diffs);
      if (diffs.length) { failed++; console.log(`DIFFERENT  step ${i + 1}: ${expected.name}`); diffs.slice(0, 12).forEach(d => console.log("    " + d)); if (diffs.length > 12) console.log(`    ...and ${diffs.length - 12} more`); }
    });
    result.problems.forEach(p => console.log("PAGE ERROR  " + p));
    // A wording rule that matched nothing is out of date, or was never right.
    const stale = changes.filter((_, index) => !usedChanges.has(index));
    stale.forEach(c => console.log(`STALE RULE  copy-changes.json: nothing in the recording's ${c.where} contains ${JSON.stringify(c.from)}`));
    const ok = failed === 0 && result.problems.length === 0 && stale.length === 0;
    console.log(ok
      ? `PARITY OK: all ${golden.steps.length} steps match the original dashboard, with ${changes.length} listed wording changes`
      : `PARITY FAILED: ${failed} of ${golden.steps.length} steps differ, ${result.problems.length} page errors, ${stale.length} stale wording rules`);
    process.exitCode = ok ? 0 : 1;
  } finally { server.close(); }
} else {
  console.log("usage: node tools/parity.mjs record | check   [--original <folder>] [--dist <folder>] [--chrome <path>]");
  process.exitCode = 2;
}
