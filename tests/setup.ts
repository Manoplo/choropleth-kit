import "@testing-library/jest-dom/vitest";

// The diagnostic (`console.warn`) fires with test data that has orphan ids on purpose. It is silenced
// so the test output is readable; the diagnostics tests spy on it again and check the message.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});
