import { act, fireEvent, render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import type { ViewState } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { useCamera } from "./use-camera";

// Step 37: `useCamera(selector)` (dd.md §11.1.7). It subscribes to the CONFIRMED camera: nothing per frame.

type Row = { code: string; v: number | null };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const baseProps = {
  geography: twoSquares,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const wheel = (svg: Element, deltaY = -300) =>
  fireEvent.wheel(svg, { deltaY, clientX: 100, clientY: 50 });
const endWheel = () => act(() => void vi.advanceTimersByTime(200));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useCamera", () => {
  const setup = <T,>(selector: (view: ViewState) => T, props: Partial<RootProps<Row>> = {}) => {
    const renders: T[] = [];
    const Probe = () => {
      const value = useCamera(selector);
      renders.push(value);
      return <output data-testid="probe">{JSON.stringify(value)}</output>;
    };
    const utils = render(
      <Choropleth.Root {...({ ...baseProps, ...props } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Probe />
      </Choropleth.Root>,
    );
    return { ...utils, renders, svg: utils.container.querySelector("svg") as SVGSVGElement };
  };

  it("reads the initial view (fit: zoom 1)", () => {
    const { renders } = setup((v) => v.zoom);
    expect(renders.at(-1)).toBe(1);
  });

  it("updates when the gesture ENDS, not during it", () => {
    const { renders, svg, getByTestId } = setup((v) => v.zoom);
    wheel(svg);
    // Gesture in progress: the live camera already changed in the DOM, but React is unaware.
    expect(getByTestId("probe").textContent).toBe("1");
    const during = renders.length;
    endWheel();
    expect(Number(getByTestId("probe").textContent)).toBeGreaterThan(1);
    expect(renders.length).toBeGreaterThan(during);
  });

  it("does not re-render if the selector's result does not change (primitive)", () => {
    const { renders, svg } = setup((v) => v.zoom > 1000);
    const before = renders.length;
    wheel(svg);
    endWheel();
    expect(renders.length).toBe(before);
  });

  it("returns a new object on every call without looping and compares shallowly", () => {
    const { renders, svg } = setup((v) => ({ big: v.zoom > 1000 }));
    const before = renders.length;
    wheel(svg);
    endWheel();
    expect(renders.length).toBe(before);
  });

  it("hover does not evaluate the selector (the cache is keyed by the camera's reference)", () => {
    const selector = vi.fn<(v: ViewState) => number>((v) => v.zoom);
    const { container } = setup(selector);
    const before = selector.mock.calls.length;
    const path = container.querySelector('[data-region-id="A"]') as Element;
    fireEvent.pointerOver(path);
    fireEvent.pointerMove(path, { clientX: 10, clientY: 10 });
    expect(selector.mock.calls.length).toBe(before);
  });

  it("outside <Choropleth.Root> it warns with a clear error", () => {
    const Lonely = () => <b>{useCamera((v) => v.zoom)}</b>;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Lonely />)).toThrow(/inside <Choropleth.Root>/);
  });
});
