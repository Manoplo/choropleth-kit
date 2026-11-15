// Emits the admin-1 data into the package: src/geo/admin1/<cc>.json → dist/admin1/<cc>.js (+ <cc>.d.ts).
//
//   node scripts/build-geo/emit-admin1.mjs        (it runs as the last step of `pnpm build`)
//
// WHY ITS OWN STEP and not tsup: each country is a separate ES module that nothing in the library imports, so a
// consumer reaches it only with `import("choropleth-kit/geo/admin1/us")` (see the `exports` wildcard in
// package.json). The bundler then splits it into its own file and the browser downloads it when that line runs.
// The data is wrapped in `JSON.parse("…")`: the engines parse a JSON string faster than an equivalent object literal.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "src/geo/admin1";
const OUT = "dist/admin1";

const banner = (cc) =>
  `/*! choropleth-kit/geo/admin1/${cc}: Natural Earth admin-1 (public domain). See "Data and third-party notices" in the README. */\n`;

const declaration = `import type { Topology } from "topojson-specification";\n\ndeclare const topology: Topology;\nexport default topology;\n`;

const files = readdirSync(SRC).filter((name) => /^[a-z]{2}\.json$/.test(name));
if (files.length === 0) throw new Error(`No country files in ${SRC}. Run build-admin1.mjs first.`);

mkdirSync(OUT, { recursive: true });
for (const file of files) {
  const cc = file.slice(0, 2);
  // Parse and stringify: the output is exactly one line of valid JSON, whatever the source's formatting.
  const json = JSON.stringify(JSON.parse(readFileSync(join(SRC, file), "utf8")));
  writeFileSync(
    join(OUT, `${cc}.js`),
    `${banner(cc)}export default JSON.parse(${JSON.stringify(json)});\n`,
  );
  writeFileSync(join(OUT, `${cc}.d.ts`), declaration);
}
console.log(`admin1: ${files.length} countries emitted to ${OUT}`);
