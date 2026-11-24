// Generates src/content/docs/reference/options.md: every prop of <ChoroplethMap>, flattened.
//
// WHY THIS EXISTS. TypeDoc cannot document the main prop set: `UseChoroplethOptions` is
// `BaseOptions & VariantConfig`, and neither is exported, so its page comes out empty. The TypeScript
// compiler does resolve the intersection and the union of the four variants, so we ask it directly.
// The text comes from the TSDoc inside the PUBLISHED package (node_modules/choropleth-kit/dist), so the
// page always matches the version the site depends on.
//
// Run with `node scripts/gen-options.mjs` (also runs before `dev` and `build`). The output is committed.
import ts from "typescript";
import { writeFileSync, rmSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("node_modules/choropleth-kit/package.json", "utf8"));

const OUT = "src/content/docs/reference/options.md";
const PROBE = "scripts/.probe.ts";

// Props that exist on <ChoroplethMap> but not on <Choropleth.Root> or useChoropleth: they configure the
// pieces the preset renders for you. Everything else is shared by the three API levels.
const PRESET_ONLY = new Set(["legend", "breadcrumb", "markers", "renderTooltip", "ariaLabel"]);

// Reading order. Anything not listed ends up in "Other", so a new prop is never silently dropped.
const GROUPS = [
  ["Geography and data", ["geography", "geographyKey", "objectName", "region", "filterFeatures", "data", "getId", "getFeatureId", "loading", "onGeographyError", "fallbackPoints"]],
  ["Variant and scale", ["variant", "getValue", "getCategory", "getColorValue", "getCoordinates", "maxRadius", "color", "categories", "palette", "classification", "domain", "midpoint", "formatValue", "emptyFill", "emptyLabel", "emptyPattern"]],
  ["Layout and appearance", ["theme", "classNames", "className", "style", "unstyled", "aspectRatio", "width", "height", "projection", "legend", "breadcrumb", "markers", "regionLabels", "labels", "ariaLabel"]],
  ["Interaction", ["selectedId", "defaultSelectedId", "onSelectedIdChange", "dimOthers", "onItemClick", "onItemHover", "getRegionStyle", "renderTooltip"]],
  ["Camera", ["zoom", "focusId", "focusBounds"]],
  ["Drill-down", ["drill", "onDrill", "onDrillEnd", "onDrillError", "onDrillIntent"]],
  ["Diagnostics", ["onJoinReport", "diagnostics"]],
];

// The public type declarations leave these props without TSDoc. Descriptions here are a stopgap, written
// from the source; the real fix is to document them in the library, after which this table can shrink.
const FALLBACK_DOCS = {
  objectName: "Name of the TopoJSON object to draw (for example `\"countries\"`). Not needed with GeoJSON.",
  getId: "Returns the region id a row belongs to. It is matched exactly against each region's id (`feature.id`, or what `getFeatureId` returns).",
  projection: "The map projection, by name. Defaults to `equalEarth`, which keeps areas comparable.",
  emptyFill: "Fill for regions without data. Defaults to a light gray, or the theme's empty color.",
  formatValue: "Formats a number for the tooltip and the legend.",
  height: "Fixed height in pixels. Without it, the height comes from the container width and `aspectRatio`.",
  variant: "What the map means: `\"sequential\"`, `\"diverging\"`, `\"categorical\"` or `\"bubble\"`. Each variant requires its own accessors.",
  className: "A class added to the root element.",
  style: "Inline styles for the root element.",
  unstyled: "Removes all the base CSS. You then style every piece yourself; the `data-*` attributes still apply.",
  ariaLabel: "Accessible name of the map (`aria-label` on the `<svg>`). Always set it.",
  getValue: {
    "*": "The number each row paints. Return `null` for no data (a `0` is data, not an absence).",
  },
  getCategory: "The category each row belongs to, matched against `categories`. Return `null` for no data.",
  maxRadius: "Radius in pixels of the largest bubble. Defaults to 24.",
  classification:
    "How values are grouped into classes: `{ method: \"quantile\" }`, `{ method: \"quantize\" }`, `{ method: \"linear\" }` (continuous) or `{ method: \"threshold\", thresholds: [...] }`. Defaults to 5 quantiles for `sequential` and 5 equal classes around `midpoint` for `diverging`. See [Classification and domain](/concepts/classification-and-domain/).",
  midpoint: "The neutral value of the diverging scale. Defaults to `0`. Without `domain`, the range is symmetric around it.",
  palette: {
    categorical: "A named categorical palette. Defaults to `tableau10`. Pass `categories` to set the colors yourself.",
    bubble: "Diverging palette for the bubble color when `getColorValue` is set. Defaults to `rdbu`.",
  },
};

const fallbackDoc = (name, variant) => {
  const entry = FALLBACK_DOCS[name];
  if (typeof entry === "string") return entry;
  return entry?.[variant] ?? entry?.["*"] ?? "";
};

writeFileSync(
  PROBE,
  `import type { ChoroplethMapProps } from "choropleth-kit";\ninterface TDatum { readonly __datum: never }\nexport type P = ChoroplethMapProps<TDatum>;\n`,
);
try {
  const program = ts.createProgram([PROBE], {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
    strict: true,
    types: [],
    jsx: ts.JsxEmit.ReactJSX,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(PROBE);
  const decl = sf.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "P");
  const type = checker.getTypeFromTypeNode(decl.type);
  if (checker.typeToString(type) === "any") throw new Error("ChoroplethMapProps did not resolve: is choropleth-kit installed?");

  // The preset's props are a union with one member per variant.
  const members = type.isUnion() ? type.types : [type];
  const variantOf = (member) => {
    const sym = checker.getPropertyOfType(member, "variant");
    return checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, sf)).replace(/"/g, "");
  };

  const clean = (s) => s.replace(/import\("[^"]*"\)\./g, "").replace(/\s+/g, " ").trim();
  const typeText = (sym) => {
    const node = sym.declarations?.find((d) => ts.isPropertySignature(d) && d.type);
    const text = node
      ? node.type.getText()
      : checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, sf), sf, ts.TypeFormatFlags.NoTruncation);
    return clean(text);
  };
  const isOptional = (sym) => (sym.flags & ts.SymbolFlags.Optional) !== 0;
  const docOf = (sym) => ts.displayPartsToString(sym.getDocumentationComment(checker)).trim();

  /** name -> { variants: Map(variant -> { type, optional, doc }) } */
  const props = new Map();
  for (const member of members) {
    const variant = variantOf(member);
    for (const sym of checker.getPropertiesOfType(member)) {
      const entry = props.get(sym.name) ?? { variants: new Map() };
      const doc = docOf(sym) || fallbackDoc(sym.name, variant);
      entry.variants.set(variant, { type: typeText(sym), optional: isOptional(sym), doc });
      props.set(sym.name, entry);
    }
  }
  const variantNames = [...new Set(members.map(variantOf))];

  const placed = new Set(GROUPS.flatMap(([, names]) => names));
  const groups = [...GROUPS, ["Other", [...props.keys()].filter((n) => !placed.has(n))]];

  const out = [];
  out.push(`---
title: Map options
description: Every option of ChoroplethMap, Choropleth.Root and useChoropleth, flattened into one reference.
tableOfContents:
  minHeadingLevel: 2
  maxHeadingLevel: 2
---

<!-- GENERATED by scripts/gen-options.mjs from the TSDoc in choropleth-kit ${pkg.version}. Do not edit by hand. -->

> Generated from \`choropleth-kit\` **${pkg.version}**.

These are the options you pass to \`<ChoroplethMap>\`. The same options are accepted by \`<Choropleth.Root>\` and \`useChoropleth()\`, except the ones marked **Preset only**: they configure pieces the preset renders for you (\`legend\`, \`breadcrumb\`, \`markers\`, \`renderTooltip\`, \`ariaLabel\`). With the compound API you configure those on the matching piece instead. See [Choosing an API level](/api-levels/).

\`TDatum\` is the type of one row of your \`data\`; it is inferred from it.

Some options exist only for certain \`variant\` values (${variantNames.map((v) => `\`${v}\``).join(", ")}). They are labelled below. For the other types mentioned here, see the [React API](/reference/react/) and the [Core API](/reference/core/).
`);

  let count = 0;
  for (const [title, names] of groups) {
    const present = names.filter((n) => props.has(n));
    if (present.length === 0) continue;
    out.push(`\n## ${title}\n`);
    for (const name of present) {
      const { variants } = props.get(name);
      count++;
      const entries = [...variants.entries()];
      const allVariants = variants.size === variantNames.length;
      const sameType = new Set(entries.map(([, v]) => v.type)).size === 1;
      const sameDoc = new Set(entries.map(([, v]) => v.doc)).size === 1;
      // Required wherever it exists; "Optional" if any variant that has it makes it optional.
      const required = entries.every(([, v]) => !v.optional);

      const badges = [required ? "**Required**" : "Optional"];
      if (PRESET_ONLY.has(name)) badges.push("**Preset only**");
      if (!allVariants) badges.push(`Only with ${entries.map(([v]) => `\`${v}\``).join(", ")}`);

      out.push(`### \`${name}\`\n`);
      if (sameType && sameDoc) {
        const [, only] = entries[0];
        out.push(`\`${only.type}\`\n`);
        out.push(`${badges.join(" · ")}\n`);
        out.push(only.doc ? `${only.doc}\n` : "_No description yet._\n");
      } else {
        // The type or the meaning changes with the variant (for example `getValue`): one block each.
        out.push(`${badges.join(" · ")}\n`);
        // Variants that share both type and description are grouped, so nothing is repeated.
        const groups = new Map();
        for (const [variant, v] of entries) {
          const key = JSON.stringify([v.type, v.doc]);
          const group = groups.get(key) ?? { variants: [], v };
          group.variants.push(variant);
          groups.set(key, group);
        }
        for (const { variants: names, v } of groups.values()) {
          out.push(`**${names.map((x) => `\`${x}\``).join(", ")}**: \`${v.type}\`\n`);
          out.push(v.doc ? `${v.doc.replace(/^/gm, "> ")}\n` : "> _No description yet._\n");
        }
      }
    }
  }
  writeFileSync(OUT, out.join("\n"));
  console.log(`[gen-options] ${count} options written to ${OUT} (choropleth-kit ${pkg.version})`);
} finally {
  rmSync(PROBE, { force: true });
}
