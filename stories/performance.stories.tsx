// Performance (dd.md §14.2 and §21): thousands of synthetic regions (a fictional "admin-2") and 1,000 bubbles.
// The story does not measure for you: it SHOWS what matters while you interact.
//  · "Root renders" counts `getId` calls / rows: `Root` calls `getId` once per row on every render, so
//    if the number does not go up when moving the mouse, zooming or dragging, `Root` is not
//    re-rendering (the `src/react` tests watch this; here you see it).
//  · "Commits" and "Last commit" come from `<Profiler>`: the tooltip and the selection do make small
//    commits when moving between regions; what must not appear is a long commit per hover or per zoom frame.
//  · "Change indicator" recolors 3,600 regions (or 1,000 bubbles) and shows how long the render took.
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Profiler,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
} from "react";
import type { FeatureCollection, Polygon } from "geojson";
import { ChoroplethMap } from "../src/react";

const COLS = 90;
const ROWS = 40;
const CELL = 4;

/** Grid of 4° × 4° cells: 3,600 "regions" with id `r-<col>-<row>`. Outer ring clockwise (d3). */
const buildGrid = (): FeatureCollection<Polygon> => ({
  type: "FeatureCollection",
  features: Array.from({ length: COLS * ROWS }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x0 = -180 + col * CELL;
    const y0 = -80 + row * CELL;
    return {
      type: "Feature" as const,
      id: `r-${col}-${row}`,
      properties: { name: `Cell ${col}·${row}` },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [x0, y0],
            [x0, y0 + CELL],
            [x0 + CELL, y0 + CELL],
            [x0 + CELL, y0],
            [x0, y0],
          ],
        ],
      },
    };
  }),
});

type Cell = { id: string; a: number; b: number };
type Shop = { id: string; at: [number, number]; a: number; b: number };

/**
 * Deterministic number in [0, 1) per (id, salt). Murmur-style bit mixing: `seed` (a linear hash) gave
 * correlated values between similar ids (stripes per column, bubbles along a curve).
 */
const unit = (id: string, salt: number): number => {
  let h = 2166136261 ^ salt;
  for (const char of id) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const GRID = buildGrid();
const CELLS: Cell[] = GRID.features.map((f) => {
  const id = String(f.id);
  return { id, a: Math.round(unit(id, 1) * 100), b: Math.round(unit(id, 2) * 100) };
});
const SHOPS: Shop[] = Array.from({ length: 1000 }, (_, i) => {
  const id = `s-${i}`;
  return {
    id,
    at: [-175 + unit(id, 3) * 350, -75 + unit(id, 4) * 150],
    a: 1 + Math.round(unit(id, 5) * 100),
    b: 1 + Math.round(unit(id, 6) * 100),
  };
});

type Props = { kind: "regions" | "bubbles" };

const Demo = ({ kind }: Props) => {
  const [indicator, setIndicator] = useState<"a" | "b">("a");
  const calls = useRef(0);
  const commits = useRef(0);
  const readout = useRef<HTMLParagraphElement>(null);
  const lastSwitch = useRef<number | null>(null);

  const rows = kind === "regions" ? CELLS.length : SHOPS.length;
  const lastCommit = useRef(0);

  // Readouts go straight to the DOM: counting with `useState` would cause the very renders being measured.
  const paint = () => {
    if (readout.current === null) return;
    const rootRenders = Math.floor(calls.current / rows);
    const profiler =
      commits.current > 0
        ? `Commits (Profiler): ${commits.current} · last: ${lastCommit.current.toFixed(1)} ms`
        : "Commits: the Profiler only measures with `pnpm storybook` (development)";
    const sw =
      lastSwitch.current === null
        ? ""
        : ` · cambio de indicador: ${lastSwitch.current.toFixed(0)} ms`;
    readout.current.textContent = `Renders de Root (getId): ${rootRenders} · ${profiler}${sw}`;
  };
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commits.current += 1;
    lastCommit.current = actualDuration;
  };
  useEffect(() => {
    paint();
    const timer = setInterval(paint, 200);
    return () => clearInterval(timer);
  });

  const countedId = useMemo(
    () => (row: { id: string }) => {
      calls.current += 1;
      return row.id;
    },
    [],
  );

  const common = {
    geography: GRID,
    getId: countedId,
    projection: "mercator" as const,
    zoom: { max: 40 },
    emptyFill: "#e5e7eb",
    ariaLabel: "Synthetic performance map",
  };

  return (
    <div style={{ maxWidth: 1100, font: "13px system-ui, sans-serif" }}>
      <p style={{ margin: "0 0 8px" }}>
        {kind === "regions"
          ? `${CELLS.length} regiones coloreadas.`
          : `${SHOPS.length} burbujas sobre ${CELLS.length} regiones.`}{" "}
        Move the mouse, drag, zoom with the wheel and press the button.
      </p>
      <button
        type="button"
        onClick={() => {
          const t0 = performance.now();
          setIndicator((cur) => (cur === "a" ? "b" : "a"));
          // The synchronous render has already happened when the handler returns; the commit arrives right after.
          requestAnimationFrame(() => {
            lastSwitch.current = performance.now() - t0;
          });
        }}
      >
        Change indicator (now: {indicator.toUpperCase()})
      </button>
      <p ref={readout} style={{ margin: "8px 0", fontVariantNumeric: "tabular-nums" }}>
        Interact with the map…
      </p>
      <Profiler id="map" onRender={onRender}>
        {kind === "regions" ? (
          <ChoroplethMap
            {...common}
            data={CELLS}
            variant="sequential"
            getValue={(c) => c[indicator]}
            legend={{ title: `Indicador ${indicator.toUpperCase()}` }}
          />
        ) : (
          <ChoroplethMap
            {...common}
            data={SHOPS}
            variant="bubble"
            getValue={(s) => s[indicator]}
            getCoordinates={(s) => s.at}
            maxRadius={8}
            legend={{ title: `Indicador ${indicator.toUpperCase()}` }}
          />
        )}
      </Profiler>
    </div>
  );
};

const meta = {
  title: "Performance/AdminLevel",
  component: Demo,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 3,600 colored regions: hover, zoom and indicator change without recomputing paths. */
export const Regions3600: Story = { args: { kind: "regions" } };

/** 1,000 bubbles with their own coordinates over 3,600 gray regions. */
export const Bubbles1000: Story = { args: { kind: "bubbles" } };
