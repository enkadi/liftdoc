import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DownloadButton from "./DownloadButton";
import { downloadFile } from "@/lib/downloadApi";
import { toast } from "sonner";

vi.mock("@/lib/downloadApi", () => ({
  downloadFile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const mockedDownloadFile = vi.mocked(downloadFile);

describe("DownloadButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an enabled Download button with an icon", () => {
    const { container } = render(<DownloadButton jobId="job-1" />);

    const button = screen.getByRole("button", { name: /download/i });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("Download");
    expect(container.querySelector("svg.lucide-download")).toBeInTheDocument();
  });

  it("calls downloadFile with the job id when clicked", async () => {
    mockedDownloadFile.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DownloadButton jobId="job-42" />);

    await user.click(screen.getByRole("button", { name: /download/i }));

    expect(mockedDownloadFile).toHaveBeenCalledTimes(1);
    expect(mockedDownloadFile).toHaveBeenCalledWith("job-42");
  });

  it("shows a disabled downloading state while the download is in progress", async () => {
    let resolveDownload!: () => void;
    mockedDownloadFile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<DownloadButton jobId="job-1" />);

    await user.click(screen.getByRole("button", { name: /download/i }));

    const button = screen.getByRole("button", { name: /downloading/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Downloading...");

    resolveDownload();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^download$/i })).toBeEnabled();
    });
  });

  it("returns to idle after a successful download without showing an error", async () => {
    mockedDownloadFile.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DownloadButton jobId="job-1" />);

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^download$/i })).toBeEnabled();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows an error toast and re-enables the button when the download fails", async () => {
    const error = new Error("HTTP 500 - Internal Server Error");
    mockedDownloadFile.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<DownloadButton jobId="job-1" />);

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Download failed", {
        description: "Downloading your file was unsuccessful. Try again.",
      });
    });
    expect(consoleSpy).toHaveBeenCalledWith("Download failed:", error);
    expect(screen.getByRole("button", { name: /^download$/i })).toBeEnabled();

    consoleSpy.mockRestore();
  });

  it("allows retrying after a failed download", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedDownloadFile
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<DownloadButton jobId="job-1" />);

    await user.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(mockedDownloadFile).toHaveBeenCalledTimes(2));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
