import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/react/index.ts",
    core: "src/core/index.ts",
    styles: "src/react/styles.css",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
});
