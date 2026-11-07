import { describe, expect, it } from "vitest";
import {
  THEMES,
  defineTheme,
  extendTheme,
  isThemeName,
  resolveTheme,
  themeToCssVars,
  type ChoroplethTheme,
  type ThemeName,
} from "./theme";

const NAMES: ThemeName[] = ["light", "dark", "minimal", "contrast"];

describe("themeToCssVars", () => {
  it("translates each field to its variable, with px where needed", () => {
    const vars = themeToCssVars({
      background: "#101010",
      empty: { fill: "#222" },
      context: { fill: "#333", border: "#444" },
      border: { color: "#555", width: 0.75 },
      hover: { stroke: "#666", width: 2 },
      selected: { stroke: "#777", width: 3 },
      focus: { ring: "#888", width: 4 },
      dim: { opacity: 0.4 },
      bubble: { fill: "#999", stroke: "#aaa", opacity: 0.5 },
      font: { family: "Georgia", size: 14, color: "#bbb" },
      tooltip: {
        background: "#ccc",
        color: "#ddd",
        border: "#eee",
        radius: 8,
        shadow: "0 1px #000",
      },
      controls: { background: "#111", color: "#222", border: "#333", radius: 10 },
    });

    expect(vars).toEqual({
      "--cm-background": "#101010",
      "--cm-empty-fill": "#222",
      "--cm-context-fill": "#333",
      "--cm-context-border-color": "#444",
      "--cm-border-color": "#555",
      "--cm-border-width": "0.75px",
      "--cm-hover-stroke": "#666",
      "--cm-hover-stroke-width": "2px",
      "--cm-selected-stroke": "#777",
      "--cm-selected-stroke-width": "3px",
      "--cm-focus-ring": "#888",
      "--cm-focus-ring-width": "4px",
      "--cm-dim-opacity": "0.4", // opacity carries no unit
      "--cm-bubble-fill": "#999",
      "--cm-bubble-stroke": "#aaa",
      "--cm-bubble-opacity": "0.5",
      "--cm-font-family": "Georgia",
      "--cm-font-size": "14px",
      "--cm-label-color": "#bbb",
      "--cm-tooltip-bg": "#ccc",
      "--cm-tooltip-color": "#ddd",
      "--cm-tooltip-border": "#eee",
      "--cm-tooltip-radius": "8px",
      "--cm-tooltip-shadow": "0 1px #000",
      "--cm-control-bg": "#111",
      "--cm-control-color": "#222",
      "--cm-control-border": "#333",
      "--cm-control-radius": "10px",
    });
  });

  it("what is not defined produces no variable (the base CSS stays)", () => {
    expect(themeToCssVars({ border: { color: "#fff" } })).toEqual({ "--cm-border-color": "#fff" });
    expect(themeToCssVars({})).toEqual({});
    expect(themeToCssVars(undefined)).toEqual({});
    expect(themeToCssVars({ border: {} })).toEqual({});
  });

  it("zero counts as a value (a 0 px border is a 0 px border)", () => {
    expect(themeToCssVars({ border: { width: 0 }, dim: { opacity: 0 } })).toEqual({
      "--cm-border-width": "0px",
      "--cm-dim-opacity": "0",
    });
  });

  it("a width string is respected as is (without duplicating the unit)", () => {
    const loose = { border: { width: "0.1rem" } } as unknown as ChoroplethTheme;
    expect(themeToCssVars(loose)).toEqual({ "--cm-border-width": "0.1rem" });
  });

  it("only emits --cm-* variables and never the internal ones the library writes", () => {
    for (const name of NAMES) {
      for (const key of Object.keys(themeToCssVars(THEMES[name]))) {
        expect(key).toMatch(/^--cm-[a-z-]+$/);
        expect(["--cm-k", "--cm-bubble-scale", "--cm-wave"]).not.toContain(key);
      }
    }
  });
});

describe("temas predefinidos", () => {
  it("there are four and each one defines all the color groups", () => {
    expect(Object.keys(THEMES).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES) {
      const vars = themeToCssVars(THEMES[name]);
      for (const required of [
        "--cm-empty-fill",
        "--cm-border-color",
        "--cm-border-width",
        "--cm-hover-stroke",
        "--cm-selected-stroke",
        "--cm-focus-ring",
        "--cm-tooltip-bg",
        "--cm-tooltip-color",
        "--cm-control-bg",
        "--cm-control-color",
        "--cm-label-color",
        "--cm-context-fill",
        "--cm-bubble-fill",
      ]) {
        expect(vars[required], `${name} sin ${required}`).toBeDefined();
      }
    }
  });

  it("`light` is exactly the CSS's default look", () => {
    const vars = themeToCssVars(THEMES.light);
    expect(vars["--cm-empty-fill"]).toBe("#d4d4d4");
    expect(vars["--cm-border-color"]).toBe("#ffffff");
    expect(vars["--cm-border-width"]).toBe("0.5px");
    expect(vars["--cm-hover-stroke"]).toBe("#000000");
    expect(vars["--cm-selected-stroke"]).toBe("#0b5fff");
  });

  it("`dark` has a dark background, dark borders and an inverted tooltip", () => {
    const dark = THEMES.dark;
    expect(luminance(dark.background as string)).toBeLessThan(0.05);
    expect(luminance(dark.border?.color as string)).toBeLessThan(0.05);
    // Inverted: the tooltip box is lighter than the map background.
    expect(luminance(dark.tooltip?.background as string)).toBeGreaterThan(
      luminance(dark.background as string),
    );
  });

  it("`contrast` thickens borders, highlights and focus ring relative to `light`", () => {
    const [c, l] = [THEMES.contrast, THEMES.light];
    expect(c.border?.width).toBeGreaterThan(l.border?.width as number);
    expect(c.hover?.width).toBeGreaterThan(l.hover?.width as number);
    expect(c.selected?.width).toBeGreaterThan(l.selected?.width as number);
    expect(c.focus?.width).toBeGreaterThan(l.focus?.width as number);
  });

  it("each theme's text is readable (contrast ≥ 4.5:1, WCAG AA): tooltip, controls and labels", () => {
    for (const name of NAMES) {
      const t = THEMES[name];
      expect(
        ratio(t.tooltip?.color, t.tooltip?.background),
        `${name} tooltip`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(t.controls?.color, t.controls?.background),
        `${name} controles`,
      ).toBeGreaterThanOrEqual(4.5);
      const bg = t.background === "transparent" ? "#ffffff" : t.background;
      expect(ratio(t.font?.color, bg), `${name} etiquetas`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the selection highlight and the hover one stand out from the map background (≥ 3:1)", () => {
    for (const name of NAMES) {
      const t = THEMES[name];
      const bg = t.background === "transparent" ? "#ffffff" : t.background;
      expect(ratio(t.selected?.stroke, bg), `${name} selected`).toBeGreaterThanOrEqual(3);
      expect(ratio(t.hover?.stroke, bg), `${name} hover`).toBeGreaterThanOrEqual(3);
      expect(ratio(t.focus?.ring, bg), `${name} focus`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("resolveTheme / isThemeName", () => {
  it("a name gives its object; an object, the same one; nothing, nothing", () => {
    expect(resolveTheme("dark")).toBe(THEMES.dark);
    const mine = defineTheme({ border: { color: "#f00" } });
    expect(resolveTheme(mine)).toBe(mine);
    expect(resolveTheme(undefined)).toBeUndefined();
  });
  it("isThemeName does not mistake inherited properties for themes", () => {
    expect(isThemeName("dark")).toBe(true);
    expect(isThemeName("toString")).toBe(false);
    expect(isThemeName("__proto__")).toBe(false);
    expect(isThemeName({})).toBe(false);
  });
});

describe("extendTheme", () => {
  it("overlays group by group: what you do not touch stays", () => {
    const mine = extendTheme("dark", { border: { color: "#ff0000" }, tooltip: { radius: 12 } });
    expect(mine.border).toEqual({ color: "#ff0000", width: 0.5 }); // the width is still dark's
    expect(mine.tooltip?.radius).toBe(12);
    expect(mine.tooltip?.background).toBe(THEMES.dark.tooltip?.background);
    expect(mine.background).toBe(THEMES.dark.background);
  });
  it("does not mutate the base theme", () => {
    const before = JSON.stringify(THEMES.dark);
    extendTheme("dark", { border: { color: "#ff0000" } });
    expect(JSON.stringify(THEMES.dark)).toBe(before);
  });
  it("accepts an object as a base and a new group", () => {
    const base = defineTheme({ border: { color: "#111" } });
    expect(extendTheme(base, { bubble: { fill: "#222" } })).toEqual({
      border: { color: "#111" },
      bubble: { fill: "#222" },
    });
  });
  it("an `undefined` value does not erase what is there", () => {
    expect(extendTheme("light", { background: undefined }).background).toBe("transparent");
  });
  it("a flat field (background) is replaced", () => {
    expect(extendTheme("light", { background: "#abcdef" }).background).toBe("#abcdef");
  });
});

// ── WCAG contrast ─────────────────────────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? [...n].map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) throw new Error("falta un color");
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
