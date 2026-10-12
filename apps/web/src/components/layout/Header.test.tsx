import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";

// next/image renders a plain <img> in test env, but we mock it explicitly for reliability
vi.mock("next/image", () => ({
    default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} {...props} />
    ),
}));

// Import after mocks are registered
import Header from "./Header";

function TestWrapper() {
    const { activeView, resetKey } = useConversion();
    return (
        <div>
            <div data-testid="active-view">{activeView}</div>
            <div data-testid="reset-key">{resetKey}</div>
            <Header />
        </div>
    );
}

describe("Header", () => {
    it("renders the sticky header element", () => {
        const { container } = render(
            <ConversionProvider>
                <Header />
            </ConversionProvider>,
        );
        expect(container.querySelector("header")).toBeInTheDocument();
    });

    it("renders the logo image", () => {
        render(
            <ConversionProvider>
                <Header />
            </ConversionProvider>,
        );
        expect(screen.getByAltText("Logo")).toBeInTheDocument();
    });

    it("renders the New Conversion button", () => {
        render(
            <ConversionProvider>
                <Header />
            </ConversionProvider>,
        );
        expect(
            screen.getByRole("button", { name: /new conversion/i }),
        ).toBeInTheDocument();
    });

    it("calls reset() and resets app state when New Conversion is clicked", async () => {
        const user = userEvent.setup();
        render(
            <ConversionProvider>
                <TestWrapper />
            </ConversionProvider>,
        );

        const initialResetKey = screen.getByTestId("reset-key").textContent;

        await user.click(screen.getByRole("button", { name: /new conversion/i }));

        expect(screen.getByTestId("active-view")).toHaveTextContent("upload");
        expect(screen.getByTestId("reset-key").textContent).not.toBe(initialResetKey);
    });
});
