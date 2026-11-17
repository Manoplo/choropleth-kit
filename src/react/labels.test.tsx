import { render, renderHook } from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { useChoropleth, type UseChoroplethOptions } from "./use-choropleth";

// The region-names layer (`regionLabels`). The collision math is tested in `core/label-layout`.

// Two big squares, far apart: `twoSquares` is ~1 px wide on the default projection, so its labels would collide.
const square = (id: string, name: string, west: number, east: number) => ({
  type: "Feature" as const,
  id,
  properties: { name },
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [west, -30],
        [east, -30],
        [east, 30],
        [west, 30],
        [west, -30],
      ],
    ],
  },
});
const bigSquares: FeatureCollection = {
  type: "FeatureCollection",
  features: [square("A", "Alpha", -120, -40), square("B", "Beta", 40, 120)],
};

type Row = { code: string; v: number };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const base = {
  geography: bigSquares,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 400,
  height: 200,
} as const;

const renderMap = (props: Partial<RootProps<Row>> = {}) =>
  render(
    <Choropleth.Root {...({ ...base, ...props } as RootProps<Row>)}>
      <Choropleth.Svg />
    </Choropleth.Root>,
  );

const labelTexts = (container: HTMLElement) =>
  [...container.querySelectorAll(".cm-label")].map((el) => el.textContent);

describe("regionLabels", () => {
  it("draws nothing by default", () => {
    const { container } = renderMap();
    expect(container.querySelector(".cm-labels")).toBeNull();
  });

  it("draws each region's name with `regionLabels`", () => {
    const { container } = renderMap({ regionLabels: true });
    expect(labelTexts(container).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("lives inside the camera so it moves with the map", () => {
    const { container } = renderMap({ regionLabels: true });
    expect(container.querySelector(".cm-viewport .cm-labels")).not.toBeNull();
  });

  it("is decoration: hidden from assistive tech and never captures the pointer", () => {
    const { container } = renderMap({ regionLabels: true });
    const layer = container.querySelector(".cm-labels");
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.getAttribute("pointer-events")).toBe("none");
  });

  it("publishes the zoom bucket", () => {
    const { container } = renderMap({ regionLabels: true });
    expect(container.querySelector(".cm-labels")?.getAttribute("data-zoom-bucket")).toBe("0");
  });

  it("`format` changes the text and `null` drops the label", () => {
    const { container } = renderMap({
      regionLabels: { format: (region) => (region.id === "A" ? region.id : null) },
    });
    expect(labelTexts(container)).toEqual(["A"]);
  });

  it("adds the consumer's classes to the `labels` and `label` slots", () => {
    const { container } = renderMap({
      regionLabels: true,
      classNames: { labels: "mine-layer", label: "mine-text" },
    });
    expect(container.querySelector(".cm-labels.mine-layer")).not.toBeNull();
    expect(container.querySelectorAll(".cm-label.mine-text")).toHaveLength(2);
  });
});

describe("regionLabels in the hook", () => {
  const hook = (regionLabels: UseChoroplethOptions<Row>["regionLabels"]) =>
    renderHook(() => useChoropleth<Row>({ ...base, regionLabels } as UseChoroplethOptions<Row>))
      .result.current.regionLabels;

  it("is `null` when the layer is off", () => {
    expect(hook(undefined)).toBeNull();
    expect(hook(false)).toBeNull();
  });

  it("builds one candidate per region, anchored inside the canvas", () => {
    const view = hook(true);
    expect(view?.candidates.map((c) => c.id).sort()).toEqual(["A", "B"]);
    for (const c of view?.candidates ?? []) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(400);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(200);
    }
  });

  it("uses the projected area as the default priority and honors `priority`", () => {
    const byArea = hook(true)?.candidates ?? [];
    expect(byArea.every((c) => c.priority > 0)).toBe(true);
    const custom = hook({ priority: (region) => (region.id === "B" ? 100 : 1) })?.candidates ?? [];
    expect(custom.find((c) => c.id === "B")?.priority).toBe(100);
    expect(custom.find((c) => c.id === "A")?.priority).toBe(1);
  });

  it("forwards font size and padding to the collision step", () => {
    const view = hook({ fontSize: 14, padding: 6 });
    expect(view?.fontSize).toBe(14);
    expect(view?.padding).toBe(6);
  });
});
