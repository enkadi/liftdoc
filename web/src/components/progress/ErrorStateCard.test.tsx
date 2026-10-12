import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorStateCard from "./ErrorStateCard";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ConversionProvider>{ui}</ConversionProvider>);
}

describe("ErrorStateCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the error heading, dynamic file name, recommended fixes, and action buttons", async () => {
    const user = userEvent.setup();

    function ViewProbe() {
      const { activeView, setActiveView } = useConversion();
      return (
        <div>
          <button onClick={() => setActiveView("progress")}>set progress</button>
          <p>view:{activeView}</p>
          <ErrorStateCard />
        </div>
      );
    }

    renderWithProvider(<ViewProbe />);

    expect(
      screen.getByRole("heading", { name: /conversion couldn't be completed/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /we couldn't convert document\.pdf/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Try uploading the PDF again\. Temporary processing issues can occasionally interrupt a conversion\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Try converting a different PDF\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Re-save or Re-download the PDF and try uploading the new copy\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Open the PDF in a viewer and save it as a new PDF and try converting that copy\./i),
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /retry conversion/i });
    const tryAnotherBtn = screen.getByRole("button", { name: /try another file/i });
    expect(retryBtn).toBeInTheDocument();
    expect(tryAnotherBtn).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "set progress" }));
    expect(screen.getByText("view:progress")).toBeInTheDocument();

    await user.click(retryBtn);
    expect(screen.getByText("view:upload")).toBeInTheDocument();
  });

  it("renders custom error message and triggers custom reset handler when provided", async () => {
    const user = userEvent.setup();
    const mockReset = vi.fn();
    const mockTryAnother = vi.fn();

    renderWithProvider(
      <ErrorStateCard
        error="Custom error message occurred"
        reset={mockReset}
        onTryAnother={mockTryAnother}
      />
    );

    expect(screen.getByText("Custom error message occurred")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /retry conversion/i });
    await user.click(retryBtn);
    expect(mockReset).toHaveBeenCalledTimes(1);

    const tryAnotherBtn = screen.getByRole("button", { name: /try another file/i });
    await user.click(tryAnotherBtn);
    expect(mockTryAnother).toHaveBeenCalledTimes(1);
  });
});