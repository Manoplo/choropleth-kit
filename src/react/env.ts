// `process` no existe en un navegador sin bundler; los bundlers lo sustituyen por una constante.
export const isProduction = (): boolean =>
  typeof process !== "undefined" && process.env["NODE_ENV"] === "production";

/**
 * «Reducir movimiento» del sistema. Sin `matchMedia` (SSR, jsdom) se asume que no. Se lee en el
 * momento de mover la cámara, no al renderizar: el usuario puede cambiarlo con la página abierta.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
