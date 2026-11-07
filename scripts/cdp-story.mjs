// Test of a story in a REAL Chrome (headless) over the CDP protocol, with no dependencies (Node >= 22).
//
// WHY IT EXISTS: jsdom has no layout or `pointer-events`, and two bugs were only visible in a real browser
// (e.g. the `click` landed on the <svg> because the CSS removed events from the regions on press).
// jsdom tests fire `click` directly on the <path> and cannot see it.
//
// USAGE (Google Chrome is required in /Applications):
//   pnpm build-storybook
//   python3 -m http.server 6007 --directory storybook-static &        # serves the static build
//   node scripts/cdp-story.mjs <storyId> <COUNTRY_ID> [single|dbl|esc|drag]
//   e.g.: node scripts/cdp-story.mjs drilldown-engine--uncontrolled-story ES single
//   (story ids are in storybook-static/index.json)
//
// Modes: `single` one click · `dbl` double click · `esc` click then Escape · `drag` click, wheel zoom and drag ·
//        `touch` two finger taps (the 1st previews, the 2nd drills down) · `tour` (story "Handle + intent"): presses
//        "▶ Tour" and prints the log every second.
// It prints, moment by moment, the drill phase, the regions, the bubbles, the breadcrumbs, the camera and the tooltip, plus
// the sequence of mouse events (which element each one reached) and the console warnings / errors.
// It drives a real Chrome over CDP: opens a story, really clicks and counts what happens in the DOM and the console.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [storyId, country = "ES", mode = "single"] = process.argv.slice(2);
const PORT = 9333;
const SB = "http://localhost:6007";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`,
    "--window-size=1300,900",
    "--no-first-run",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const cleanup = () => chrome.kill("SIGKILL");
process.on("exit", cleanup);

let target;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) throw new Error("Chrome did not start");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.consoleAPICalled") {
    logs.push(
      `console.${msg.params.type}: ${msg.params.args
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 300)}`,
    );
  } else if (msg.method === "Runtime.exceptionThrown") {
    logs.push(
      `EXCEPTION: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`.slice(
        0,
        500,
      ),
    );
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: `${SB}/iframe.html?id=${storyId}&viewMode=story` });
for (let i = 0; i < 60; i++) {
  if (await evaluate(`document.querySelectorAll(".cm-region").length > 10`)) break;
  await sleep(250);
}

const snapshot = () =>
  evaluate(`(() => {
    const root = document.querySelector(".cm-root");
    const vp = document.querySelector(".cm-viewport");
    return JSON.stringify({
      phase: root?.getAttribute("data-drill-phase"),
      regions: document.querySelectorAll(".cm-regions .cm-region").length,
      bubbles: document.querySelectorAll("circle.cm-bubble").length,
      ctx: document.querySelectorAll(".cm-layer[data-role=context]").length,
      crumbs: [...document.querySelectorAll(".cm-breadcrumb__item")].map(e => e.textContent).join(" > "),
      vp: vp?.getAttribute("transform")?.slice(0, 55),
      tooltip: document.querySelector("[role=tooltip]")?.textContent,
      log: [...document.querySelectorAll("pre")].map((p) => p.textContent).join(" ¦ ").split("\\n").slice(-6).join(" | "),
    });
  })()`);

console.log("inicial", await snapshot());

if (mode === "tour") {
  await evaluate(
    `[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Tour"))?.click()`,
  );
  for (let i = 0; i < 14; i++) {
    await sleep(1000);
    console.log(`tour+${i + 1}s`, await snapshot());
  }
  console.log("LOGS", logs.length ? "\n" + logs.join("\n") : "(no errors or warnings)");
  ws.close();
  cleanup();
  process.exit(0);
}

// Center of the region on screen (the centroid of its box usually falls inside; for ES an interior point is used).
const point = JSON.parse(
  await evaluate(`(() => {
    const el = document.querySelector('.cm-regions [data-region-id="${country}"]');
    if (!el) return JSON.stringify(null);
    const b = el.getBoundingClientRect();
    // find a point really inside the shape
    const svg = el.ownerSVGElement;
    for (let fy = 0.5; fy <= 0.9; fy += 0.1) for (let fx = 0.3; fx <= 0.8; fx += 0.1) {
      const x = b.left + b.width * fx, y = b.top + b.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && hit.closest('[data-region-id="${country}"]')) return JSON.stringify({ x, y });
    }
    return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
  })()`),
);
console.log("punto", point);
if (!point) throw new Error(`no region ${country}`);

if (mode === "touch") {
  const touch = (type) =>
    send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: point.x, y: point.y }],
    });
  for (const n of [1, 2]) {
    await touch("touchStart");
    await sleep(60);
    await touch("touchEnd");
    for (const ms of [200, 600, 1200]) {
      await sleep(ms === 200 ? 200 : 400);
      console.log(`toque ${n} +${ms}`, await snapshot());
    }
    await sleep(500); // outside the browser's double tap
  }
  console.log("LOGS", logs.length ? "\n" + logs.join("\n") : "(no errors or warnings)");
  ws.close();
  cleanup();
  process.exit(0);
}

const mouse = (type, extra = {}) =>
  send("Input.dispatchMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
    ...extra,
  });

await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x - 3, y: point.y - 3 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
await sleep(300);
console.log("tras hover", await snapshot());

await evaluate(`(() => {
  window.__ev = [];
  for (const t of ["pointerdown","mousedown","mouseup","pointerup","click","dblclick"]) {
    document.addEventListener(t, (e) => window.__ev.push(t + ":" + (e.target.closest?.("[data-region-id]")?.getAttribute("data-region-id") ?? e.target.tagName) + (e.defaultPrevented ? "(prevented)" : "")), true);
  }
})()`);
const click = async (count = 1) => {
  await mouse("mousePressed", { clickCount: count });
  await sleep(60);
  await mouse("mouseReleased", { clickCount: count });
};
await click(1);
if (mode === "dbl") {
  await sleep(120);
  await click(2);
}
for (const ms of [150, 500, 900, 1400, 2200]) {
  await sleep(ms === 150 ? 150 : 400);
  console.log(`+${ms}`, await snapshot());
}
if (mode === "esc") {
  await sleep(600);
  for (const type of ["rawKeyDown", "keyUp"])
    await send("Input.dispatchKeyEvent", {
      type,
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  for (const ms of [200, 900, 1400]) {
    await sleep(ms === 200 ? 200 : 500);
    console.log(`esc+${ms}`, await snapshot());
  }
}
if (mode === "drag") {
  // zoom in with the wheel and drag
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: point.x,
    y: point.y,
    deltaX: 0,
    deltaY: -600,
  });
  await sleep(600);
  console.log("zoom", await snapshot());
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let i = 1; i <= 8; i++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x - i * 6,
      y: point.y,
      button: "left",
      buttons: 1,
    });
    await sleep(16);
  }
  console.log(
    "arrastrando interacting=",
    await evaluate(`document.querySelector(".cm-root").hasAttribute("data-interacting")`),
    await snapshot(),
  );
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x - 48,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await sleep(1500);
  console.log(
    "tras soltar interacting=",
    await evaluate(`document.querySelector(".cm-root").hasAttribute("data-interacting")`),
    await snapshot(),
  );
}
console.log("EVENTOS", await evaluate("JSON.stringify(window.__ev)"));
console.log("LOGS", logs.length ? "\n" + logs.join("\n") : "(no errors or warnings)");
ws.close();
cleanup();
process.exit(0);
