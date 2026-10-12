import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HeaderBar from "./HeaderBar";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ConversionProvider>{ui}</ConversionProvider>);
}

describe("HeaderBar", () => {
  it("shows placeholder copy when no file is selected", () => {
    renderWithProvider(<HeaderBar file={null} timeElapsed={0} timeRemaining={0} />);

    expect(screen.getAllByText("Untitled document").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No file selected").length).toBeGreaterThan(0);
    expect(screen.getByText("Untitled document.docx")).toBeInTheDocument();
  });

  it("derives source and target file info from the given file", () => {
    const file = new File(["%PDF-1.4"], "quarterly-report.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "size", { value: 2.5 * 1024 * 1024 });

    renderWithProvider(<HeaderBar file={file} timeElapsed={0} timeRemaining={0} />);

    expect(screen.getByText("quarterly-report.pdf")).toBeInTheDocument();
    expect(screen.getByText("quarterly-report.docx")).toBeInTheDocument();
    expect(screen.getByText("PDF Document • 2.5 MB")).toBeInTheDocument();
    expect(screen.getByText("Word Document (.docx)")).toBeInTheDocument();
  });

  it("formats elapsed and remaining time as mm:ss", () => {
    renderWithProvider(
      <HeaderBar file={null} timeElapsed={65} timeRemaining={90} />,
    );

    expect(screen.getByText("1:05 elapsed")).toBeInTheDocument();
    expect(screen.getByText("~1:30 remaining")).toBeInTheDocument();
  });

  it("rounds fractional seconds up", () => {
    renderWithProvider(
      <HeaderBar file={null} timeElapsed={0} timeRemaining={12.2} />,
    );

    expect(screen.getByText("~0:13 remaining")).toBeInTheDocument();
  });

  it("shows a calculating state while there is no estimate yet", () => {
    renderWithProvider(
      <HeaderBar file={null} timeElapsed={5} timeRemaining={null} />,
    );

    expect(screen.getByText("Calculating...")).toBeInTheDocument();
  });

  it("disables the target file button until conversion is done", async () => {
    const user = userEvent.setup();

    function ActiveViewProbe() {
      const { activeView, setSession } = useConversion();
      return (
        <div>
          <p>active:{activeView}</p>
          <button
            onClick={() =>
              setSession({
                jobId: "j1",
                fileName: "doc.pdf",
                status: "done",
                updatedAt: Date.now(),
              })
            }
          >
            mark done
          </button>
        </div>
      );
    }

    renderWithProvider(
      <>
        <HeaderBar file={null} timeElapsed={0} timeRemaining={0} />
        <ActiveViewProbe />
      </>,
    );

    const button = screen.getByRole("button", { name: "Open Untitled document.docx" });
    expect(button).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "mark done" }));

    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(screen.getByText("active:result")).toBeInTheDocument();
  });
});
