// Packs the library, installs the tarball with **npm** in an empty project (what a consumer does) and
// server-renders a map from each public entry point. It catches what `publint`/`attw` cannot: lifecycle
// scripts that break `npm install`, broken `exports`, missing files in the tarball.
//
//   pnpm smoke:package
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Do not leak pnpm's environment into the consumer's npm, or it would not behave like a clean install.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_")),
);
const run = (command, args, cwd, env = cleanEnv) =>
  execFileSync(command, args, { cwd, env, stdio: "inherit" });

const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "choropleth-smoke-"));
const packDir = join(tmp, "pack");
const consumer = join(tmp, "consumer");

console.log("› build + pack");
run("pnpm", ["build"], root, process.env);
run("pnpm", ["pack", "--pack-destination", packDir], root, process.env);
const tarball = join(
  packDir,
  readdirSync(packDir).find((file) => file.endsWith(".tgz")),
);

console.log("› install with npm in an empty project");
execFileSync("mkdir", ["-p", consumer]);
run("npm", ["init", "-y"], consumer);
run("npm", ["pkg", "set", "type=module"], consumer);
run("npm", ["install", tarball, "react@19", "react-dom@19"], consumer);

writeFileSync(
  join(consumer, "smoke.mjs"),
  `
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import { createColorScale } from "choropleth-kit/core";

const html = renderToString(
  createElement(ChoroplethMap, {
    geography: world110m,
    objectName: "countries",
    data: [{ id: "ES", v: 1 }, { id: "FR", v: 2 }],
    getId: (row) => row.id,
    getValue: (row) => row.v,
    variant: "sequential",
    width: 600,
    height: 300,
  }),
);
const regions = (html.match(/data-region-id/g) ?? []).length;
if (regions < 100) throw new Error("expected the world map, got " + regions + " regions");
if (typeof createColorScale !== "function") throw new Error("choropleth-kit/core is broken");
if (!import.meta.resolve("choropleth-kit/styles.css")) throw new Error("styles.css does not resolve");
console.log("smoke test ok: " + regions + " regions rendered");
`,
);
console.log("› render from the installed package");
run("node", ["smoke.mjs"], consumer);
