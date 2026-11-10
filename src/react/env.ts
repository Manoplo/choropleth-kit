// Bundlers (Vite, webpack, esbuild, Rollup) statically replace the dotted expression `process.env.NODE_ENV`
// but do not define `process` itself in the browser, so it must be read exactly like this (no `typeof process`
// guard, no bracket access) for the development diagnostics to be folded away in a consumer's production build.
// Without a bundler and without `process` the read throws: behave as development.
export const isProduction = (): boolean => {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    return false;
  }
};

/**
 * The system's "reduce motion". Without `matchMedia` (SSR, jsdom) it is assumed not. It is read at the
 * moment of moving the camera, not while rendering: the user can change it with the page open.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
