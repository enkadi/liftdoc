import {
  ApiErrorResponse,
  UploadApiError,
  parseUploadError,
} from "./errorMapping";

export type { ApiErrorResponse };
export { UploadApiError, parseUploadError };

export interface UploadApiResponse {
  jobId: string;
}

async function extractErrorData(response: Response): Promise<ApiErrorResponse | null> {
  try {
    const errorData: ApiErrorResponse = await response.json();
    return errorData;
  } catch {
    return null;
  }
}

export async function uploadFile(
  file: File,
  signal?: AbortSignal,
): Promise<UploadApiResponse> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`/api/v1/uploads`, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorData = await extractErrorData(response);
      const parsed = parseUploadError(response.status, errorData);
      throw new UploadApiError(
        parsed.title,
        parsed.description,
        response.status,
      );
    }

    const data: UploadApiResponse = await response.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof UploadApiError) {
      throw err;
    }
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw err;
      }
      if (err.message === "Failed to fetch" || err.name === "TypeError") {
        throw new UploadApiError(
          "Connection Failed",
          "Could not reach the conversion service. Please check your internet connection.",
        );
      }
      throw err;
    }
    throw new UploadApiError(
      "Upload Failed",
      "An unexpected error occurred while connecting to the conversion service.",
    );
  }
}