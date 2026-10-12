import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Progress } from "./Progress";

describe("Progress", () => {
  it("reflects the given value through the indicator's transform", () => {
    const { container } = render(<Progress value={40} />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]');

    expect(indicator).toHaveStyle({ transform: "translateX(-60%)" });
  });

  it("treats an undefined value as 0", () => {
    const { container } = render(<Progress />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]');

    expect(indicator).toHaveStyle({ transform: "translateX(-100%)" });
  });

  it("fully reveals the indicator at 100", () => {
    const { container } = render(<Progress value={100} />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]');

    expect(indicator).toHaveStyle({ transform: "translateX(-0%)" });
  });
});
