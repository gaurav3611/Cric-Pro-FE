/*
  Smoke test: clicks through the parts of the app that tools/parity.mjs does not reach.

    node tools/smoke.mjs        Needs the demo build: npm run build:demo

  It checks the login page, the sign-in guard, the built-in demo with its random swings,
  the 3D view and logout, in headless Chrome, against the build in dist/. The demo build has
  no Firebase in it, so no account is touched.

  On every screen it visits it also runs the design rules of tools/design-rules.mjs:
  no purple, no gradients, no pill shapes, no emoji, no dashes, nothing moving by itself.
  Options: --dist <folder>   --chrome <path to Chrome>   --shots <folder to save screenshots in>
*/
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CHROME, openChrome, serve, sleep } from "./browser.mjs";
import { DESIGN_PROBE, pointerAndScrollListeners } from "./design-rules.mjs";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : fallback; };
const DIST = resolve(option("dist", join(PROJECT, "dist", "angular-cricket-frontend", "browser")));
const SHOTS = option("shots", null);
if (!existsSync(join(DIST, "index.html"))) throw new Error("No Angular build at " + DIST + ". Run: npm run build:demo");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = await serve(DIST, path => path === "/api/profile" ? { stats: {} } : path === "/api/sessions" ? { sessions: [] } : null);
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await openChrome({ chromePath: option("chrome", DEFAULT_CHROME) });

let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log((ok ? "ok    " : "FAIL  ") + name + (ok || !detail ? "" : "   -> " + detail)); };
const expectEqual = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)} but was ${JSON.stringify(actual)}`);
const text = selector => chrome.js(`(document.querySelector(${JSON.stringify(selector)})?.textContent || "").replace(/\\s+/g, " ").trim()`);
const hash = () => chrome.js("location.hash");
const type = (id, value) => chrome.js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
const shot = async name => { if (SHOTS) await chrome.screenshot(join(SHOTS, name + ".png")); };
/** Runs the design rules on whatever is showing now. Every problem is printed. */
const design = async screen => {
  const problems = await chrome.js(DESIGN_PROBE);
  check("design rules hold on " + screen, problems.length === 0, problems.length + " problems");
  problems.forEach(p => console.log("        " + p));
};

try {
  // ---- arriving with nobody signed in
  await chrome.send("Page.navigate", { url: base + "/" });
  await chrome.until("!!document.getElementById('loginFormEl')");
  expectEqual("the start address leads to the login page", await hash(), "#/login");
  expectEqual("the login page has its title", await chrome.js("document.title"), "SSwinGG | Cricket Bat Swing Analyzer");
  check("the login stylesheet is applied", await chrome.js("getComputedStyle(document.querySelector('.brand-logo')).fontFamily.includes('Source Serif 4')"));
  expectEqual("the left panel lists four things the product does, each with a drawn icon",
    await chrome.js("[...document.querySelectorAll('.feature-item')].map(f => f.querySelector('svg[data-icon] > *') instanceof SVGElement && f.querySelector('strong').textContent.trim())"),
    ["Bat speed", "Impact and control", "Shot direction", "Sensor and browser"]);
  const mark = await chrome.js("(() => { const b = document.querySelector('.brand-icon svg[data-icon=bat]').getBoundingClientRect(); return [Math.round(b.width) > 30, Math.round(b.width) === Math.round(b.height)]; })()");
  expectEqual("the bat mark is drawn at its size", mark, [true, true]);
  await design("the login form");
  await shot("1-login");

  await chrome.send("Page.navigate", { url: base + "/#/dashboard/live" });
  await sleep(600);
  expectEqual("the dashboard address is refused without sign-in", await hash(), "#/login");

  // ---- the two forms
  await chrome.click("#registerTab");
  await sleep(100);
  expectEqual("the Create Account tab shows the registration form",
    await chrome.js("[document.getElementById('registerForm').classList.contains('active'), document.getElementById('loginForm').classList.contains('active')]"), [true, false]);

  await type("registerName", "Asha Rao"); await type("registerTeam", "Blue"); await type("registerEmail", "asha@example.org");
  await type("registerPassword", "secret1"); await type("registerConfirm", "secret2");
  await chrome.js("document.getElementById('agreeTerms').checked = true; document.getElementById('registerFormEl').requestSubmit()");
  await sleep(150);
  expectEqual("registration reports passwords that differ", await text("#registerError"), "Passwords do not match");
  check("the error is shown", await chrome.js("document.getElementById('registerError').classList.contains('visible')"));
  expectEqual("still on the login page", await hash(), "#/login");

  const eye = "(() => { const b = document.querySelector('#registerForm .password-toggle'); return [document.getElementById('registerPassword').type, b.getAttribute('aria-label'), b.querySelector('svg').getAttribute('data-icon')]; })()";
  expectEqual("the eye button starts with the password hidden", await chrome.js(eye), ["password", "Show password", "eye"]);
  await chrome.click("#registerForm .password-toggle");
  await sleep(100);
  expectEqual("the eye button reveals the password and says what it will do next", await chrome.js(eye), ["text", "Hide password", "eye-off"]);

  await chrome.click("#registerForm .google-btn");
  await sleep(150);
  expectEqual("Google sign-in explains that demo mode has none", await text(".toast:last-child"), "Google sign-in is not available in demo mode");
  expectEqual("a toast on the login page carries an icon for its kind", await chrome.js("document.querySelector('.toast:last-child svg').getAttribute('data-icon')"), "info");
  await design("the registration form, with an error and a toast showing");

  await chrome.click("#registerForm .form-footer a");
  await sleep(100);
  expectEqual("the Sign in link returns to the login form and hides the error",
    await chrome.js("[document.getElementById('loginForm').classList.contains('active'), document.getElementById('registerError').classList.contains('visible'), location.hash]"), [true, false, "#/login"]);

  await chrome.js("document.getElementById('loginFormEl').requestSubmit()");
  await sleep(150);
  expectEqual("an empty login form is stopped by the browser", [await hash(), await chrome.js("document.getElementById('loginEmail').validity.valueMissing")], ["#/login", true]);

  // ---- signing in (demo mode accepts any email)
  await type("loginEmail", "gaurav@example.org"); await type("loginPassword", "anything");
  await chrome.js("document.getElementById('loginFormEl').requestSubmit()");
  await sleep(200);
  expectEqual("demo sign-in says what it is doing", await text(".toast:last-child"), "Demo mode: opening the dashboard");
  await chrome.until("location.hash === '#/dashboard/home' && !!document.getElementById('userName')", 6000);
  await chrome.until("getComputedStyle(document.getElementById('sessionsLoading')).display === 'none'");
  expectEqual("the dashboard greets the user by the part of the email before the @", [await text("#userName"), await text("#userAvatar")], ["gaurav", "G"]);
  expectEqual("the dashboard has its title", await chrome.js("document.title"), "SSwinGG | Cricket Bat Swing Analyzer Dashboard");
  check("the dashboard stylesheet replaced the login one", await chrome.js("getComputedStyle(document.body).backgroundColor !== '' && !document.querySelector('.auth-page')"));
  expectEqual("an empty account shows the empty state", await chrome.js("getComputedStyle(document.getElementById('noSessions')).display !== 'none'"), true);
  expectEqual("the header buttons carry drawn icons", await chrome.js("['navHome', 'navLive'].map(id => { const svg = document.querySelector('#' + id + ' svg'); return svg.getAttribute('data-icon') + ' ' + (svg.firstElementChild instanceof SVGGeometryElement) + ' ' + (svg.getBoundingClientRect().width > 8); })"), ["house true true", "radio true true"]);
  await design("the Home view of an empty account");
  await shot("2-home");

  // ---- the built-in demo, with its own random swings
  await chrome.click(".welcome-banner .nav-btn.accent");
  await chrome.until("location.hash === '#/dashboard/live'");
  await sleep(500);
  expectEqual("Start Demo opens the live view with a demo bat", [await text("#bleText"), await text("#statusText"), await text("#liveMode")], ["DEMO BAT", "DEMO", "(DEMO MODE)"]);
  const canvas = await chrome.js("(() => { const c = document.querySelector('#threeContainer canvas'); return c ? [c.width > 100, c.height > 100] : null; })()");
  expectEqual("the 3D bat is drawn", canvas, [true, true]);

  await chrome.click("#startShotBtn");
  await sleep(2300);
  const during = await chrome.js("({ status: document.getElementById('statusText').textContent, speed: parseFloat(document.getElementById('valSpeed').textContent), stopShown: getComputedStyle(document.getElementById('stopShotBtn')).display !== 'none' })");
  check("readings arrive while recording", during.status === "RECORDING" && during.stopShown && Number.isFinite(during.speed), JSON.stringify(during));
  expectEqual("the dot beside LIVE SESSION is on while recording", await chrome.js("document.querySelector('.rec-dot').classList.contains('on')"), true);
  await design("the Live view while recording");
  await shot("3-recording");
  await chrome.click("#stopShotBtn");
  await sleep(400);
  const after = await chrome.js(`(() => { const s = window.sswinggTest.internals(); return { shots: s.shots.length, points: s.shots[0].dataPoints, peak: s.shots[0].peakSpeed, chart: s.chart.data.length, accel: s.accelChart.length, card: document.querySelectorAll('#shotsGrid .shot-card').length, coach: !!document.getElementById('aiAnalysisCard') }; })()`);
  check("the demo shot is saved with about two seconds of readings", after.shots === 1 && after.points >= 70 && after.points <= 100 && after.card === 1 && after.coach, JSON.stringify(after));
  check("the demo swing reaches a realistic speed", after.peak > 20 && after.peak < 60, "peak " + after.peak);
  check("both charts hold the readings", after.chart === after.points && after.accel === Math.min(after.points, 80), JSON.stringify(after));
  expectEqual("the dot beside LIVE SESSION is off again", await chrome.js("document.querySelector('.rec-dot').classList.contains('on')"), false);
  const summary = await chrome.js("(() => { const c = document.getElementById('aiAnalysisCard'); return { title: c.querySelector('.card-title').textContent.trim(), headings: [...c.querySelectorAll('.summary-heading')].map(h => h.querySelector('svg').getAttribute('data-icon') + ' ' + h.textContent.trim()), basis: c.querySelector('.summary-basis').textContent.replace(/\\d+/g, 'N').trim() }; })()");
  expectEqual("the session summary says what it is based on, and claims no AI", summary,
    { title: "SESSION SUMMARY", headings: ["check STRENGTHS", "lightbulb TIPS", "triangle-alert CORRECTIONS"], basis: "Rated on best speed, average impact and average accuracy. N readings, N shot." });
  await design("the Live view after a shot, with the session summary");
  await shot("4-after-shot");

  await chrome.click("#shotsGrid .shot-card");
  await sleep(900);
  expectEqual("a shot card opens its detail window", await chrome.js("[document.getElementById('shotDetailOverlay').classList.contains('visible'), document.getElementById('shotDetailTitle').textContent]"), [true, "Shot #1 Analysis"]);
  expectEqual("the close button is named for screen readers", await chrome.js("document.querySelector('.shot-detail-close').getAttribute('aria-label')"), "Close");
  await design("the shot detail window");
  await shot("5-shot-detail");
  await chrome.js("document.getElementById('shotDetailOverlay').click()");
  await sleep(150);
  expectEqual("clicking beside the window closes it", await chrome.js("document.getElementById('shotDetailOverlay').classList.contains('visible')"), false);

  await chrome.click(".btn-back");
  await chrome.until("location.hash === '#/dashboard/home'");
  await sleep(300);
  expectEqual("BACK stops the demo and shows the saved shot on Home", [await text("#bleText"), await text("#statusText"), await text("#homeShotCount"), await text("#statSwings")], ["NO SENSOR", "STANDBY", "1 shot", "1"]);
  await design("the Home view with a saved shot");

  await chrome.click("#clearShotsBtn");
  await sleep(150);
  expectEqual("CLEAR warns before deleting and offers both ways", await chrome.js("[document.getElementById('clearOverlay').classList.contains('visible'), document.getElementById('clearAllBtn').textContent.trim(), document.getElementById('clearChooseBtn').textContent.trim()]"), [true, "Delete all 1 shot", "Choose shots"]);
  await design("the warning before shots are deleted");
  await chrome.click("#clearChooseBtn");
  await chrome.click("#homeShotsGrid .shot-card");
  await sleep(150);
  expectEqual("choosing marks the shot and opens no detail window", await chrome.js("[document.querySelector('#homeShotsGrid .shot-card').classList.contains('selected'), document.getElementById('selectCount').textContent.trim(), document.getElementById('shotDetailOverlay').classList.contains('visible')]"), [true, "1 selected", false]);
  await design("the Home view while shots are chosen");
  await chrome.click("#cancelSelectBtn");
  await sleep(150);
  expectEqual("Cancel keeps the shot", await chrome.js("JSON.parse(localStorage.getItem('sswingg_shots')).length"), 1);
  expectEqual("nothing follows the pointer or reacts to scrolling", await pointerAndScrollListeners(chrome), []);

  await chrome.click("#startShotBtn");
  await sleep(150);
  expectEqual("recording is refused once the demo has stopped", await text(".toast:last-child"), "Connect the sensor or start the demo first.");

  // ---- signing out
  await chrome.click("#logoutBtn");
  await chrome.until("location.hash === '#/login'", 6000);
  expectEqual("logout forgets the demo user", await chrome.js("localStorage.getItem('sswingg_demo_user')"), null);
  expectEqual("the saved shot stays in the browser", await chrome.js("JSON.parse(localStorage.getItem('sswingg_shots')).length"), 1);
  await chrome.send("Page.navigate", { url: base + "/#/dashboard/home" });
  await sleep(600);
  expectEqual("the dashboard is closed again after logout", await hash(), "#/login");

  // ---- a demo user stored by another tab is accepted without a reload
  await chrome.js("localStorage.setItem('sswingg_demo_user', JSON.stringify({ email: 'other@example.org', displayName: 'Other Tab', uid: 'demo-2' }))");
  await chrome.js("location.hash = '#/dashboard/home'");
  await chrome.until("location.hash === '#/dashboard/home' && !!document.getElementById('userName')", 6000);
  expectEqual("a demo user stored by another tab is accepted", await text("#userName"), "Other Tab");

  expectEqual("no errors were thrown on the page", chrome.problems, []);
} catch (error) {
  failed++;
  console.log("FAIL  the smoke test could not finish: " + error.message.split("\n")[0]);
} finally {
  chrome.close();
  server.close();
}
console.log(failed === 0 ? "SMOKE OK" : `SMOKE FAILED: ${failed} problems`);
process.exitCode = failed === 0 ? 0 : 1;
