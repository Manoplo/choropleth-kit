import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    react(),
    starlight({
      title: "choropleth-kit",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/Manoplo/choropleth-kit" },
      ],
      sidebar: [{ label: "Start here", items: [{ label: "Getting started", slug: "getting-started" }] }],
    }),
  ],
});
