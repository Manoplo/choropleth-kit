// Packs the library, installs the tarball with **npm** in an empty project (what a consumer does) and, once
// per supported React major, server-renders a map from each public entry point and type-checks a consumer
// file. It catches what `publint`/`attw` cannot: lifecycle scripts that break `npm install`, broken `exports`,
// missing files in the tarball, public types that need packages the consumer does not get, and code or types
// that only work with the React version the library is developed against.
//
//   pnpm smoke:package
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";

// `peerDependencies` promises `react >=18`, so both ends of the range are exercised.
const REACT_MAJORS = [18, 19];

// Do not leak pnpm's environment into the consumer's npm, or it would not behave like a clean install.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_")),
);
// On Windows `pnpm`, `npm` and `npx` are `.cmd` shims, which Node only spawns through a shell.
const run = (command, args, cwd, env = cleanEnv) =>
  execFileSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });

const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "choropleth-smoke-"));
const packDir = join(tmp, "pack");

console.log("› build + pack");
run("pnpm", ["build"], root, process.env);
run("pnpm", ["pack", "--pack-destination", packDir], root, process.env);
const tarball = join(
  packDir,
  readdirSync(packDir).find((file) => file.endsWith(".tgz")),
);

const smokeModule = `
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

// A country's admin-1 comes from its own subpath, which is a wildcard in \`exports\` (attw cannot check those).
const us = (await import("choropleth-kit/geo/admin1/us")).default;
const states = renderToString(
  createElement(ChoroplethMap, {
    geography: us,
    objectName: "admin1",
    data: [{ id: "US-CA", v: 1 }],
    getId: (row) => row.id,
    getValue: (row) => row.v,
    variant: "sequential",
    width: 600,
    height: 300,
  }),
);
const stateCount = (states.match(/data-region-id/g) ?? []).length;
if (stateCount !== 52) throw new Error("expected 52 US units from choropleth-kit/geo/admin1/us, got " + stateCount);
console.log("smoke test ok: " + regions + " regions rendered, " + stateCount + " US units from admin1");
`;

// A strict consumer. `skipLibCheck: false` also checks the library's `.d.ts` files, so a type import whose
// `@types/*` package is not installed along with the library (or a React 19-only type) fails here.
const consumerFile = `
import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import { createColorScale } from "choropleth-kit/core";
import usAdmin1 from "choropleth-kit/geo/admin1/us";

type Row = { id: string; value: number };

export const scale = createColorScale;

// A country's subdivisions are a Topology that the map takes as its geography.
export const UsStates = (props: { rows: Row[] }) => (
  <ChoroplethMap
    geography={usAdmin1}
    objectName="admin1"
    data={props.rows}
    getId={(row) => row.id}
    getValue={(row) => row.value}
    variant="sequential"
    width={600}
    height={300}
  />
);

export const App = (props: { rows: Row[] }) => (
  <ChoroplethMap
    geography={world110m}
    objectName="countries"
    data={props.rows}
    getId={(row) => row.id}
    getValue={(row) => row.value}
    variant="sequential"
    width={600}
    height={300}
  />
);
`;

const consumerTsconfig = {
  compilerOptions: {
    strict: true,
    jsx: "react-jsx",
    module: "ESNext",
    moduleResolution: "Bundler",
    target: "ES2022",
    noEmit: true,
    skipLibCheck: false,
    types: [],
  },
  files: ["consumer.tsx"],
};

const checkConsumer = (major) => {
  const consumer = join(tmp, `consumer-react-${major}`);
  console.log(`\n=== React ${major} ===`);

  console.log("› install with npm in an empty project");
  mkdirSync(consumer, { recursive: true });
  run("npm", ["init", "-y"], consumer);
  run("npm", ["pkg", "set", "type=module"], consumer);
  run(
    "npm",
    [
      "install",
      tarball,
      `react@${major}`,
      `react-dom@${major}`,
      `@types/react@${major}`,
      `@types/react-dom@${major}`,
      "typescript@5",
    ],
    consumer,
  );

  console.log("› render from the installed package");
  writeFileSync(join(consumer, "smoke.mjs"), smokeModule);
  run("node", ["smoke.mjs"], consumer);

  console.log("› type-check a strict consumer (library .d.ts files included)");
  writeFileSync(join(consumer, "consumer.tsx"), consumerFile);
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify(consumerTsconfig, null, 2));
  run("npx", ["tsc", "-p", "."], consumer);
  console.log("consumer types ok");

  return consumer;
};

const consumers = REACT_MAJORS.map(checkConsumer);

// Bundlers (Vite, webpack, esbuild) replace only the dotted `process.env.NODE_ENV`, and a browser has no `process`.
// A `typeof process` guard or bracket access would keep the development diagnostics alive in consumers' production
// builds, and Node (where `process` exists) would never notice. Check the shipped code for the safe form.
console.log("\n› NODE_ENV is read in a form bundlers can replace");
const shipped = join(consumers[0], "node_modules", "choropleth-kit", "dist");
for (const file of readdirSync(shipped).filter((name) => name.endsWith(".js"))) {
  const code = readFileSync(join(shipped, file), "utf8");
  if (/typeof\s+process/.test(code))
    throw new Error(`${file}: \`typeof process\` guard defeats NODE_ENV replacement`);
  const reads = code.match(/NODE_ENV/g) ?? [];
  const dotted = code.match(/process\.env\.NODE_ENV/g) ?? [];
  if (reads.length !== dotted.length)
    throw new Error(`${file}: NODE_ENV must be read as process.env.NODE_ENV`);
}
console.log("NODE_ENV usage ok");

// The promise of `choropleth-kit/geo/admin1/<cc>`: a consumer that loads a country with `import()` gets it as its
// own file, and the data is NOT in the main bundle. Checked with a real bundler (Vite) on the installed package.
console.log("\n› a country's admin-1 is a lazy chunk, outside the main bundle");
const lazyDir = consumers[0];
// The entry must RUN the `import()`: Vite drops unused exports of an app entry, and the dynamic import with them.
writeFileSync(
  join(lazyDir, "lazy-entry.js"),
  [
    'import { ChoroplethMap } from "choropleth-kit";',
    'globalThis.loadUs = () => import("choropleth-kit/geo/admin1/us");',
    "globalThis.Map = ChoroplethMap;",
    "",
  ].join("\n"),
);
const built = await build({
  root: lazyDir,
  configFile: false,
  logLevel: "silent",
  build: {
    write: false,
    minify: false,
    rollupOptions: { input: join(lazyDir, "lazy-entry.js") },
  },
});
const chunks = (Array.isArray(built) ? built : [built])
  .flatMap((result) => result.output)
  .filter((file) => file.type === "chunk");
const MARKER = "US-CA"; // an id that only exists in the US admin-1 data
const withData = chunks.filter((chunk) => chunk.code.includes(MARKER));
if (withData.length !== 1) {
  throw new Error(
    `expected the US data in exactly one chunk, found it in ${withData.length} of: ` +
      chunks.map((chunk) => chunk.fileName).join(", "),
  );
}
if (withData[0].isEntry)
  throw new Error("the US data ended up in the entry chunk (the bundle would grow)");
if (!withData[0].isDynamicEntry) throw new Error("the US data is not a dynamic-import chunk");
console.log(
  `lazy chunk ok: ${withData[0].fileName} holds the US data (${(withData[0].code.length / 1024).toFixed(0)} KB), ` +
    `the entry chunk does not`,
);
