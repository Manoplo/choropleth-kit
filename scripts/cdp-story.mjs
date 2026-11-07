// Prueba de una story en un Chrome REAL (headless) por el protocolo CDP, sin dependencias (Node >= 22).
//
// POR QUÉ EXISTE: jsdom no tiene layout ni `pointer-events`, y dos fallos solo se veían en un navegador de
// verdad (p. ej. el `click` caía en el <svg> porque el CSS quitaba los eventos a las regiones al pulsar).
// Los tests de jsdom disparan `click` directamente sobre el <path> y no pueden verlo.
//
// USO (hace falta Google Chrome en /Applications):
//   pnpm build-storybook
//   python3 -m http.server 6007 --directory storybook-static &        # sirve la build estática
//   node scripts/cdp-story.mjs <storyId> <ID_PAÍS> [single|dbl|esc|drag]
//   p. ej.: node scripts/cdp-story.mjs drilldown-engine--uncontrolled-story ES single
//   (los ids de las stories están en storybook-static/index.json)
//
// Modos: `single` un clic · `dbl` doble clic · `esc` clic y luego Escape · `drag` clic, zoom con rueda y arrastre.
// Imprime, por instantes, la fase del drill, las regiones, las burbujas, las migas, la cámara y el tooltip, además
// de la secuencia de eventos de ratón (a qué elemento llegó cada uno) y los avisos / errores de la consola.
// Maneja un Chrome real por CDP: abre una story, hace clic de verdad y cuenta qué pasa en el DOM y la consola.
// Uso: node cdp.mjs <storyId> <country> [dbl]
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
if (!target) throw new Error("Chrome no arrancó");

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
    });
  })()`);

console.log("inicial", await snapshot());

// Centro de la región en pantalla (el centroide de su caja suele caer dentro; para ES se usa un punto interior).
const point = JSON.parse(
  await evaluate(`(() => {
    const el = document.querySelector('.cm-regions [data-region-id="${country}"]');
    if (!el) return JSON.stringify(null);
    const b = el.getBoundingClientRect();
    // buscar un punto realmente dentro de la forma
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
if (!point) throw new Error(`no hay región ${country}`);

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
  // acercar con la rueda y arrastrar
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
console.log("LOGS", logs.length ? "\n" + logs.join("\n") : "(sin errores ni avisos)");
ws.close();
cleanup();
process.exit(0);
