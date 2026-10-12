import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout, { metadata } from "./layout";

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt?: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt || ""} {...props} />
  ),
}));

vi.mock("next/font/google", () => ({
  DM_Serif_Display: () => ({ variable: "--font-heading-serif" }),
  Inter_Tight: () => ({ variable: "--font-body" }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

describe("RootLayout", () => {
  it("exports valid metadata", () => {
    expect(metadata.title).toBe("DocLift");
    expect(metadata.description).toBeDefined();
  });

  it("renders children inside layout", () => {
    render(
      <RootLayout>
        <div data-testid="test-child">Child Content</div>
      </RootLayout>
    );
    expect(screen.getByTestId("test-child")).toBeInTheDocument();
  });
});
