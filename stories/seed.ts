/** Número determinista a partir de un id de texto ("ES"): para datos SINTÉTICOS reproducibles. */
export const seed = (id: string): number =>
  [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 100003, 7);
