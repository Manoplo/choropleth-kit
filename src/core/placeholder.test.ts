import { describeLibrary } from "./placeholder";

describe("describeLibrary", () => {
  it("returns the library name", () => {
    expect(describeLibrary()).toBe("choropleth-kit");
  });
});
