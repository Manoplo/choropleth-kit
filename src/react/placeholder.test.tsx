import { render, screen } from "@testing-library/react";
import { Placeholder } from "./placeholder";

describe("Placeholder", () => {
  it("renders the library name", () => {
    render(<Placeholder />);
    expect(screen.getByText("Hello from choropleth-kit")).toBeInTheDocument();
  });
});
