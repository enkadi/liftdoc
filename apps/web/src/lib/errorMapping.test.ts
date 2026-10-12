import { describe, expect, it } from "vitest";
import { parseUploadError, UploadApiError } from "./errorMapping";

describe("errorMapping", () => {
  describe("UploadApiError", () => {
    it("constructs with title, description, and status", () => {
      const err = new UploadApiError("Test Title", "Test Description", 400);
      expect(err.name).toBe("UploadApiError");
      expect(err.title).toBe("Test Title");
      expect(err.description).toBe("Test Description");
      expect(err.status).toBe(400);
      expect(err.message).toBe("Test Description");
    });
  });

  describe("parseUploadError", () => {
    it("maps 413 to File Exceeds Size Limit", () => {
      const result = parseUploadError(413, null);
      expect(result.title).toBe("File Exceeds Size Limit");
      expect(result.description).toContain("Please upload a PDF smaller than 10MB");
    });

    it("maps FILE_TOO_LARGE code with custom message", () => {
      const result = parseUploadError(413, {
        error: "FILE_TOO_LARGE",
        message: "The uploaded PDF exceeds the maximum allowed size.",
      });
      expect(result.title).toBe("File Exceeds Size Limit");
      expect(result.description).toBe("The uploaded PDF exceeds the maximum allowed size.");
    });

    it("maps ENCRYPTED_PDF to password protection guidance", () => {
      const result = parseUploadError(400, {
        error: "ENCRYPTED_PDF",
        message: "Encrypted PDFs are not supported.",
      });
      expect(result.title).toBe("Password-Protected PDF");
      expect(result.description).toContain("Password-protected or encrypted PDFs cannot be converted");
    });

    it("maps MISSING_FILE to friendly selection prompt", () => {
      const result = parseUploadError(400, {
        error: "MISSING_FILE",
        message: "A PDF file is required.",
      });
      expect(result.title).toBe("No File Selected");
      expect(result.description).toContain("Please select a valid PDF file");
    });

    it("maps INVALID_PDF with empty message to Empty PDF", () => {
      const result = parseUploadError(400, {
        error: "INVALID_PDF",
        message: "The uploaded PDF contains no pages.",
      });
      expect(result.title).toBe("Empty PDF");
      expect(result.description).toBe("The uploaded PDF contains no pages.");
    });

    it("maps INVALID_PDF with non-pdf format message to Unsupported Format", () => {
      const result = parseUploadError(400, {
        error: "INVALID_PDF",
        message: "Only PDF files are supported.",
      });
      expect(result.title).toBe("Unsupported Format");
      expect(result.description).toBe("Only PDF files are supported.");
    });

    it("maps INVALID_PDF with filename error to Missing Filename", () => {
      const result = parseUploadError(400, {
        error: "INVALID_PDF",
        message: "The uploaded file must include a filename.",
      });
      expect(result.title).toBe("Missing Filename");
      expect(result.description).toBe("The uploaded file must include a filename.");
    });

    it("maps STORAGE_ERROR (500) to temporary storage message", () => {
      const result = parseUploadError(500, {
        error: "STORAGE_ERROR",
        message: "The uploaded file could not be stored.",
      });
      expect(result.title).toBe("Temporary Storage Issue");
      expect(result.description).toContain("Could not save the uploaded file on the server");
    });

    it("maps 502/503 gateway errors to server unavailable message", () => {
      const result = parseUploadError(502, null);
      expect(result.title).toBe("Server Temporarily Unavailable");
      expect(result.description).toContain("unreachable");
    });

    it("maps unexpected 500 internal server error", () => {
      const result = parseUploadError(500, null);
      expect(result.title).toBe("Conversion Service Error");
      expect(result.description).toContain("The conversion server encountered an unexpected error");
    });

    it("maps 404 endpoint not found", () => {
      const result = parseUploadError(404, null);
      expect(result.title).toBe("Service Not Found");
      expect(result.description).toContain("conversion endpoint could not be found");
    });
  });
});
