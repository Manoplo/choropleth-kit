import { render, screen } from "@testing-library/react";
import { world110m } from "../geo";
import { ChoroplethMap } from "./choropleth-map";

// `dd.md §21` criterion: "the example works copied as is". This is the README's 10-line one;
// if it changes there, it changes here.
describe("README: the map in 10 lines", () => {
  const data = [
    { country: "ES", sales: 120 },
    { country: "FR", sales: 95 },
    { country: "DE", sales: 150 },
  ];

  it("paints the world with the three countries colored and only the no-data warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <ChoroplethMap
        geography={world110m}
        objectName="countries"
        data={data}
        getId={(row) => row.country}
        getValue={(row) => row.sales}
        variant="sequential"
        legend={{ title: "Ventas" }}
      />,
    );
    const es = container.querySelector('[data-region-id="ES"]') as Element;
    const us = container.querySelector('[data-region-id="US"]') as Element;
    expect(es).not.toBeNull();
    expect(es.getAttribute("data-empty")).toBeNull();
    expect(us.hasAttribute("data-empty")).toBe(true);
    expect(screen.getByText("Ventas")).toBeTruthy();
    // The only warning allowed: the development diagnostic for regions without data (3 countries of 177).
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringMatching(/172 region\(s\) have no data/),
    ]);
  });
});
