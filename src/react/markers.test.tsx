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

describe("Marker presets", () => {
  const preset = (props: Record<string, unknown>) =>
    render(
      <Choropleth.Root<Row> {...(base as unknown as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} {...props} />
      </Choropleth.Root>,
    );

  it("keeps the plain dot when no preset option is given", () => {
    const { container } = preset({});
    expect(container.querySelector(".cm-marker__dot")).not.toBeNull();
    expect(container.querySelector(".cm-marker__shape")).toBeNull();
  });

  it("any preset option draws the shape instead of the dot", () => {
    const { container } = preset({ shape: "diamond", size: 20, color: "tomato" });
    const shape = container.querySelector<HTMLElement>(".cm-marker__shape");
    expect(container.querySelector(".cm-marker__dot")).toBeNull();
    expect(shape?.getAttribute("data-shape")).toBe("diamond");
    expect(shape?.style.width).toBe("20px");
    expect(shape?.style.color).toBe("tomato");
    expect(shape?.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
  });

  it("your own children win over the preset", () => {
    const { container } = preset({ shape: "pin", children: <b>HQ</b> });
    expect(container.querySelector(".cm-marker__shape")).toBeNull();
    expect(container.querySelector(".cm-marker")?.textContent).toBe("HQ");
  });

  it("a pin puts its tip on the coordinate, the others are centered, and `anchor` overrides", () => {
    const anchorOf = (props: Record<string, unknown>) =>
      preset(props).container.querySelector(".cm-marker")?.getAttribute("data-anchor");
    expect(anchorOf({ shape: "pin" })).toBe("bottom");
    expect(anchorOf({ shape: "square" })).toBe("center");
    expect(anchorOf({ size: 8 })).toBe("center");
    expect(anchorOf({ shape: "pin", anchor: "center" })).toBe("center");
    expect(anchorOf({ children: "x" })).toBe("bottom");
  });

  it("pulse adds the ripple with its mode, and `none` adds nothing", () => {
    const always = preset({ pulse: "always" }).container.querySelector(".cm-marker__shape");
    expect(always?.getAttribute("data-pulse")).toBe("always");
    expect(always?.querySelector(".cm-marker__pulse")).not.toBeNull();

    const none = preset({ pulse: "none" }).container.querySelector(".cm-marker__shape");
    expect(none?.hasAttribute("data-pulse")).toBe(false);
    expect(none?.querySelector(".cm-marker__pulse")).toBeNull();
  });

  it("glow is a drop-shadow on the svg, and the outline can be turned off", () => {
    const { container } = preset({ glow: 6, stroke: "none" });
    const svg = container.querySelector<SVGElement>(".cm-marker__shape svg");
    expect(svg?.style.filter).toContain("drop-shadow(0 0 6px currentColor)");
    expect(container.querySelector(".cm-marker__shape path")?.hasAttribute("stroke")).toBe(false);
  });

  it("works through the `markers` prop of the preset map", () => {
    const { container } = render(
      <ChoroplethMap<Row>
        {...base}
        markers={[{ id: "a", coordinates: [0, 0], shape: "triangle", pulse: "hover" }]}
      />,
    );
    expect(container.querySelector(".cm-marker__shape")?.getAttribute("data-shape")).toBe(
      "triangle",
    );
  });
});

describe("Marker labels", () => {
  const withLabel = (props: Record<string, unknown>) =>
    render(
      <Choropleth.Root<Row> {...(base as unknown as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} {...props} />
      </Choropleth.Root>,
    );

  it("draws the label beside the shape, as decoration for assistive technology", () => {
    const { container } = withLabel({ label: "Madrid", showLabel: true });
    const text = container.querySelector(".cm-marker__shape .cm-marker__label");
    expect(text?.textContent).toBe("Madrid");
    expect(text?.getAttribute("aria-hidden")).toBe("true");
    expect(text?.getAttribute("data-position")).toBe("right");
    // Without `labelPosition` the side is automatic.
    expect(text?.hasAttribute("data-auto")).toBe(true);
    // The marker itself keeps its accessible name.
    expect(container.querySelector(".cm-marker")?.getAttribute("aria-label")).toBe("Madrid");
  });

  it("showLabel alone turns the preset on; without it the label stays in the aria-label only", () => {
    expect(
      withLabel({ label: "Madrid", showLabel: true }).container.querySelector(".cm-marker__shape"),
    ).not.toBeNull();
    expect(withLabel({ label: "Madrid" }).container.querySelector(".cm-marker__label")).toBeNull();
  });

  it("draws nothing without text, and carries the position and priority", () => {
    expect(withLabel({ showLabel: true }).container.querySelector(".cm-marker__label")).toBeNull();
    const text = withLabel({
      label: "X",
      showLabel: true,
      labelPosition: "top",
      labelPriority: 7,
    }).container.querySelector(".cm-marker__label");
    expect(text?.getAttribute("data-position")).toBe("top");
    expect(text?.getAttribute("data-preferred")).toBe("top");
    expect(text?.hasAttribute("data-auto")).toBe(false);
    expect(text?.getAttribute("data-priority")).toBe("7");
  });

  it("does not hide anything where there is no layout (jsdom measures empty boxes)", () => {
    const { container } = render(
      <Choropleth.Root<Row> {...(base as unknown as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Markers>
          <Choropleth.Marker coordinates={[0, 0]} label="A" showLabel />
          <Choropleth.Marker coordinates={[0, 0]} label="B" showLabel />
        </Choropleth.Markers>
      </Choropleth.Root>,
    );
    expect(container.querySelectorAll(".cm-marker__label[data-hidden]")).toHaveLength(0);
  });
});

describe("Marker tooltip", () => {
  const withTip = (props: Record<string, unknown>) =>
    render(
      <Choropleth.Root<Row> {...(base as unknown as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Marker coordinates={[0, 0]} {...props} />
      </Choropleth.Root>,
    );

  it("draws no tooltip, and no tab stop, without one", () => {
    const { container } = withTip({ label: "Madrid" });
    expect(container.querySelector(".cm-marker__tooltip")).toBeNull();
    expect(container.querySelector(".cm-marker")?.hasAttribute("tabindex")).toBe(false);
  });

  it("shows your content, describes the marker, and makes it focusable", () => {
    const { container } = withTip({ label: "Madrid", tooltip: <b>3 stores</b> });
    const marker = container.querySelector(".cm-marker");
    const tip = container.querySelector(".cm-marker__tooltip");
    expect(tip?.textContent).toBe("3 stores");
    expect(tip?.getAttribute("role")).toBe("tooltip");
    expect(tip?.getAttribute("data-side")).toBe("top");
    expect(marker?.getAttribute("tabindex")).toBe("0");
    expect(marker?.getAttribute("aria-describedby")).toBe(tip?.id);
  });

  it("`true` shows the label, and does nothing if there is no label", () => {
    expect(
      withTip({ label: "Madrid", tooltip: true }).container.querySelector(".cm-marker__tooltip")
        ?.textContent,
    ).toBe("Madrid");
    expect(withTip({ tooltip: true }).container.querySelector(".cm-marker__tooltip")).toBeNull();
    expect(
      withTip({ label: "x", tooltip: false }).container.querySelector(".cm-marker__tooltip"),
    ).toBeNull();
  });

  it("works with your own children and with the preset shapes", () => {
    const own = withTip({ children: <i>card</i>, tooltip: "More" });
    expect(own.container.querySelector(".cm-marker__tooltip")?.textContent).toBe("More");
    const shape = withTip({ shape: "pin", tooltip: "More" });
    expect(shape.container.querySelector(".cm-marker__shape")).not.toBeNull();
    expect(shape.container.querySelector(".cm-marker__tooltip")?.textContent).toBe("More");
  });

  it("hovering where there is no layout leaves the default side (jsdom measures empty boxes)", () => {
    const { container } = withTip({ tooltip: "x" });
    fireEvent.pointerEnter(container.querySelector(".cm-marker") as Element);
    expect(container.querySelector(".cm-marker__tooltip")?.getAttribute("data-side")).toBe("top");
  });
});
