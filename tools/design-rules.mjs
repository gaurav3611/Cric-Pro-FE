/*
  The design rules of this app, written as a check that runs inside the page.

  The rules, and what each one replaced:
    - No purple, and no gradients. Colours are flat, and each one has a meaning (see the
      :root block of dashboard-page.css).
    - No pill shapes. Corners are 4, 6 or 8 pixels. Only things that are round by nature are
      circles: status lights, the avatar, the spinner, the cricket ground.
    - Icons are SVG drawn by <app-icon>. No emoji, arrows or other characters stand in for one.
    - No em or en dashes in text, no exclamation marks, and none of the stock phrases the
      original used ("AI-powered", "elite level", "play like a pro" and so on).
    - Nothing moves by itself except the loading spinner, nothing moves or glows when the
      mouse passes over it, and nothing reacts to scrolling or follows the pointer.
      Transitions that show data changing, such as a bar growing, are fine.

  tools/smoke.mjs runs DESIGN_PROBE on every screen it visits. The probe returns a list of
  problems, each naming the rule and the selector or text that broke it. An empty list passes.
  It reads the stylesheets as well as what is on screen, so a rule for an element that is not
  showing at the moment is still checked.
*/

/** The only @keyframes animation the app may run. */
const ALLOWED_ANIMATIONS = ["spin"];

export const DESIGN_PROBE = `(() => {
  const problems = new Set();
  const add = (rule, detail) => problems.add(rule + ": " + detail);
  const short = s => s.replace(/\\s+/g, " ").trim().slice(0, 80);
  const allowed = new Set(${JSON.stringify(ALLOWED_ANIMATIONS)});

  // ---------------------------------------------------------------- words
  const EMOJI = /[\\p{Extended_Pictographic}\\u2190-\\u21FF\\u25A0-\\u25FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\uFE0F]/u;
  const DASH = /[\\u2012-\\u2015]/;
  const HYPE = /!|\\b(AI[- ]powered|AI coach|elite|masterful|exceptional|professional-grade|like a pro|train smarter|swing harder|classic drive)\\b/i;
  const texts = [document.title];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (node.nodeValue.trim() && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.parentElement.tagName)) texts.push(node.nodeValue);
  for (const el of document.querySelectorAll("[placeholder],[aria-label],[title],[alt]"))
    for (const name of ["placeholder", "aria-label", "title", "alt"]) if (el.getAttribute(name)) texts.push(el.getAttribute(name));
  for (const t of texts) {
    if (EMOJI.test(t)) add("emoji or symbol used as an icon", short(t));
    if (DASH.test(t)) add("em or en dash in text", short(t));
    if (HYPE.test(t)) add("exclamation mark or stock phrase", short(t));
  }

  // ---------------------------------------------------------------- colours
  /** True for hues between violet and magenta, unless the colour is close to grey, black or white. */
  const isPurple = (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return false;
    const lightness = (max + min) / 510;
    const saturation = d / (255 - Math.abs(max + min - 255));
    let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    return hue >= 250 && hue <= 330 && saturation >= 0.2 && lightness >= 0.08 && lightness <= 0.95;
  };
  const coloursIn = value => {
    const out = [];
    for (const m of value.matchAll(/#([0-9a-f]{3,8})\\b/gi)) {
      let hex = m[1];
      if (hex.length === 3 || hex.length === 4) hex = [...hex].map(c => c + c).join("");
      if (hex.length === 6 || hex.length === 8) out.push([0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
    }
    for (const m of value.matchAll(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/gi)) out.push([+m[1], +m[2], +m[3]]);
    return out;
  };
  const checkValue = (where, prop, value) => {
    if (/gradient\\(/i.test(value)) add("gradient", where + " { " + prop + " }");
    if (coloursIn(value).some(c => isPurple(...c))) add("purple", where + " { " + prop + ": " + short(value) + " }");
  };

  // ---------------------------------------------------------------- stylesheets
  const visit = rules => {
    for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule) { if (!allowed.has(rule.name)) add("animation", "@keyframes " + rule.name); continue; }
      if (rule instanceof CSSStyleRule) {
        const selector = rule.selectorText, style = rule.style;
        for (const prop of style) {
          const value = style.getPropertyValue(prop);
          checkValue(selector, prop, value);
          if (/^border-.*radius$/.test(prop)) for (const m of value.matchAll(/([\\d.]+)px/g)) if (+m[1] > 12) add("pill shape or large radius", selector + " { " + prop + ": " + value + " }");
          if (prop === "animation-name" && value !== "none" && !allowed.has(value)) add("animation", selector + " runs " + value);
          if (prop === "scroll-behavior" && value === "smooth") add("scroll effect", selector + " { scroll-behavior: smooth }");
          if (/^(animation-timeline|scroll-timeline|view-timeline)/.test(prop) && !/^(auto|none)$/.test(value)) add("scroll effect", selector + " { " + prop + ": " + value + " }");
          if (prop === "cursor" && !/^(pointer|default|auto|text|not-allowed)$/.test(value)) add("custom cursor", selector + " { cursor: " + value + " }");
        }
        if (/:hover/.test(selector))
          for (const prop of ["transform", "translate", "scale", "rotate", "box-shadow", "filter", "animation-name"])
            if (style.getPropertyValue(prop)) add("motion or glow on hover", selector + " { " + prop + " }");
      }
      if (rule.cssRules && rule.cssRules.length) visit(rule.cssRules);
    }
  };
  let sheets = 0;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }   // the font stylesheet is on another site and cannot be read
    sheets++;
    visit(rules);
  }
  if (sheets < 2) add("check could not run", "expected the global and the page stylesheet, found " + sheets);

  // ---------------------------------------------------------------- what is on the page
  const name = el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).join(".") : "");
  for (const el of document.querySelectorAll("[style]")) checkValue(name(el) + " (inline style)", "style", el.getAttribute("style"));
  for (const el of document.body.querySelectorAll("*")) {
    const radius = getComputedStyle(el).borderTopLeftRadius;
    if (!radius || radius === "0px") continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const square = Math.abs(box.width - box.height) <= 1;
    const px = radius.endsWith("%") ? parseFloat(radius) / 100 * Math.min(box.width, box.height) : parseFloat(radius);
    const circle = square && px >= box.width / 2 - 0.5;
    if (!circle && (px > 12 || radius.endsWith("%")))
      add("pill shape or large radius", name(el) + " is " + Math.round(box.width) + "x" + Math.round(box.height) + " with radius " + radius);
  }
  for (const animation of document.getAnimations()) {
    if (animation instanceof CSSTransition) continue;
    if (animation instanceof CSSAnimation && allowed.has(animation.animationName)) continue;
    add("animation", "running on " + (animation.effect && animation.effect.target ? name(animation.effect.target) : "the page") + ": " + (animation.animationName || "scripted"));
  }
  return [...problems].sort();
})()`;

/**
 * The kinds of mouse-move and scroll events that window, document or body listen to.
 * The app needs none: nothing follows the pointer and nothing is tied to scrolling.
 * (The charts listen on their own canvas for tooltips, which is not what this looks for.)
 */
export async function pointerAndScrollListeners(chrome) {
  const found = [];
  for (const target of ["window", "document", "document.body"]) {
    const evaluated = await chrome.send("Runtime.evaluate", { expression: target });
    const listeners = (await chrome.send("DOMDebugger.getEventListeners", { objectId: evaluated.result.objectId })).listeners || [];
    for (const listener of listeners)
      if (/^(mousemove|pointermove|scroll|wheel|touchmove)$/.test(listener.type)) found.push(target + " listens to " + listener.type);
  }
  return found;
}
