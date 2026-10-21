# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should start with [README.md](README.md).

## What this is

The SwingLab web app as an Angular 21 single-page app: a login page and a dashboard with a Home view and a Live view. It talks to a bat sensor over Web Bluetooth and to a backend under `/api`.

It is a rewrite of the plain HTML frontend in the [Cricket](https://github.com/gaurav3611/Cricket) repository, and it must keep behaving like it: same numbers, same states, same stored data. Its look and wording were reworked on purpose and follow the design rules below. Most rules in this file protect one of those two things.

Status: it builds, passes its checks and runs locally. It is not deployed. Real Firebase sign-in and a real bat have not been tried.

## Read this first

1. **The recording of the original is the contract.** `tools/golden/original-dashboard.json` holds what the original dashboard showed for nine fixed shots. `npm run parity` compares this app with it. Never edit that file by hand, and never change an expected value to make a check pass.
2. **Element ids and class names are part of the contract.** The parity check finds elements by the original ids, and the two page stylesheets select by the original classes. Renaming or removing one breaks both.
3. **The design rules are checked, so do not bring the old look back.** No purple, no gradients, no pill shapes, no emoji, no dashes or exclamation marks in text, no motion except the spinner. `npm run smoke` fails with the rule and the selector or text that broke it. See "Design rules" below.
4. **Whitespace inside elements can be visible to the parity check.** It compares text with spaces collapsed. A space added between a tag and its text, as in `<h4> Session`, changes the text. Line breaks between tags are fine. Put an icon next to its label with no space between them, and let the stylesheet's `gap` do the spacing.
5. **A text the original also showed can only change through the wording list.** Change it in the app and add the old and new phrase to `tools/golden/copy-changes.json`. Without the entry, `npm run parity` reports a difference. With an entry that matches nothing, it reports a stale rule.
6. **Use Angular 21 and the Node you have.** Angular 22 does not support Node 25, which is on the owner's machine. Do not run `ng update` to a new major without checking the Node version first.
7. **Do not sign up or sign in during checks.** `npm start` uses the real Firebase project `cricpro-app`. Use the demo build for anything automated.

## Commands

```bash
npm start              # dev server, real Firebase sign-in, http://localhost:4200. Same as: npm run dev
npm run start:demo     # dev server, demo mode: any email signs in. Same as: npm run dev:demo
npm test               # unit tests, a few seconds
npm run parity         # demo build, then the comparison with the original
npm run smoke          # demo build, then login, demo, 3D view and logout in a browser, plus the design rules
npm run verify         # unit tests, parity and smoke together. Run this before calling work done.
npm run build          # production build
npm run icons          # write src/app/shared/icon-data.ts again after editing the list in tools/icons.mjs
```

- `ng serve` forwards `/api` to `http://localhost:5050`. Start the Java API or the Flask backend there if the task needs real answers. The app also works with no API.
- `parity` and `smoke` need Google Chrome. They start their own file server and browser, and need no backend and no account.
- Every `ng` command prints a notice about Node 25 being an odd-numbered release. That is expected.

## Code map

| Path | Holds |
|---|---|
| `src/app/app.routes.ts`, `app.config.ts` | Routes, hash-based addresses, the HTTP client with the token interceptor |
| `src/app/core/` | `AuthService`, `authGuard`, `ApiService`, toasts, sign-in error texts |
| `src/app/analysis/swing-analysis.ts` | The swing arithmetic as pure functions. No Angular. |
| `src/app/analysis/shot-history.service.ts` | Shots in `localStorage` |
| `src/app/sensor/` | Web Bluetooth, the packet decoder, the simulated bat |
| `src/app/three/bat-scene.ts` | The 3D bat, three.js r128 |
| `src/app/pages/login/` | Login and registration page |
| `src/app/pages/dashboard/live-session.store.ts` | State and behaviour of a session, as signals |
| `src/app/pages/dashboard/*-view.ts`, `shot-detail.ts` | What is on screen. `live-view.ts` owns the two charts and the 3D scene. |
| `src/app/shared/icon.ts`, `icon-data.ts` | `<app-icon>` and the shapes it draws. `icon-data.ts` is generated, do not edit it. |
| `src/app/testing/` | Helpers for unit tests. Excluded from the app build. |
| `src/environments/` | Firebase config per build: production, development, demo |
| `tools/parity.mjs`, `tools/golden/` | The comparison with the original, its recording, and `copy-changes.json`, the list of deliberate wording changes |
| `tools/smoke.mjs`, `tools/design-rules.mjs` | The click-through check and the design rules it runs |
| `tools/icons.mjs`, `tools/browser.mjs` | The icon generator, and the file server and Chrome driver the checks share |

## Design rules

The owner asked for the generic look to go: purple gradients, pill shapes, emoji, slogans, and things that move or glow. These rules are what replaced it. `tools/design-rules.mjs` checks them on seven screens and in both stylesheets.

- **Colour.** Flat fills only. No purple and no `gradient()`. Use the variables in `:root`, and keep their meaning: forest green for the brand, the main action and bat speed, field green for straight and good, ochre for the off side and a fair result, slate blue for the leg side, red for stop and poor. The charts and the 3D scene use the same values, from `src/app/shared/palette.ts`. Change the stylesheets and that file together.
- **Light first.** The look is the "Ground" theme: warm ivory page, white surfaces, pale sage for supporting areas. Inter for the interface, Source Serif 4 for titles and large figures, tabular figures for numbers. Cricket motifs only where they mean something: crease lines under the header, the ground with its 30-yard circle and pitch, a boundary arc. No dark sections, no glass or blur.
- **Colours of the original.** Where the parity check compares a colour, `tools/golden/copy-changes.json` lists the old colour and its replacement, in the same way as wording changes.
- **Shape.** `--radius-sm` 4px for badges and chips, `--radius-md` 6px for buttons, inputs and tiles inside a card, `--radius-lg` 8px for cards and windows. `50%` only on things that are round by nature and square in size.
- **Icons.** `<app-icon name="..." />`, never an emoji or a character such as an arrow. To add one, put its Lucide name in `tools/icons.mjs` and run `npm run icons`. An icon is decoration: a button with nothing but an icon needs an `aria-label`.
- **Motion.** The loading spinner is the only animation. No `@keyframes` besides `spin`, no `transform`, `box-shadow` or `filter` in a `:hover` rule, no listener for mouse movement or scrolling on the window. Hover may change a colour or a border. A transition that shows data changing is fine.
- **Words.** Plain sentences that say what the product does. Only state what the code does: check the number before writing it. No em or en dashes, no exclamation marks, no "AI" for what is a set of thresholds. The remarks of the session summary each name the number they are based on.

## Rules that keep its behaviour identical to the original

- **Formulas are copied step for step.** In `swing-analysis.ts`, keep the constants and the order of operations. A reordered multiplication can change a last digit, and the parity check compares numbers.
- **The store mirrors the original script.** Each method of `LiveSessionStore` matches a function of the original `dashboard.html`. Odd behaviour is usually deliberate: the speed chart is not redrawn when a shot is saved, the Home button does not reload data, counts keep their old text. The README lists these. Do not tidy them away.
- **Both views stay mounted.** `DashboardPage` shows Home or Live by `display`, and `dashboard/:view` reuses the component. Do not turn the views into separate routes, or a session would be lost when the user visits Home.
- **Page components use `ViewEncapsulation.None`.** The page stylesheets style `body` and `:root`, so they cannot be scoped. Angular removes each stylesheet when its page is left. `src/styles.css` gives every component element `display: contents` so the CSS sees the original parent and child structure. A new component under a page needs its selector added there. `app-icon` is the exception: it is a box and styles itself.
- **three.js stays at r128.** Newer releases light the scene differently.
- **Storage keys are shared with the original site.** `swinglab_shots` and `cricpro_demo_user`. Renaming them discards users' data.
- **The Bluetooth names and scales must match the firmware.** They are in `sensor/sensor-packet.ts`. Do not change them without a matching firmware change.

To change behaviour on purpose: change the original too and run `npm run parity:record`, or add the difference to the table in the README and update the checks to state the new behaviour. To change only a text, use the wording list, see rule 5 at the top.

## Sign-in and demo mode

- `AuthService` wraps Firebase Authentication. `authGuard` protects `dashboard/:view`.
- Demo mode is on when `environment.firebase.apiKey` is `YOUR_API_KEY`, which is the case only in the `demo` build configuration. Any email then signs in and the user lives in `localStorage`.
- The Firebase values in `src/environments/` are the public web config, the same ones the original site serves. They are not secrets. Never add a service account key or a user's token to this repository.
- `window.swinglabTest` lets the parity tool feed readings. It is installed only when `environment.testHooks` is true, which is the demo build. Do not use it from app code.

## Checks and tests

| Check | Proves |
|---|---|
| `npm run parity` | For nine fixed shots, every text, colour, chart content and stored value matches the original, at 43 points. Texts are compared after the listed wording changes are applied. |
| `npm test` | The analysis functions and the store match the recording, plus scoring boundaries, packets, storage, the guard |
| `npm run smoke` | Login forms, guard, the random demo, 3D view, shot detail, logout, and the design rules on seven screens |

- **Unit tests that touch storage call `useMemoryStorage()` first.** Node 25 defines its own `localStorage` with no working methods, and it hides the test environment's.
- **Files under `src/app/testing/` are not part of the app build.** Anything that uses `vi` or imports the recording belongs there or in a `.spec.ts` file.
- **A new check passing the first time proves little.** Break the code on purpose once and confirm the check fails.
- **Unit tests compare texts through `reworded()`** from `src/app/testing/golden.ts`, which applies the same wording list as the parity tool.
- **The parity scenario lives in `tools/parity.mjs`.** If a behaviour is not exercised by its steps, the check cannot see it. Add a step, then record again.
- **No check covers real sign-in or a real bat.** Say so when a change touches `AuthService` or `BluetoothService`.

## Conventions

- Standalone components, `ChangeDetectionStrategy.OnPush`, signals for state, `inject()` for dependencies, the `@if` and `@for` template syntax. No NgModules, no zone.js.
- File names follow the Angular 2025 style: `login-page.ts`, `live-session.store.ts`, `auth.service.ts`.
- Run `npx prettier --write "src/**/*.ts"` on TypeScript. Do not run Prettier on the HTML templates or the CSS: the templates depend on where whitespace is, see rule 4 at the top.
- Comments say why, especially where code mirrors the original or keeps a quirk on purpose.
- Bind text with `{{ }}` and never with `innerHTML`.

## Git

- The repository is `https://github.com/gaurav3611/Cric-Pro-FE`, public, branch `main`.
- The Angular project inside is still named `angular-cricket-frontend`. The build goes to `dist/angular-cricket-frontend/browser`, and the tools and `angular.json` rely on that name. Renaming the repository did not and should not rename it.
- Commit or push only when the user asks.
- The repository is public. Never commit a service account key, an ID token or a `.env` file.

## Not done yet

Do not assume any of these exist:

- Hosting or a deployment setup.
- A run against real Firebase sign-in, registration or Google sign-in.
- A run with a real bat sensor.
- Checks in browsers other than Chrome.

## Keeping this file current

Update this file when a page or view is added, the way parity is checked changes, a design rule is added or dropped, the Angular or three.js version changes, or an item under "Not done yet" gets done.
