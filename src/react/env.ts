// `process` does not exist in a browser without a bundler; bundlers replace it with a constant.
export const isProduction = (): boolean =>
  typeof process !== "undefined" && process.env["NODE_ENV"] === "production";

/**
 * The system's "reduce motion". Without `matchMedia` (SSR, jsdom) it is assumed not. It is read at the
 * moment of moving the camera, not while rendering: the user can change it with the page open.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
