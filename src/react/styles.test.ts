import { readFileSync } from "node:fs";
import { join } from "node:path";

// jsdom no resuelve `styles.css`, así que dos propiedades del CSS que costaron un fallo real se vigilan leyendo el
// archivo: (1) las variables `--cm-*` no se DECLARAN en `.cm-root` (ganarían a las de un ancestro) y (2) los
// selectores base no suman especificidad (una clase suelta del consumidor debe poder ganarles).
const css = readFileSync(join(__dirname, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Separa por comas de primer nivel (las de `:is(a, b)` no cuentan). */
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
  it("no declara variables --cm-* públicas: los valores por defecto están en cada uso", () => {
    const declared = [...css.matchAll(/^\s*(--cm-[a-z-]+)\s*:/gm)].map((m) => m[1]);
    // Única excepción: «reducir movimiento» FUERZA la duración de las transiciones a 0.
    expect(declared).toEqual(["--cm-transition-duration"]);
  });

  it("todo `var(--cm-x)` lleva su valor por defecto (sin variable declarada, sin él no hay valor)", () => {
    const bare = [...css.matchAll(/var\(\s*(--cm-[a-z-]+)\s*\)/g)].map((m) => m[1]);
    expect(bare).toEqual([]);
  });

  it("los selectores base no suman especificidad del prefijo `.cm-root`", () => {
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .map((m) => (m[2] ?? "").trim())
      .filter((sel) => sel.includes(".cm-root"));
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) {
      for (const part of topLevel(selector)) {
        if (!part.includes(".cm-root")) continue;
        // Toda mención de `.cm-root` va dentro de :where(...), salvo el bloque de «reducir movimiento».
        const bare = part.replace(/:where\(\.cm-root:not\(\[data-unstyled\]\)\)/g, "");
        if (part === ".cm-root") continue;
        expect(bare, `selector «${part}»`).not.toContain(".cm-root");
      }
    }
  });

  it("`unstyled` sigue pudiendo quitarlo todo: cada regla visual se ata a `:not([data-unstyled])`", () => {
    const rules = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .map((m) => (m[2] ?? "").trim())
      .filter((sel) => sel.includes(".cm-") && sel !== ".cm-root");
    for (const selector of rules) {
      for (const part of topLevel(selector)) {
        expect(part, `selector «${part}»`).toContain("[data-unstyled]");
      }
    }
  });
});
