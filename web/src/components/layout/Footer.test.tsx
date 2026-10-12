import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "./Footer";

describe("Footer", () => {
    it("renders the footer element", () => {
        const { container } = render(<Footer />);
        expect(container.querySelector("footer")).toBeInTheDocument();
    });

    it("displays the output format notice", () => {
        render(<Footer />);
        expect(
            screen.getByText("Output strictly Microsoft Word (.docx)"),
        ).toBeInTheDocument();
    });
});
