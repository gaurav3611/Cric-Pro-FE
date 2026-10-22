/*
  Shared by the tools in this folder: a tiny static file server and a way to drive headless
  Chrome through its DevTools protocol. No packages are needed, only Node and Chrome.
*/
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const DEFAULT_CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".svg": "image/svg+xml" };

/**
 * Serves the files in `root` on a free local port. `api(path)` may return an object to answer
 * a request as JSON, which is how the tools stand in for the backend.
 */
export function serve(root, api = () => null) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const answer = api(path, req.method);
    if (answer) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer));
      return;
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise(done => server.listen(0, "127.0.0.1", () => done(server)));
}

/** Starts headless Chrome with one blank page and returns a small client for it. */
export async function openChrome({ chromePath = DEFAULT_CHROME, width = 1440, height = 1100 } = {}) {
  if (!existsSync(chromePath)) throw new Error("Chrome not found at " + chromePath + ". Pass --chrome <path> or set CHROME_PATH.");
  const profile = mkdtempSync(join(tmpdir(), "sswingg-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 400);
  // WebGL is needed for the 3D bat, so the software renderer is allowed.
  const proc = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page")?.webSocketDebuggerUrl; } catch { /* not up yet */ }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) { proc.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener("open", r));

  let nextId = 0;
  const pending = new Map();
  /** problems: uncaught errors on the page. acceptDialogs: what to answer to confirm() boxes. */
  const client = { problems: [], acceptDialogs: true };
  ws.addEventListener("message", event => {
    const m = JSON.parse(event.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") client.problems.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split("\n")[0]);
    if (m.method === "Page.javascriptDialogOpening") client.send("Page.handleJavaScriptDialog", { accept: client.acceptDialogs });
  });
  client.send = (method, params = {}) => new Promise(res => { const id = ++nextId; pending.set(id, m => res(m.result ?? m)); ws.send(JSON.stringify({ id, method, params })); });
  /** Runs an expression in the page and returns its value. */
  client.js = async expression => {
    const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n  while running: " + expression.slice(0, 160));
    return r.result.value;
  };
  /** Waits until an expression is true in the page. */
  client.until = async (expression, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { if (await client.js(expression)) return; } catch { /* page still loading */ } await sleep(100); }
    throw new Error("timed out waiting for: " + expression);
  };
  client.click = selector => client.js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  client.screenshot = async file => { const r = await client.send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(r.data, "base64")); };
  client.close = () => { ws.close(); proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } };
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  return client;
}
