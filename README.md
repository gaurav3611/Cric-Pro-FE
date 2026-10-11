# Cric-Pro-FE

The frontend of SwingLab, a cricket bat swing analyzer, written as an Angular single-page app. Its login page carries the name CricPro.

It is a rewrite of the plain HTML and JavaScript frontend in the [Cricket](https://github.com/gaurav3611/Cricket) repository, `frontend/index.html` and `frontend/dashboard.html`. It behaves the same: every number, list and state the dashboard displays is checked against a recording of the original. Its look and its wording were then reworked on purpose, see [Design rules](#design-rules).

**Status:** it builds, passes its tests and runs locally. It is not deployed. Sign-in with a real Firebase account and Bluetooth with a real bat have not been tried yet, see [Not checked yet](#not-checked-yet).

| | |
|---|---|
| Framework | Angular 21.2, standalone components, signals, no zone.js |
| Language | TypeScript 5.9 |
| Charts | Chart.js 4.5 |
| 3D bat | three.js r128, the release the original page used, so the scene renders the same |
| Sign-in | Firebase Authentication, modular SDK 12 |
| Icons | Inline SVG, shapes from Lucide 1.55 plus a cricket bat drawn for this app |
| Tests | Vitest for units, headless Chrome for the two browser checks |

Angular 21 was chosen over 22 because 22 does not support Node 25, which is what the development machine has.

## Run it

You need Node 20.19, 22.12, or 24 and newer. Node 25 works and prints a notice that it is not a long-term release.

```bash
git clone https://github.com/gaurav3611/Cric-Pro-FE.git
cd Cric-Pro-FE
npm install
npm run dev
```

Then open `http://localhost:4200`. This is the real app: sign-in goes to the Firebase project `cricpro-app`.

To try it with no account and no Firebase at all:

```bash
npm run dev:demo
```

In the demo build any email and password sign in, and the user is kept in the browser only.

| Command | What it does |
|---|---|
| `npm start` or `npm run dev` | Development server with real Firebase sign-in |
| `npm run start:demo` or `npm run dev:demo` | Development server in demo mode |
| `npm run build` | Production build into `dist/angular-cricket-frontend/browser` |
| `npm run build:demo` | Demo-mode build, used by the two browser checks |
| `npm test` | Unit tests |
| `npm run parity` | Builds, then compares the app with the recording of the original dashboard |
| `npm run smoke` | Builds, then clicks through login, the demo, the 3D view and logout, and checks the design rules on every screen |
| `npm run verify` | All of the above checks in one go |
| `npm run parity:record` | Records the original dashboard again, see [How it was checked](#how-it-was-checked) |
| `npm run icons` | Writes `src/app/shared/icon-data.ts` again after the icon list in `tools/icons.mjs` changed |

Things to know:

- **Addresses use a `#`.** The pages are `/#/login`, `/#/dashboard/home` and `/#/dashboard/live`. Everything after the `#` stays in the browser, so the app works on any static host with no rule for unknown paths.
- **The API is expected on the same address, under `/api`.** In development, calls to `/api` are forwarded to `http://localhost:5050`, where the Java API or the Flask backend runs. See [proxy.conf.json](proxy.conf.json). Without an API the app still works: the session list is empty and the totals come from shots kept in the browser.
- **Bluetooth needs Chrome or Edge**, on `https` or `localhost`.
- **Saved data carries over.** Shots and the demo user are kept under the same browser storage keys as the original site, `swinglab_shots` and `cricpro_demo_user`.
- **The two browser checks need Google Chrome.** Set `CHROME_PATH` if it is not in the usual place.

## With and without the backend

The app runs without a backend. Use one when you want what is stored with the account.

| | Needs the backend |
|---|---|
| Demo mode, Bluetooth, recording shots, every number, chart and the 3D bat | No. All of it is worked out in the browser. |
| Recent Shots, the last 50 | No. They are kept in this browser. |
| Session History, and the totals of an account that has sessions | Yes. `GET /api/sessions` and `GET /api/profile`. |
| Saving the name and team given at registration | Yes. `PUT /api/profile`. |

The backend is [java-cricket-backend](https://github.com/gaurav3611/java-cricket-backend), or the Flask backend in the Cricket repository. During development, start it on port 5050 and start this app beside it. The dev server forwards `/api` to it:

```bash
# terminal 1, in java-cricket-backend. It needs Java 21.
./mvnw spring-boot:run

# terminal 2, in this folder
npm run dev
```

Two things to know:

- **This app reads sessions and does not write them.** A shot recorded here stays in the browser. Sessions get into the backend when a bat sends its readings to the API over Wi-Fi and a session is started and stopped there. Until that happens, Session History is empty even with the backend running.
- **Without a Firebase key the backend is in its own demo mode.** It accepts every caller as one demo user and stores nothing. With the key it checks the sign-in token this app sends.

## Serve the build

`npm run build` produces plain static files. Any static host can serve them.

The Java API can serve them too, so that the app and the API share one address. With the two repositories cloned side by side:

```bash
cd ../java-cricket-backend
FRONTEND_DIR=../Cric-Pro-FE/dist/angular-cricket-frontend/browser ./mvnw spring-boot:run
```

Then open `http://localhost:5050`. This combination was tried and works. Use your own folder name in place of `Cric-Pro-FE` if you cloned into another one. Hosting on Vercel is not set up.

## How it is put together

```
src/app/
├── app.routes.ts          login, dashboard/:view, and the sign-in guard on the dashboard
├── core/                  sign-in (AuthService), the guard, the API client, toasts
├── analysis/              swing-analysis.ts: the swing arithmetic as plain functions
│                          shot-history.service.ts: shots kept in the browser
├── sensor/                Bluetooth, the packet format, the simulated bat
├── three/bat-scene.ts     the 3D bat and its swing trace
├── pages/login/           the login and registration page
├── pages/dashboard/       dashboard-page: header and the two views
│                          home-view, live-view, shot-detail: what is on screen
│                          live-session.store.ts: the state and behaviour of a session
├── shared/                icon.ts: <app-icon>, and the icon shapes it draws
└── testing/               helpers for the unit tests
tools/                     parity.mjs and smoke.mjs, the recording and the list of wording changes
                           they use, design-rules.mjs, and icons.mjs
```

- **One store holds a session.** `LiveSessionStore` is the original dashboard's script turned into a class: the sensor, recording shots, and every number on screen, as signals. The components show them.
- **The arithmetic is separate and pure.** `swing-analysis.ts` has no Angular in it. The formulas and constants are the original ones, in the original order of operations.
- **Home and Live are one page.** `/dashboard/home` and `/dashboard/live` show the same component with one of its two views visible, as the original did. That is why a session, its charts and the 3D bat survive a visit to Home.
- **Each page has one stylesheet.** [login-page.css](src/app/pages/login/login-page.css) began as the original `main.css` plus `auth.css`, and [dashboard-page.css](src/app/pages/dashboard/dashboard-page.css) as the dashboard's `<style>` block. They keep the original layout, fonts, ids and nearly all class names, and now follow the [design rules](#design-rules). Each is loaded only while its page is shown.
- **Login and dashboard load separately.** The dashboard's code, with Chart.js and three.js, is fetched only after sign-in.

## How it was checked

The original frontend had no tests, so its behaviour was recorded and the recording is the reference.

- **The recording.** `tools/parity.mjs record` opens the original dashboard in headless Chrome and feeds it nine fixed shots through its own functions. At 43 points it saves what the page shows: every number and label, badge colours, the score ring, shot cards, the coach's summary, chart contents, the 3D bat's rotation, and what was written to browser storage. The result is [tools/golden/original-dashboard.json](tools/golden/original-dashboard.json).
- **Parity check.** `npm run parity` does the same with this app and compares. All 43 steps match. Where this app words something differently on purpose, the phrase is listed in [tools/golden/copy-changes.json](tools/golden/copy-changes.json), and the recorded text is rewritten with that list before it is compared. The numbers inside every text are therefore still the original's. A listed phrase that the recording does not contain fails the check.
- **Unit tests.** 37 tests. They run the same nine shots through the analysis functions and through the store, with no browser, and compare with the recording. They also cover the scoring boundaries, the packet format, stored shots, the simulated bat and the sign-in guard.
- **Smoke test.** `npm run smoke` covers what the recording does not: the login and registration forms, the guard, the built-in demo with its random swings, the 3D view, the shot detail window and logout. On seven screens it also runs the [design rules](#design-rules). 49 checks in all.
- **Layout.** Right after the port, with both apps in the same state, the position and size of 39 elements on the login page, the Home view and the Live view were measured, and all 39 were identical. The redesign then changed corner radii, some paddings and two gaps, so the sizes no longer match to the pixel. This was not measured again.
- **Proof the checks can fail.** 23 one-line changes were made to this app, one at a time: constants, thresholds, texts, a removed guard, behaviour the original does not have. Every one was caught by at least one check. Gaps found this way were closed. After the redesign, 20 more were made: 15 that each break a design rule, and 5 for the comparison with the original, namely two wrong numbers, a wrong icon, a changed remark and an unused wording rule. All 20 were caught.

To record again after the original dashboard changes, with the Cricket repository cloned next to this one:

```bash
npm run parity:record
npm run verify
```

## Design rules

The original look leaned on purple gradients, pill shapes, emoji, glowing hover effects, a moving background and slogans. This app replaces each of those with something plainer. `npm run smoke` checks the rules below on every screen it visits, and reads the stylesheets too, so a rule for an element that is not showing is still checked. The check is [tools/design-rules.mjs](tools/design-rules.mjs).

| Rule | What it replaced |
|---|---|
| Colours are flat. No purple, no gradients. A colour means the same thing everywhere: cyan for speed, the leg side and the main action, orange for the off side, green for straight and good, red for stop and poor. | Purple buttons and bars, gradient fills on buttons, headings and bars, a tinted page background, neon glows |
| Corners are 4, 6 or 8 pixels. Only what is round by nature is a circle: status lights, the avatar, the spinner, the cricket ground. | Pill-shaped badges and status indicators, card corners of up to 20 pixels |
| Icons are SVG, drawn by `<app-icon>`. | 58 emoji and symbol characters, including the favicon |
| Text says what the product does and names its numbers. No em or en dashes, no exclamation marks, no claims the code does not back. | "train smarter, swing harder, and play like a pro", "AI-powered technique feedback", "ELITE LEVEL! Professional-grade mechanics!", "up to 150+ km/h" |
| Nothing moves by itself except the loading spinner. Nothing moves or glows under the mouse, follows the pointer or reacts to scrolling. A transition that shows data changing, such as a bar growing, is fine. | Thirty drifting particles, a sliding grid, a swinging bat, pulsing lights, cards and buttons that lift and glow on hover |

How to work within them:

- **Add an icon:** add its [Lucide](https://lucide.dev) name to the list in `tools/icons.mjs`, run `npm run icons`, and write `<app-icon name="..." />`. The icon takes the colour and the size of the text around it. A button that holds only an icon needs an `aria-label`. Lucide's licence is shipped with the build as `licenses/lucide.txt`.
- **Change a text:** change it in the app. If the original dashboard showed that text too, add the old and the new phrase to `tools/golden/copy-changes.json`, or `npm run parity` will report the difference.
- **The session summary is not AI.** Its remarks come from fixed thresholds in `swing-analysis.ts`, and each one names the number it is based on. The page says so and no longer calls it an AI coach.
- **People who ask their system for less motion** get no transitions at all and a slower spinner.

## What is different from the original

| Area | Original | This app |
|---|---|---|
| Look and wording | Purple, gradients, pills, emoji, moving background, slogans | See [Design rules](#design-rules) |
| The dot beside LIVE SESSION | Always red and pulsing | Grey, and red while a shot is being recorded |
| Gaps around the two shot panels | Each panel touched the box below it | The same gap above and below |
| Toasts | See-through and blurred, with whatever was underneath showing as a smear | Solid |
| Light under the 3D bat | Purple | Blue |
| Empty state of Session History | Promised that recorded swings would appear there | Says that sessions come from the account and that recorded shots are under Recent Shots, which is what happens |
| Pages | Two HTML files, `/` and `/dashboard.html` | One page, addresses `/#/login` and `/#/dashboard/...` |
| Libraries | Loaded from CDNs when the page opens, Chart.js at whatever version is newest | Bundled at fixed versions |
| Demo mode | Switched on by editing the key in `firebase-config.js` | A separate build, `npm run build:demo` |
| Name after registering | Could be missing until the next visit, because the page changed before the name was saved | Shown at once |
| No WebGL in the browser | The script stopped with an error | The live view works without the 3D bat |
| Backup 3D scene, for when `three-bat.js` failed to load | Present | Not ported. The 3D code is part of the app and cannot fail to load. |
| `dashboard.js`, `bluetooth.js`, `dashboard.css` | Present but not used by any page | Not ported |

Kept on purpose, quirks included:

- The "Best Speed" tile shows the API's average speed when the API has stats.
- The Home button in the header does not reload the Home view's data. The BACK button of the Live view does.
- Counts and lists keep their last content when there is nothing new to show, for example the shot count after clearing the history.
- The control score is 0 for any real swing, which keeps the accuracy at 40% or below.
- A shot's direction comes from its last reading.
- The login page says CricPro and the dashboard says SwingLab.

## Not checked yet

- **Real sign-in.** Signing in, registering and Google sign-in against the real Firebase project were not tried, because registering creates a real account. What was checked: the production build starts Firebase without errors and sends a signed-out visitor to the login page.
- **A real bat.** The Bluetooth code is a direct port and the packet format is tested, but no sensor was connected.
- **Deployment.** Nothing is hosted.
- **Other browsers.** Everything was run in Chrome.
