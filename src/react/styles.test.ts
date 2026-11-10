import { readFileSync } from "node:fs";
import { join } from "node:path";

// jsdom does not resolve `styles.css`, so two CSS properties that cost a real bug are guarded by reading the
// file: (1) the `--cm-*` variables are not DECLARED on `.cm-root` (they would beat an ancestor's) and (2) the
// base selectors add no specificity (a loose consumer class must be able to beat them).
const css = readFileSync(join(__dirname, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Splits on top-level commas (those inside `:is(a, b)` do not count). */
const topLevel = (selector: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  parts.push(current.trim());
  return parts;
};

describe("styles.css (contrato)", () => {
  it("does not declare public --cm-* variables: the defaults are at each use", () => {
    const declared = [...css.matchAll(/^\s*(--cm-[a-z-]+)\s*:/gm)].map((m) => m[1]);
    // The only exception: "reduce motion" FORCES the transitions' duration to 0.
    expect(declared).toEqual(["--cm-transition-duration"]);
  });

  it("every `var(--cm-x)` carries its default value (with no declared variable, without it there is no value)", () => {
    const bare = [...css.matchAll(/var\(\s*(--cm-[a-z-]+)\s*\)/g)].map((m) => m[1]);
    expect(bare).toEqual([]);
  });

  it("the base selectors add none of the `.cm-root` prefix's specificity", () => {
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .map((m) => (m[2] ?? "").trim())
      .filter((sel) => sel.includes(".cm-root"));
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) {
      for (const part of topLevel(selector)) {
        if (!part.includes(".cm-root")) continue;
        // Every mention of `.cm-root` goes inside :where(...), except the "reduce motion" block.
        const bare = part.replace(/:where\(\.cm-root:not\(\[data-unstyled\]\)\)/g, "");
        if (part === ".cm-root") continue;
        expect(bare, `selector "${part}"`).not.toContain(".cm-root");
      }
    }
  });

  it("`unstyled` can still remove everything: each visual rule is tied to `:not([data-unstyled])`", () => {
    const rules = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .map((m) => (m[2] ?? "").trim())
      .filter((sel) => sel.includes(".cm-") && sel !== ".cm-root");
    for (const selector of rules) {
      for (const part of topLevel(selector)) {
        expect(part, `selector "${part}"`).toContain("[data-unstyled]");
      }
    }
  });
});
