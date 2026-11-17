import { act, fireEvent, render } from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import { Choropleth } from "./choropleth";
import { ChoroplethMap } from "./choropleth-map";
import type { RootProps } from "./components/root";

// HTML markers anchored to [lon, lat]. Position is CSS over variables that `use-zoom` writes per
// frame, so moving the camera must not re-render the marker.

const world: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "A",
      properties: { name: "Alpha" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-120, -30],
            [120, -30],
            [120, 30],
            [-120, 30],
            [-120, -30],
          ],
        ],
      },
    },
  ],
};

type Row = { code: string; v: number };
const base = {
  geography: world,
  data: [{ code: "A", v: 1 }],
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  if (vi.isFakeTimers()) act(() => void vi.runOnlyPendingTimers());
  vi.useRealTimers();
});

describe("Marker", () => {
  it("renders its content inside a clipping overlay above the map", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]}>
          <b data-testid="pin">pin</b>
        </Choropleth.Marker>
      </Choropleth.Root>,
    );
    const marker = container.querySelector(".cm-markers > .cm-marker") as HTMLElement;
    expect(marker.textContent).toBe("pin");
    expect((container.querySelector(".cm-markers") as HTMLElement).style.overflow).toBe("hidden");
  });

  it("is positioned from the camera variables, as a share of the canvas", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} />
      </Choropleth.Root>,
    );
    const marker = container.querySelector(".cm-marker") as HTMLElement;
    expect(marker.style.left).toContain("--cm-k");
    expect(marker.style.left).toContain("--cm-x");
    expect(marker.style.top).toContain("--cm-y");
    expect(marker.style.left).toContain("/ 200 * 100%");
    expect(marker.style.top).toContain("/ 100 * 100%");
  });

  it("anchors by the tip of the pin by default and by the center on request", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} />
        <Choropleth.Marker coordinates={[10, 10]} anchor="center" />
      </Choropleth.Root>,
    );
    const [pin, dot] = [...container.querySelectorAll<HTMLElement>(".cm-marker")];
    expect(pin?.style.transform).toContain("translate(-50%, -100%)");
    expect(dot?.style.transform).toContain("translate(-50%, -50%)");
  });

  it("counter-scales the map by default and grows with it on `scaleWithMap`", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} />
        <Choropleth.Marker coordinates={[10, 10]} scaleWithMap />
      </Choropleth.Root>,
    );
    const [fixed, scaled] = [...container.querySelectorAll<HTMLElement>(".cm-marker")];
    expect(fixed?.style.transform).not.toContain("scale");
    expect(scaled?.style.transform).toContain("scale(var(--cm-k");
  });

  it("`clip={false}` lets it overflow the map", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} clip={false} />
      </Choropleth.Root>,
    );
    expect((container.querySelector(".cm-markers") as HTMLElement).style.overflow).toBe("visible");
  });

  it("draws nothing for a coordinate that cannot be projected", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[Number.NaN, 0]} />
      </Choropleth.Root>,
    );
    expect(container.querySelector(".cm-marker")).toBeNull();
  });

  it("names itself for assistive technology only if given a `label`", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} label="HQ" />
        <Choropleth.Marker coordinates={[10, 10]} />
      </Choropleth.Root>,
    );
    const [named, anonymous] = [...container.querySelectorAll(".cm-marker")];
    expect(named?.getAttribute("aria-label")).toBe("HQ");
    expect(anonymous?.hasAttribute("aria-label")).toBe(false);
  });

  it("adds the consumer's classes to the `markers` and `marker` slots", () => {
    const { container } = render(
      <Choropleth.Root
        {...({
          ...base,
          classNames: { markers: "mine-layer", marker: "mine-pin" },
        } as RootProps<Row>)}
      >
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} />
      </Choropleth.Root>,
    );
    expect(container.querySelector(".cm-markers.mine-layer .cm-marker.mine-pin")).not.toBeNull();
  });

  it("moving the camera updates the variables and does NOT re-render the marker", () => {
    let renders = 0;
    const Probe = () => {
      renders += 1;
      return <i>probe</i>;
    };
    const { container } = render(
      <Choropleth.Root {...({ ...base } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]}>
          <Probe />
        </Choropleth.Marker>
      </Choropleth.Root>,
    );
    const root = container.querySelector(".cm-root") as HTMLElement;
    const svg = container.querySelector("svg") as SVGSVGElement;
    const before = renders;

    fireEvent.wheel(svg, { deltaY: -2000, clientX: 40, clientY: 20 });
    act(() => void vi.advanceTimersByTime(200));

    expect(Number(root.style.getPropertyValue("--cm-k"))).toBeGreaterThan(1);
    expect(root.style.getPropertyValue("--cm-x")).not.toBe("");
    expect(root.style.getPropertyValue("--cm-y")).not.toBe("");
    expect(renders).toBe(before);
  });
});

describe("markers prop on the preset", () => {
  it("draws one marker per spec, with its content or a default dot", () => {
    const { container } = render(
      <ChoroplethMap<Row>
        {...base}
        markers={[
          { id: "hq", coordinates: [0, 0], children: <b>HQ</b> },
          { id: "dot", coordinates: [20, 10], anchor: "center" },
        ]}
      />,
    );
    const markers = [...container.querySelectorAll(".cm-marker")];
    expect(markers).toHaveLength(2);
    expect(markers[0]?.textContent).toBe("HQ");
    expect(markers[1]?.querySelector(".cm-marker__dot")).not.toBeNull();
    // One shared layer for all of them.
    expect(container.querySelectorAll(".cm-markers")).toHaveLength(1);
  });

  it("draws no layer without markers", () => {
    const { container } = render(<ChoroplethMap<Row> {...base} />);
    expect(container.querySelector(".cm-markers")).toBeNull();
  });
});
