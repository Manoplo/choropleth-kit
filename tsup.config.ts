import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["esm"],
  dts: true,
  sourcemap: true,
  external: ["react", "react-dom"],
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/react/index.ts",
      core: "src/core/index.ts",
      styles: "src/react/styles.css",
    },
  },
  {
    // The bundled geodata keeps the notice its licenses ask for, at the top of the file.
    ...shared,
    entry: { geo: "src/geo/index.ts" },
    banner: {
      js: [
        "/*!",
        " * choropleth-kit/geo: geometry derived from world-atlas (ISC License, Copyright (c) Mike Bostock),",
        " * which is based on Natural Earth (public domain). ISO 3166 table generated with",
        ' * i18n-iso-countries (MIT). See "Data and third-party notices" in the README.',
        " */",
      ].join("\n"),
    },
  },
]);
