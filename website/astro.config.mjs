import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    react(),
    starlight({
      title: "choropleth-kit",
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
        { label: "Recipes", slug: "recipes" },
        { label: "Examples gallery", slug: "gallery" },
        {
          label: "API reference",
          items: [
            "reference/react",
            "reference/core",
            "reference/geo",
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
