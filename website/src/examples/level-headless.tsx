import { useChoropleth } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";

// Synthetic numbers.
const sales = [
  { country: "ES", units: 1280 },
  { country: "FR", units: 2140 },
  { country: "DE", units: 2960 },
  { country: "IT", units: 1760 },
  { country: "PT", units: 540 },
  { country: "GB", units: 2310 },
];

export default function LevelHeadless() {
  const { containerRef, width, height, regions, borders, legend, getRegionProps } = useChoropleth({
    geography: world110m,
    objectName: "countries",
    region: "europe",
    data: sales,
    getId: (row) => row.country,
    getValue: (row) => row.units,
    variant: "sequential",
    emptyFill: "#d4d4d4",
    diagnostics: false, // @docs-only
  });

  return (
    // Put the ref on the container so the map adapts to its width.
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
        {regions.map((region) => (
          <path key={region.id} d={region.path} fill={region.fill} {...getRegionProps(region)} />
        ))}
        {borders !== null && <path d={borders} fill="none" stroke="white" strokeWidth={0.5} />}
      </svg>
      <ul style={{ display: "flex", flexWrap: "wrap", gap: 12, listStyle: "none", padding: 0 }}>
        {legend.map((item) => (
          <li key={item.label} style={{ fontSize: 13 }}>
            <span
              style={{ background: item.color, display: "inline-block", width: 12, height: 12 }}
            />{" "}
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
