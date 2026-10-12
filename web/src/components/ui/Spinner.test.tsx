import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders as an accessible loading status indicator", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status", { name: "Loading" });

    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass("animate-spin");
  });

  it("merges a custom className with the defaults", () => {
    render(<Spinner className="text-red-500" />);
    const spinner = screen.getByRole("status", { name: "Loading" });

    expect(spinner).toHaveClass("text-red-500");
    expect(spinner).toHaveClass("animate-spin");
  });
});
