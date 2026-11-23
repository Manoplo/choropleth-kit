import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

// The API reference is generated from the TSDoc inside the PUBLISHED package (its .d.ts files), so the
// site stays isolated from the library source and the reference always matches the installed version.
const dist = "./node_modules/choropleth-kit/dist";
const typeDocOptions = {
  excludeInternal: true,
  disableSources: true,
  readme: "none",
  skipErrorChecking: true,
  validation: { notExported: false, invalidLink: false, notDocumented: false },
};
const [reactApi, reactApiGroup] = createStarlightTypeDocPlugin();
const [coreApi, coreApiGroup] = createStarlightTypeDocPlugin();
const [geoApi, geoApiGroup] = createStarlightTypeDocPlugin();

export default defineConfig({
  integrations: [
    react(),
    starlight({
      title: "choropleth-kit",
      plugins: [
        reactApi({
          entryPoints: [`${dist}/index.d.ts`],
          tsconfig: "./tsconfig.typedoc.json",
          output: "reference/react",
          sidebar: { label: "React API", collapsed: true },
          typeDoc: typeDocOptions,
        }),
        coreApi({
          entryPoints: [`${dist}/core.d.ts`],
          tsconfig: "./tsconfig.typedoc.json",
          output: "reference/core",
          sidebar: { label: "Core API", collapsed: true },
          typeDoc: typeDocOptions,
        }),
        geoApi({
          entryPoints: [`${dist}/geo.d.ts`],
          tsconfig: "./tsconfig.typedoc.json",
          output: "reference/geo",
          sidebar: { label: "Geo API", collapsed: true },
          typeDoc: typeDocOptions,
        }),
      ],
      logo: { src: "./src/assets/logo.svg" },
      customCss: [
        "@fontsource-variable/geist/index.css",
        "@fontsource-variable/geist-mono/index.css",
        "./src/styles/docs.css",
      ],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/Manoplo/choropleth-kit" },
      ],
      sidebar: [
        { label: "Why choropleth-kit?", slug: "why" },
        {
          label: "Start here",
          items: ["getting-started", "imports", "api-levels"],
        },
        {
          label: "Concepts",
          items: [
            "concepts/how-a-map-is-built",
            "concepts/geography-and-ids",
            "concepts/variants",
            "concepts/classification-and-domain",
            "concepts/palettes",
            "concepts/camera",
            "concepts/drill-down",
            "concepts/theming",
            "concepts/performance",
          ],
        },
        {
          label: "Guides",
          items: [
            "guides/custom-colors",
            "guides/interaction",
            "guides/zoom-and-flights",
            "guides/drill-down",
            "guides/regional-maps",
            "guides/subdivisions",
            "guides/bring-your-own-geography",
            "guides/bubbles-and-markers",
            "guides/labels-and-i18n",
            "guides/theming-and-tailwind",
            "guides/accessibility",
            "guides/ssr-and-frameworks",
            "guides/testing",
          ],
        },
        {
          label: "Recipes",
          items: [
            { label: "Overview", slug: "recipes" },
            "recipes/sales-by-country",
            "recipes/fixed-domain",
            "recipes/growth-diverging",
            "recipes/stores-bubbles",
            "recipes/detail-panel",
            "recipes/flight-tour",
          ],
        },
        { label: "Examples gallery", slug: "gallery" },
        {
          label: "API reference",
          items: [
            { label: "Overview", slug: "reference" },
            "reference/options",
            reactApiGroup,
            coreApiGroup,
            geoApiGroup,
            "reference/styles",
            "reference/errors",
          ],
        },
        { label: "For AI agents", items: ["agents/overview"] },
        {
          label: "Project",
          items: [
            "project/status",
            "project/limitations",
            "project/changelog",
            "project/contributing",
          ],
        },
      ],
    }),
  ],
});
