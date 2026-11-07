import { fireEvent, render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { useDefId } from "./choropleth-context";
import type { RootProps } from "./components/root";

// Step 36: `bar` and interactive legend, and `Defs` / `Patterns` with per-instance ids. jsdom does not see the CSS: what the
// library WRITES is tested here (attributes, ids, `<pattern>`); that the highlight shows, in a browser.

type Row = { code: string; v: number | null; cat?: string };
const data: Row[] = [
  { code: "A", v: 1, cat: "x" },
  { code: "B", v: 9, cat: "y" },
];
const baseProps = {
  geography: twoSquares,
  data,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  classification: { method: "quantile", classes: 2 },
  width: 200,
  height: 100,
} as const;

const preset = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);
const rootOf = (c: HTMLElement) => c.querySelector(".cm-root") as HTMLElement;
const region = (c: HTMLElement, id: string) =>
  c.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;

describe("leyenda interactiva", () => {
  it("each region carries `data-class` (class index) and those without a value, `empty`", () => {
    const { container } = preset({
      data: [
        { code: "A", v: 1 },
        { code: "B", v: 9 },
      ],
    });
    const classes = ["A", "B"].map((id) => region(container, id).getAttribute("data-class"));
    expect(classes).toEqual(["0", "1"]);

    const sparse = preset({ data: [{ code: "A", v: 1 }] });
    expect(region(sparse.container, "B").getAttribute("data-class")).toBe("empty");
  });

  it("hovering a class writes `data-highlight-class` on the root; leaving removes it", () => {
    const { container } = preset();
    const items = container.querySelectorAll(".cm-legend__item");
    expect(items[0]?.getAttribute("data-class")).toBe("0");

    fireEvent.pointerEnter(items[1] as Element);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("1");
    fireEvent.pointerLeave(items[1] as Element);
    expect(rootOf(container).hasAttribute("data-highlight-class")).toBe(false);
  });

  it("the no-data item is highlighted as `empty`", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }] });
    const empty = container.querySelector('.cm-legend__item[data-class="empty"]') as Element;
    expect(empty).not.toBeNull();
    fireEvent.pointerEnter(empty);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("empty");
  });

  it("the item's index matches the `data-class` of the regions of its color", () => {
    const { container } = preset();
    const items = [...container.querySelectorAll(".cm-legend__item")];
    for (const id of ["A", "B"]) {
      const cls = region(container, id).getAttribute("data-class");
      const item = items.find((i) => i.getAttribute("data-class") === cls) as HTMLElement;
      const swatch = item.querySelector(".cm-legend__swatch") as HTMLElement;
      expect((region(container, id) as SVGElement).style.fill).toBe(swatch.style.backgroundColor);
    }
  });

  it("does not re-render the map: highlighting does not call `getId` again", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { container } = preset({ getId });
    const before = getId.mock.calls.length;
    const item = container.querySelector(".cm-legend__item") as Element;
    fireEvent.pointerEnter(item);
    fireEvent.pointerLeave(item);
    expect(getId.mock.calls.length).toBe(before);
  });

  it("`interactive: false` sets no attributes or handlers", () => {
    const { container } = preset({ legend: { interactive: false } });
    expect(container.querySelector(".cm-legend [data-class]")).toBeNull();
  });

  it("with a continuous scale or `bubble` there is nothing to highlight", () => {
    const linear = preset({ classification: { method: "linear" } });
    expect(linear.container.querySelector(".cm-legend [data-class]")).toBeNull();
    linear.unmount();
    // `bubble` with a second metric: the legend HAS classes, but the color is in the bubbles, not in the regions.
    const bubble = preset({
      variant: "bubble",
      getColorValue: (r: Row) => (r.v === null ? null : r.v - 5),
    } as Partial<ChoroplethMapProps<Row>>);
    expect(bubble.container.querySelectorAll(".cm-legend__item").length).toBeGreaterThan(0);
    expect(bubble.container.querySelector(".cm-legend [data-class]")).toBeNull();
  });

  it("on unmounting the legend the highlight is released", () => {
    const { container, rerender } = preset();
    fireEvent.pointerEnter(container.querySelector(".cm-legend__item") as Element);
    expect(rootOf(container).hasAttribute("data-highlight-class")).toBe(true);
    const root = rootOf(container);
    rerender(
      <ChoroplethMap<Row> {...({ ...baseProps, legend: false } as ChoroplethMapProps<Row>)} />,
    );
    expect(root.hasAttribute("data-highlight-class")).toBe(false);
  });

  it("categories are highlighted too", () => {
    const { container } = preset({
      variant: "categorical",
      getCategory: (r: Row) => r.cat ?? null,
    } as Partial<ChoroplethMapProps<Row>>);
    const item = container.querySelector(".cm-legend__item") as Element;
    fireEvent.pointerEnter(item);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("0");
  });
});

describe("leyenda `bar`", () => {
  const bar = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
    preset({ legend: { variant: "bar" }, formatValue: (v: number) => `${v}u`, ...props });

  it("one segment per class, with its color, and the breaks underneath (start of each class and end of the last)", () => {
    const { container } = bar();
    const segments = [...container.querySelectorAll(".cm-legend__segment")] as HTMLElement[];
    const ticks = [...container.querySelectorAll(".cm-legend__tick")].map((t) => t.textContent);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.style.backgroundColor).not.toBe(segments[1]?.style.backgroundColor);
    expect(ticks).toHaveLength(3);
    expect(ticks[0]).toBe("1u");
    expect(ticks.at(-1)).toBe("9u");
    expect(container.querySelector(".cm-legend__items")).toBeNull();
  });

  it("the segments highlight just like the rows", () => {
    const { container } = bar();
    const segment = container.querySelectorAll(".cm-legend__segment")[1] as Element;
    expect(segment.getAttribute("data-class")).toBe("1");
    fireEvent.pointerEnter(segment);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("1");
  });

  it("no data goes apart, after the bar, and counts if you ask for `showCount`", () => {
    const { container } = bar({
      data: [{ code: "A", v: 1 }],
      legend: { variant: "bar", showCount: true },
    });
    const empty = container.querySelector(".cm-legend__item") as HTMLElement;
    expect(empty.textContent).toContain("No data");
    expect(empty.textContent).toContain("(1)");
    expect(empty.getAttribute("data-class")).toBe("empty");
  });

  it("the segment reports its range and its count (`title`)", () => {
    const { container } = bar();
    expect(container.querySelector(".cm-legend__segment")?.getAttribute("title")).toMatch(/\(1\)$/);
  });

  it("with categories, `bar` has no breaks to put: it is drawn as rows", () => {
    const { container } = bar({
      variant: "categorical",
      getCategory: (r: Row) => r.cat ?? null,
    } as Partial<ChoroplethMapProps<Row>>);
    expect(container.querySelector(".cm-legend__bar")).toBeNull();
    expect(container.querySelector(".cm-legend__items")).not.toBeNull();
  });

  it("with a continuous scale it is still the gradient", () => {
    const { container } = bar({ classification: { method: "linear" } });
    expect(container.querySelector(".cm-legend__bar")).toBeNull();
    expect(container.querySelector("[data-legend-gradient]")).not.toBeNull();
  });

  it("by default it is the usual list", () => {
    const { container } = preset();
    expect(container.querySelector(".cm-legend__bar")).toBeNull();
    expect(container.querySelectorAll(".cm-legend__item").length).toBeGreaterThan(1);
  });

  it("`classNames.legendItem` reaches the segments", () => {
    const { container } = bar({ classNames: { legendItem: "mine" } });
    expect(container.querySelector(".cm-legend__segment")?.classList.contains("mine")).toBe(true);
  });
});

describe("Defs and Patterns", () => {
  const patternPaths = (c: HTMLElement) => [...c.querySelectorAll(".cm-patterns path")];
  const idOfUrl = (fill: string | null) => /url\(#(.+)\)/.exec(fill ?? "")?.[1];

  it("`getRegionStyle().pattern` draws the pattern ON TOP of the color, which is kept", () => {
    const { container } = preset({
      getRegionStyle: (r) => (r.id === "B" ? { pattern: "hatch" } : undefined),
    });
    const marks = patternPaths(container);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("d")).toBe(region(container, "B").getAttribute("d"));
    // The scale's color is still there, underneath.
    expect((region(container, "B") as SVGElement).style.fill).not.toBe("");
    // The pattern points to a `<pattern>` that exists.
    const id = idOfUrl(marks[0]?.getAttribute("fill") ?? null) as string;
    expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull();
  });

  it("includes `hatch` and `dots`, and `dots` is drawn too", () => {
    const { container } = preset({ getRegionStyle: () => ({ pattern: "dots" }) });
    const id = idOfUrl(patternPaths(container)[0]?.getAttribute("fill") ?? null) as string;
    expect(id.endsWith("-dots")).toBe(true);
    expect(container.querySelector(`pattern[id="${id}"] circle`)).not.toBeNull();
  });

  it("patterns do not capture the mouse and are not announced", () => {
    const { container } = preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    const layer = container.querySelector(".cm-patterns") as Element;
    expect(layer.getAttribute("pointer-events")).toBe("none");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
  });

  it("`emptyPattern` fills only the regions without data", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }], emptyPattern: "hatch" });
    const marks = patternPaths(container);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("d")).toBe(region(container, "B").getAttribute("d"));
  });

  it("the `contrast` theme will hatch no data; `emptyPattern` wins over the theme", () => {
    const withTheme = preset({ data: [{ code: "A", v: 1 }], theme: "contrast" });
    expect(patternPaths(withTheme.container)).toHaveLength(1);
    withTheme.unmount();

    const none = preset({ data: [{ code: "A", v: 1 }], theme: "contrast", emptyPattern: "none" });
    expect(patternPaths(none.container)).toHaveLength(0);
    none.unmount();

    const light = preset({ data: [{ code: "A", v: 1 }], theme: "light" });
    expect(patternPaths(light.container)).toHaveLength(0);
  });

  it("the legend's no-data swatch carries the same pattern", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }], emptyPattern: "dots" });
    const swatch = container.querySelector(
      '.cm-legend__item[data-class="empty"] .cm-legend__swatch',
    );
    expect(swatch?.getAttribute("data-pattern")).toBe("dots");
  });

  it("TWO maps on the page do not share ids: each one references ITS definitions", () => {
    const { container } = render(
      <>
        <ChoroplethMap<Row>
          {...({
            ...baseProps,
            getRegionStyle: () => ({ pattern: "hatch" }),
          } as ChoroplethMapProps<Row>)}
        />
        <ChoroplethMap<Row>
          {...({
            ...baseProps,
            getRegionStyle: () => ({ pattern: "hatch" }),
          } as ChoroplethMapProps<Row>)}
        />
      </>,
    );
    const roots = [...container.querySelectorAll(".cm-root")] as HTMLElement[];
    const defined = roots.map((root) =>
      [...root.querySelectorAll("pattern")].map((p) => p.getAttribute("id")),
    );
    const used = roots.map((root) =>
      patternPaths(root).map((m) => idOfUrl(m.getAttribute("fill"))),
    );

    expect(new Set([...defined[0]!, ...defined[1]!]).size).toBe(4); // 2 patterns × 2 maps, all different
    for (let i = 0; i < 2; i++) {
      for (const id of used[i]!) expect(defined[i]).toContain(id);
    }
    expect(used[0]?.[0]).not.toBe(used[1]?.[0]);
    // And no id in the document is repeated.
    const all = [...container.querySelectorAll("[id]")].map((e) => e.getAttribute("id"));
    expect(new Set(all).size).toBe(all.length);
  });

  it("your own pattern: defined in `<Choropleth.Defs>` with `useDefId` and requested by its name", () => {
    const Stripes = () => (
      <pattern id={useDefId("stripes")} width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="2" height="4" fill="red" />
      </pattern>
    );
    const { container } = render(
      <Choropleth.Root
        {...({
          ...baseProps,
          getRegionStyle: (r: { id: string }) =>
            r.id === "A" ? { pattern: "stripes" } : undefined,
        } as unknown as RootProps<Row>)}
      >
        <Choropleth.Svg>
          <Choropleth.Defs>
            <Stripes />
          </Choropleth.Defs>
          <Choropleth.Viewport>
            <Choropleth.Regions />
            <Choropleth.Patterns />
          </Choropleth.Viewport>
        </Choropleth.Svg>
      </Choropleth.Root>,
    );
    const id = idOfUrl(patternPaths(container)[0]?.getAttribute("fill") ?? null) as string;
    expect(id.endsWith("-stripes")).toBe(true);
    expect(container.querySelector(`pattern[id="${id}"] rect`)).not.toBeNull();
  });

  it("the ids are valid in `url(#…)` (without useId's `:`)", () => {
    const { container } = preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    expect(idOfUrl(patternPaths(container)[0]?.getAttribute("fill") ?? null)).toMatch(/^[\w-]+$/);
  });

  it("without patterns the layer is not painted", () => {
    const { container } = preset();
    expect(container.querySelector(".cm-patterns")).toBeNull();
  });

  it("`getRegionStyle().pattern` no longer warns that it is ignored", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("pattern"))).toEqual(
      [],
    );
    warn.mockRestore();
  });
});
