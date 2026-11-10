// Phase C (v0.4), steps 31-32: the `drill` prop and its choreography (flight to R, gray context,
// staggered reveal, going up to the earlier camera, lateral navigation). Deterministic SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import { geoBounds, geoCentroid } from "d3-geo";
import { toFeatureCollection, type DrillContext } from "../src/core";
import { world110m } from "../src/geo";
import {
  ChoroplethMap,
  defineDrillLevels,
  useDrillDown,
  type ChoroplethMapHandle,
  type DrillEvent,
} from "../src/react";
import { seed } from "./seed";

type Row = {
  id: string;
  /** `country` at the root level; `store` at the next one. */
  kind: "country" | "store";
  parentId?: string;
  value: number;
  /** A store's [lon, lat]. */
  at?: [number, number];
};

const features = toFeatureCollection({ geography: world110m, objectName: "countries" }).features;
// Without Antarctica: the root level filters it out and its data would give an "unjoined" warning.
const ids = features.flatMap((f) => (f.id === undefined || f.id === "AQ" ? [] : [String(f.id)]));

/** Countries with stores (the others are not navigable: a click selects them). */
const WITH_STORES = ["ES", "FR", "DE", "IT", "GB", "US", "BR", "JP", "AU", "ZA", "IN", "MX"];

const countries: Row[] = ids.map((id) => ({
  id,
  kind: "country",
  value: Math.round(((seed(id) * 9301) % 1000) / 10),
}));

/** 8-14 stores spread across the country (synthetic; some land in the sea and that is normal). */
const storesOf = (countryId: string): Row[] => {
  const feature = features.find((f) => f.id === countryId);
  if (feature === undefined) return [];
  const [lon, lat] = geoCentroid(feature);
  const [[west, south], [east, north]] = geoBounds(feature);
  const spanLon = Math.min(Math.abs(east - west), 40);
  const spanLat = Math.min(Math.abs(north - south), 25);
  const count = 8 + (seed(countryId) % 7);
  return Array.from({ length: count }, (_, i) => {
    const a = (seed(`${countryId}${i}a`) % 1000) / 1000 - 0.5;
    const b = (seed(`${countryId}${i}b`) % 1000) / 1000 - 0.5;
    return {
      id: `${countryId}-S${i + 1}`,
      kind: "store" as const,
      parentId: countryId,
      value: 10 + (seed(`${countryId}${i}v`) % 90),
      at: [lon + a * spanLon * 0.7, lat + b * spanLat * 0.7],
    };
  });
};
const storesByCountry = new Map(WITH_STORES.map((id) => [id, storesOf(id)]));

/** The `data` selector: rows of the level being shown. */
const select = ({ depth, parentId }: DrillContext): readonly Row[] =>
  depth === 0 ? countries : (storesByCountry.get(parentId ?? "") ?? []);

// Example A from dd.md §11.2.2: world → country → stores. Here the second level inherits the world's
// geometry ("inherit") and draws the stores as bubbles at their coordinates.
const levels = defineDrillLevels<Row>([
  {
    id: "country",
    label: "World",
    geography: world110m,
    objectName: "countries",
    filterFeatures: (f) => f.id !== "AQ",
    canDrill: (item) => WITH_STORES.includes(item.id),
  },
  {
    id: "store",
    geography: "inherit",
    encoding: {
      variant: "bubble",
      getValue: (r) => r.value,
      getCoordinates: (r) => r.at ?? null,
      color: "#e4572e",
    },
  },
]);

const common = {
  getId: (r: Row) => r.id,
  variant: "sequential",
  getValue: (r: Row) => r.value,
  aspectRatio: "auto",
  zoom: { controls: true },
  emptyLabel: "No data",
} as const;

const Log = ({ lines }: { lines: string[] }) => (
  <pre style={{ font: "12px/1.5 monospace", margin: "8px 0 0", minHeight: 72, opacity: 0.85 }}>
    {lines.length === 0 ? "—" : lines.join("\n")}
  </pre>
);

const describe = (e: DrillEvent<Row>) =>
  `${e.direction}: [${e.from.path.join(" › ")}] → [${e.to.path.join(" › ")}]${e.item ? ` (clic en ${e.item.id})` : ""}`;

// ── Uncontrolled ──────────────────────────────────────────────────────────────────────────────────

const Uncontrolled = () => {
  const [lines, setLines] = useState<string[]>([]);
  const push = (line: string) => setLines((prev) => [...prev.slice(-5), line]);
  // Example A from dd.md §11.2.2 as is: `drill={levels}` and done. The breadcrumbs, "←", Escape and
  // Backspace come included in the preset.
  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <ChoroplethMap<Row>
        {...common}
        drill={levels}
        data={select}
        onDrill={(e) => push(`onDrill     ${describe(e)}`)}
        onDrillEnd={(e) => push(`onDrillEnd  ${describe(e)}`)}
      />
      <Log lines={lines} />
    </div>
  );
};

// ── Controlled ────────────────────────────────────────────────────────────────────────────────────

/** Simulates a query with latency: `undefined` (loading) for 900 ms after each route change. */
const useFakeQuery = (path: readonly string[]) => {
  const key = path.join(".");
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setReady(key), 900);
    return () => clearTimeout(timer);
  }, [key]);
  return ready === key;
};

const Controlled = () => {
  // The "URL" lives in the consumer's state (with React Router it would be `useSearchParams`).
  const [url, setUrl] = useState<readonly string[]>([]);
  const drill = useDrillDown<Row>({ levels, path: url, onPathChange: setUrl });
  const loaded = useFakeQuery(drill.path);
  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
      >
        <code>?path={drill.path.join(".") || "(root)"}</code>
        <button disabled={!drill.canDrillUp} onClick={() => drill.drillUp()}>
          ← Up
        </button>
        <button disabled={!drill.canDrillUp} onClick={() => drill.reset()}>
          Root
        </button>
        <button onClick={() => drill.drillTo(["ES"])}>Jump to Spain</button>
        <span>
          status: <b>{drill.status}</b>
          {!loaded && " · loading data…"}
        </span>
      </div>
      <ChoroplethMap<Row>
        {...common}
        drill={drill}
        // No `keepPreviousData` BETWEEN levels: `undefined` tells the map "loading" and it keeps the
        // previous level (with ITS data) instead of painting new data over the old geometry.
        data={(ctx) => (loaded ? select(ctx) : undefined)}
      />
    </div>
  );
};

// ── Errors ────────────────────────────────────────────────────────────────────────────────────────

const failing = defineDrillLevels<Row>([
  {
    id: "country",
    geography: world110m,
    objectName: "countries",
    filterFeatures: (f) => f.id !== "AQ",
  },
  {
    id: "region",
    // Spain: the load fails. France: it arrives empty. The rest: the world's geometry.
    geography: ({ parentId }) => {
      if (parentId === "ES") return Promise.reject(new Error("network error (simulated)"));
      if (parentId === "FR")
        return Promise.resolve({ type: "FeatureCollection", features: [] } as never);
      return Promise.resolve(world110m);
    },
    objectName: "countries",
    geographyKey: ({ parentId }) => `region:${parentId}`,
  },
]);

const Errors = () => {
  const [lines, setLines] = useState<string[]>([]);
  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <p style={{ margin: "0 0 8px" }}>
        Click <b>Spain</b> (the load fails) or <b>France</b> (0 regions): the map stays where it was
        and<code> onDrillError </code> reports it. Any other country loads fine.
      </p>
      <ChoroplethMap<Row>
        {...common}
        drill={failing}
        data={(ctx) => (ctx.depth === 0 ? countries : [])}
        onDrillError={({ error, ctx }) =>
          setLines((prev) => [
            ...prev.slice(-4),
            `[${ctx.path.join(" › ")}] ${error instanceof Error ? error.message : String(error)}`,
          ])
        }
      />
      <Log lines={lines} />
    </div>
  );
};

// ── Handle and intent (step 34) ─────────────────────────────────────────────────────────────────

const HandleDemo = () => {
  const ref = useRef<ChoroplethMapHandle>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const push = (line: string) => setLines((prev) => [...prev.slice(-7), line]);
  const api = () => ref.current as ChoroplethMapHandle;

  /** Each step is `await`ed: there are no timers, only promises that resolve on returning to rest. */
  const tour = async () => {
    setBusy(true);
    const step = async (name: string, run: () => Promise<{ completed: boolean }>) => {
      const { completed } = await run();
      push(`${name} → completed: ${completed}`);
    };
    await step('drillDown("ES")', () => api().drillDown("ES"));
    await step('drillTo(["FR"])', () => api().drillTo(["FR"]));
    await step('drillTo(["DE"])', () => api().drillTo(["DE"]));
    await step("drillUp()", () => api().drillUp());
    await step('drillDown("ZZ")  (does not exist: warns on the console)', () =>
      api().drillDown("ZZ"),
    );
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => void tour()}>
          ▶ Tour (ES → FR → DE → mundo)
        </button>
        <button onClick={() => void api().drillDown("US")}>drillDown("US")</button>
        <button onClick={() => void api().drillUp()}>drillUp()</button>
        <button onClick={() => void api().drillTo([])}>drillTo([])</button>
      </div>
      <ChoroplethMap<Row>
        {...common}
        ref={ref}
        drill={levels}
        data={select}
        onDrillIntent={(ctx) =>
          push(`onDrillIntent  [${ctx.path.join(" › ")}]  (150 ms hover: data prefetch)`)
        }
        onDrillEnd={(e) => push(`onDrillEnd     ${describe(e)}`)}
      />
      <Log lines={lines} />
    </div>
  );
};

const meta = {
  title: "DrillDown/Engine",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * World → country → stores, uncontrolled. Only the 12 countries with stores get a `zoom-in` cursor. On
 * click: the rest dims, the camera FLIES to the country and the stores fan out from the center. The
 * other countries stay gray (context) and the 12 with stores are clickable (lateral navigation). Going
 * up returns to the camera from before going down. Breadcrumbs top-left; "←", Escape and Backspace go up.
 */
export const UncontrolledStory: Story = { name: "Uncontrolled", render: () => <Uncontrolled /> };

/** Route in the "URL", controlled `useDrillDown` and artificial latency: while the data arrives the previous level is kept. */
export const ControlledUrl: Story = { render: () => <Controlled /> };

/** A geometry that fails and an empty level: back to the previous level and `onDrillError`. */
export const ErrorsStory: Story = { name: "Errors", render: () => <Errors /> };

/**
 * The drill handle (`ref`): `drillDown` / `drillUp` / `drillTo` return a `Promise` that resolves on
 * returning to rest, so a script is one `await` after another. Also, `onDrillIntent`: leave the mouse
 * 150 ms over a country with stores and it is logged (the geometry of the level below is already
 * preloaded). **Touch** (emulation in devtools): the first tap on a country shows the "Tap again to
 * enter" tooltip and the second drills down.
 */
export const HandleStory: Story = { name: "Handle + intent", render: () => <HandleDemo /> };
