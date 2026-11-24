import { render } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";

// `showAntarctica`: Antarctica is dropped by default; data for it is then ignored without warnings.

const square = (x: number, y: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
      [x, y],
    ],
  ],
});
const world: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", id: "ES", properties: {}, geometry: square(0, 0) },
    { type: "Feature", id: "AQ", properties: {}, geometry: square(0, -60) },
  ],
};

type Row = { code: string; v: number };
const baseProps = {
  geography: world,
  data: [
    { code: "ES", v: 1 },
    { code: "AQ", v: 5 },
  ] as Row[],
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const preset = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);
const ids = (c: HTMLElement) =>
  [...c.querySelectorAll(".cm-regions [data-region-id]")].map((e) =>
    e.getAttribute("data-region-id"),
  );

afterEach(() => vi.restoreAllMocks());

describe("showAntarctica", () => {
  it("does not draw Antarctica by default, and does not warn about its data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = preset();
    expect(ids(container)).toEqual(["ES"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("draws it with `showAntarctica`", () => {
    expect(ids(preset({ showAntarctica: true }).container)).toEqual(["ES", "AQ"]);
  });

  it("keeps the consumer's own filter working alongside", () => {
    const { container } = preset({
      geography: {
        ...world,
        features: [
          ...world.features,
          { type: "Feature", id: "FR", properties: {}, geometry: square(5, 5) },
        ],
      },
      filterFeatures: (f) => f.id !== "FR",
    });
    expect(ids(container)).toEqual(["ES"]);
  });
});
