import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DropZone from "./DropZone";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";

function getFileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function makeFile(
  content: BlobPart,
  name: string,
  type: string,
  sizeOverride?: number,
) {
  const file = new File([content], name, { type });
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, "size", { value: sizeOverride });
  }
  return file;
}

describe("DropZone", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("has an accessible label for the drop area", () => {
    const { container } = render(<DropZone />);
    expect(container.querySelector('[aria-label="Upload PDF file"]')).toBeInTheDocument();
  });

  it("accepts a valid PDF file and calls onDrop", async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile("%PDF-1.4\nrest of file", "report.pdf", "application/pdf");
    await user.upload(input, file);

    expect(onDrop).toHaveBeenCalledWith(file);
    expect(toast.success).toHaveBeenCalledWith(
      "File selected",
      expect.objectContaining({ description: expect.stringContaining("report.pdf") }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("accepts a valid PDF file when file.type is an empty string", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile("%PDF-1.4\nrest of file", "report.pdf", "");
    await user.upload(input, file);

    expect(onDrop).toHaveBeenCalledWith(file);
    expect(toast.success).toHaveBeenCalledWith(
      "File selected",
      expect.objectContaining({ description: expect.stringContaining("report.pdf") }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rejects a file with a non-pdf extension", async () => {
    // The real drop handler (dragging a file onto the zone) isn't filtered
    // by the input's `accept` attribute the way a native file dialog is, so
    // disable user-event's accept filtering to exercise that same path via
    // the input's change handler.
    const user = userEvent.setup({ applyAccept: false });
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile("hello", "notes.txt", "text/plain");
    await user.upload(input, file);

    expect(onDrop).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Invalid file",
      expect.objectContaining({ description: "Only PDF files are allowed." }),
    );
  });

  it("rejects a .pdf file whose mime type is not application/pdf", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile("%PDF-1.4", "sneaky.pdf", "image/png");
    await user.upload(input, file);

    expect(onDrop).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Invalid file",
      expect.objectContaining({ description: "Only PDF files are allowed." }),
    );
  });

  it("rejects an empty file", async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile("", "empty.pdf", "application/pdf", 0);
    await user.upload(input, file);

    expect(onDrop).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Empty file",
      expect.objectContaining({ description: "The selected PDF file is empty." }),
    );
  });

  it("rejects a file over the 10 MB limit", async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile(
      "%PDF-1.4",
      "huge.pdf",
      "application/pdf",
      11 * 1024 * 1024,
    );
    await user.upload(input, file);

    expect(onDrop).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "File too large",
      expect.objectContaining({ description: "File size exceeds the 10 MB limit." }),
    );
  });

  it("rejects a file whose content is not a real PDF (bad header)", async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile("not a pdf at all", "fake.pdf", "application/pdf");
    await user.upload(input, file);

    expect(onDrop).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Invalid PDF file",
      expect.objectContaining({
        description: "File content is not a valid PDF document.",
      }),
    );
  });

  it("rejects an encrypted PDF", async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    const { container } = render(<DropZone onDrop={onDrop} />);
    const input = getFileInput(container);

    const file = makeFile(
      "%PDF-1.4\n<< /Encrypt 5 0 R >>",
      "locked.pdf",
      "application/pdf",
    );
    await user.upload(input, file);

    expect(onDrop).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Encrypted PDF",
      expect.objectContaining({
        description: "Password-protected or encrypted PDF files are not supported.",
      }),
    );
  });
});
