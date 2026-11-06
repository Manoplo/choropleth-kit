// Genera src/geo/world-110m.json y src/geo/iso-numeric-to-alpha2.ts a partir de `world-atlas`
// (Natural Earth, dominio público) y `i18n-iso-countries` (solo la tabla de códigos).
//
//   node scripts/build-geo/build-world-110m.mjs
//
// Se ejecuta a mano al actualizar `world-atlas`; la salida SE COMMITEA. Ninguna de las dos
// dependencias viaja con la librería (son devDependencies): el consumidor solo recibe el resultado.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const iso = require("i18n-iso-countries");
const atlas = JSON.parse(readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"));

// world-atlas no da id a estas tres regiones. Kosovo tiene el código de uso común «XK» (no es ISO
// oficial, pero lo usan la UE, el Banco Mundial y casi todas las APIs). Chipre del Norte y
// Somalilandia no tienen ninguno: se quedan sin id y la librería las pinta como capa no
// interactiva (sin agujeros en el mapa).
const MANUAL_IDS = { Kosovo: "XK" };

const countries = atlas.objects.countries;
const unresolved = [];
for (const geometry of countries.geometries) {
  const name = geometry.properties?.name;
  if (geometry.id === undefined) {
    const manual = MANUAL_IDS[name];
    if (manual === undefined) unresolved.push(name);
    else geometry.id = manual;
    continue;
  }
  const alpha2 = iso.numericToAlpha2(geometry.id);
  if (alpha2 === undefined) throw new Error(`Sin alpha-2 para ${geometry.id} (${name})`);
  geometry.id = alpha2;
}

const ids = countries.geometries.map((g) => g.id).filter((id) => id !== undefined);
if (new Set(ids).size !== ids.length) throw new Error("ids alpha-2 duplicados");

writeFileSync("src/geo/world-110m.json", JSON.stringify(atlas));

// Tabla numérico → alpha-2 de TODOS los países ISO, no solo los del mapa: sirve para convertir los
// ids de cualquier geometría (`world-atlas` directamente) o de los datos.
const table = Object.entries(iso.getAlpha2Codes())
  .map(([alpha2]) => [iso.alpha2ToNumeric(alpha2), alpha2])
  .filter(([numeric]) => numeric !== undefined)
  .sort(([a], [b]) => a.localeCompare(b));

const rows = table.map(([numeric, alpha2]) => `  "${numeric}": "${alpha2}",`).join("\n");
writeFileSync(
  "src/geo/iso-numeric-to-alpha2.ts",
  `// GENERADO por scripts/build-geo/build-world-110m.mjs. No editar a mano.
/**
 * ISO 3166-1 numérico → alpha-2 (\`"724"\` → \`"ES"\`). Para quien use \`world-atlas\` directamente
 * (sus ids son numéricos) y tenga datos con alpha-2: \`getFeatureId={(f) => isoNumericToAlpha2[f.id]}\`.
 */
export const isoNumericToAlpha2: Readonly<Record<string, string>> = {
${rows}
};
`,
);

console.log(
  `world-110m: ${countries.geometries.length} regiones, sin id: ${unresolved.join(", ")}`,
);
console.log(`tabla ISO: ${table.length} códigos`);
