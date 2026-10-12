import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Accordion, { AccordionItem } from "./Accordion";

describe("Accordion and AccordionItem", () => {
  it("renders accordion header and is collapsed by default", () => {
    render(
      <Accordion>
        <AccordionItem title="Click to expand">
          <p>Hidden content inside accordion</p>
        </AccordionItem>
      </Accordion>
    );

    const trigger = screen.getByRole("button", { name: /click to expand/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panel = screen.getByRole("region");
    expect(panel).toHaveClass("grid-rows-[0fr]", "opacity-0");
  });

  it("toggles open and closed when clicked", async () => {
    const user = userEvent.setup();

    render(
      <Accordion>
        <AccordionItem title="Toggle Me">
          <p>Visible when expanded</p>
        </AccordionItem>
      </Accordion>
    );

    const trigger = screen.getByRole("button", { name: /toggle me/i });
    const panel = screen.getByRole("region");

    // Click to open
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveClass("grid-rows-[1fr]", "opacity-100");
    expect(screen.getByText("Visible when expanded")).toBeInTheDocument();

    // Click to close
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveClass("grid-rows-[0fr]", "opacity-0");
  });

  it("renders open when defaultOpen is true", () => {
    render(
      <Accordion>
        <AccordionItem title="Default Open Title" defaultOpen={true}>
          <p>Already open</p>
        </AccordionItem>
      </Accordion>
    );

    const trigger = screen.getByRole("button", { name: /default open title/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Already open")).toBeInTheDocument();
  });
});
