import "@testing-library/jest-dom/vitest";

// El diagnóstico (`console.warn`) se dispara con los datos de prueba que tienen ids huérfanos a
// propósito. Se silencia para que la salida de los tests sea legible; los tests del diagnóstico
// vuelven a espiarlo y comprueban el mensaje.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});
