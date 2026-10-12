import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AbandonSessionModal, { getAbandonModalContent } from "./AbandonSessionModal";
import { ConversionSession } from "@/lib/conversionSession";
import { ConversionProvider, useConversion } from "@/context/ConversionContext";

describe("getAbandonModalContent helper", () => {
    it("returns ongoing conversion text for processing or queued status", () => {
        const session: ConversionSession = {
            jobId: "j1",
            fileName: "report.pdf",
            status: "processing",
            updatedAt: Date.now(),
        };
        const content = getAbandonModalContent(session);
        expect(content.title).toBe("Conversion In Progress");
        expect(content.description).toContain('active conversion in progress for "report.pdf"');
        expect(content.confirmText).toBe("Abandon & Restart");
    });

    it("returns unsaved converted file text for done status", () => {
        const session: ConversionSession = {
            jobId: "j2",
            fileName: "invoice.pdf",
            status: "done",
            updatedAt: Date.now(),
        };
        const content = getAbandonModalContent(session);
        expect(content.title).toBe("Converted File Available");
        expect(content.description).toContain('converted file ("invoice.pdf") that you haven\'t downloaded yet');
        expect(content.confirmText).toBe("Abandon & Start New");
    });

    it("returns failed session text for failed status", () => {
        const session: ConversionSession = {
            jobId: "j3",
            fileName: "data.pdf",
            status: "failed",
            updatedAt: Date.now(),
        };
        const content = getAbandonModalContent(session);
        expect(content.title).toBe("Previous Conversion Failed");
        expect(content.description).toContain('conversion for "data.pdf" failed');
        expect(content.confirmText).toBe("Restart Conversion");
    });
});

describe("AbandonSessionModal component", () => {
    const mockSession: ConversionSession = {
        jobId: "j1",
        fileName: "test.pdf",
        status: "processing",
        updatedAt: Date.now(),
    };

    it("does not render when isOpen is false or session is null", () => {
        const { rerender } = render(
            <AbandonSessionModal
                isOpen={false}
                onClose={() => {}}
                onConfirm={() => {}}
                session={mockSession}
            />
        );
        expect(screen.queryByTestId("abandon-session-modal")).not.toBeInTheDocument();

        rerender(
            <AbandonSessionModal
                isOpen={true}
                onClose={() => {}}
                onConfirm={() => {}}
                session={null}
            />
        );
        expect(screen.queryByTestId("abandon-session-modal")).not.toBeInTheDocument();
    });

    it("renders modal content when open with an active session", () => {
        render(
            <AbandonSessionModal
                isOpen={true}
                onClose={() => {}}
                onConfirm={() => {}}
                session={mockSession}
            />
        );

        expect(screen.getByTestId("abandon-session-modal")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Conversion In Progress" })).toBeInTheDocument();
        expect(screen.getByText(/active conversion in progress for "test.pdf"/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Keep Session" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Abandon & Restart" })).toBeInTheDocument();
    });

    it("calls onClose when Keep Session or backdrop or close icon is clicked", async () => {
        const user = userEvent.setup();
        const handleClose = vi.fn();

        render(
            <AbandonSessionModal
                isOpen={true}
                onClose={handleClose}
                onConfirm={() => {}}
                session={mockSession}
            />
        );

        await user.click(screen.getByRole("button", { name: "Keep Session" }));
        expect(handleClose).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("button", { name: "Close modal" }));
        expect(handleClose).toHaveBeenCalledTimes(2);

        await user.click(screen.getByTestId("abandon-session-modal-backdrop"));
        expect(handleClose).toHaveBeenCalledTimes(3);
    });

    it("calls onConfirm when confirm button is clicked", async () => {
        const user = userEvent.setup();
        const handleConfirm = vi.fn();

        render(
            <AbandonSessionModal
                isOpen={true}
                onClose={() => {}}
                onConfirm={handleConfirm}
                session={mockSession}
            />
        );

        await user.click(screen.getByRole("button", { name: "Abandon & Restart" }));
        expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it("traps focus within the modal when Tab or Shift+Tab is pressed", async () => {
        const user = userEvent.setup();

        render(
            <AbandonSessionModal
                isOpen={true}
                onClose={() => {}}
                onConfirm={() => {}}
                session={mockSession}
            />
        );

        await new Promise((r) => setTimeout(r, 10));

        const closeBtn = screen.getByRole("button", { name: "Close modal" });
        const keepBtn = screen.getByRole("button", { name: "Keep Session" });
        const confirmBtn = screen.getByRole("button", { name: "Abandon & Restart" });

        expect(document.activeElement).toBe(closeBtn);

        await user.tab();
        expect(document.activeElement).toBe(keepBtn);

        await user.tab();
        expect(document.activeElement).toBe(confirmBtn);

        await user.tab();
        expect(document.activeElement).toBe(closeBtn);

        await user.tab({ shift: true });
        expect(document.activeElement).toBe(confirmBtn);
    });
});

describe("ConversionContext integration with requestReset and AbandonSessionModal", () => {
    it("opens abandon session modal via requestReset when session exists and resets on confirmation", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ jobId: 101 }),
        } as unknown as Response);

        const user = userEvent.setup();

        function ConsumerComponent() {
            const { requestReset, startConversion, activeView } = useConversion();
            return (
                <div>
                    <button
                        onClick={() =>
                            startConversion(
                                new File(["content"], "sample.pdf", { type: "application/pdf" })
                            )
                        }
                    >
                        Start Conversion
                    </button>
                    <button onClick={requestReset}>Request Reset</button>
                    <p data-testid="active-view">{activeView}</p>
                </div>
            );
        }

        render(
            <ConversionProvider>
                <ConsumerComponent />
            </ConversionProvider>
        );

        // Start conversion
        await user.click(screen.getByRole("button", { name: "Start Conversion" }));
        expect(screen.getByTestId("active-view")).toHaveTextContent("progress");

        // Trigger requestReset -> opens modal
        await user.click(screen.getByRole("button", { name: "Request Reset" }));
        expect(screen.getByTestId("abandon-session-modal")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Conversion In Progress" })).toBeInTheDocument();

        // Confirm reset
        await user.click(screen.getByRole("button", { name: "Abandon & Restart" }));
        expect(screen.getByTestId("active-view")).toHaveTextContent("upload");
        expect(screen.queryByTestId("abandon-session-modal")).not.toBeInTheDocument();
    });

    it("retains file when confirming abandon for a failed session", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ jobId: 102 }),
        } as unknown as Response);

        const user = userEvent.setup();

        function ConsumerComponent() {
            const { requestReset, setFile, startConversion, updateStatus, activeView, file } = useConversion();
            return (
                <div>
                    <button
                        onClick={async () => {
                            const f = new File(["content"], "failed.pdf", { type: "application/pdf" });
                            setFile(f);
                            await startConversion(f);
                            updateStatus("failed");
                        }}
                    >
                        Fail Conversion
                    </button>
                    <button onClick={requestReset}>Request Reset</button>
                    <p data-testid="active-view">{activeView}</p>
                    <p data-testid="file-name">{file?.name || "none"}</p>
                </div>
            );
        }

        render(
            <ConversionProvider>
                <ConsumerComponent />
            </ConversionProvider>
        );

        await user.click(screen.getByRole("button", { name: "Fail Conversion" }));
        expect(screen.getByTestId("active-view")).toHaveTextContent("progress");

        await user.click(screen.getByRole("button", { name: "Request Reset" }));

        expect(screen.getByRole("heading", { name: "Previous Conversion Failed" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Restart Conversion" }));

        expect(screen.getByTestId("active-view")).toHaveTextContent("upload");
        expect(screen.getByTestId("file-name")).toHaveTextContent("failed.pdf");
    });
});
