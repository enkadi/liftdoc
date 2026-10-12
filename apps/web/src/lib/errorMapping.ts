export interface ApiErrorResponse {
  error?: string;
  message?: string;
}

export interface ParsedAppError {
  title: string;
  description: string;
}

export class UploadApiError extends Error {
  public readonly title: string;
  public readonly description: string;
  public readonly status?: number;

  constructor(title: string, description: string, status?: number) {
    super(description || title);
    this.name = "UploadApiError";
    this.title = title;
    this.description = description;
    this.status = status;
  }
}

export function parseUploadError(
  status: number,
  errorData: ApiErrorResponse | null,
): ParsedAppError {
  const rawCode = (errorData?.error ?? "").toUpperCase();
  const rawMsg = errorData?.message?.trim() || "";

  if (status === 413 || rawCode === "FILE_TOO_LARGE") {
    return {
      title: "File Exceeds Size Limit",
      description: rawMsg || "File is too large. Please upload a PDF smaller than 10MB.",
    };
  }

  if (rawCode === "ENCRYPTED_PDF" || /encrypted|password/i.test(rawMsg)) {
    return {
      title: "Password-Protected PDF",
      description: "Password-protected or encrypted PDFs cannot be converted. Please unlock the file and try again.",
    };
  }

  if (rawCode === "MISSING_FILE" || /missing|required/i.test(rawMsg)) {
    return {
      title: "No File Selected",
      description: "Please select a valid PDF file to begin conversion.",
    };
  }

  if (rawCode === "INVALID_PDF") {
    if (/empty|no pages/i.test(rawMsg)) {
      return {
        title: "Empty PDF",
        description: rawMsg || "The uploaded PDF contains no pages or content.",
      };
    }
    if (/only pdf/i.test(rawMsg)) {
      return {
        title: "Unsupported Format",
        description: rawMsg || "Only PDF files are supported.",
      };
    }
    if (/filename/i.test(rawMsg)) {
      return {
        title: "Missing Filename",
        description: rawMsg || "The uploaded file must have a valid filename.",
      };
    }
    return {
      title: "Invalid PDF File",
      description: rawMsg || "The uploaded file is not a valid PDF document.",
    };
  }

  if (rawCode === "STORAGE_ERROR") {
    return {
      title: "Temporary Storage Issue",
      description: "Could not save the uploaded file on the server. Please try again in a moment.",
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      title: "Server Temporarily Unavailable",
      description: "The conversion server is currently busy or unreachable. Please try again shortly.",
    };
  }

  if (status >= 500) {
    return {
      title: "Conversion Service Error",
      description: rawMsg || "The conversion server encountered an unexpected error. Please try again shortly.",
    };
  }

  if (status === 404) {
    return {
      title: "Service Not Found",
      description: "The conversion endpoint could not be found. Please refresh and try again.",
    };
  }

  return {
    title: "Upload Failed",
    description: rawMsg || "Could not start conversion. Please verify your document and try again.",
  };
}
