export interface UploadApiResponse {
  jobId: string;
}

export interface ApiErrorResponse {
  error?: string;
  message?: string;
}

async function extractMessage(response: Response): Promise<string | null> {
  try {
    const errorData: ApiErrorResponse = await response.json();
    return errorData.message || null;
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
      const backendMessage = await extractMessage(response);

      if (response.status === 413) {
        throw new Error(
          backendMessage ??
            "File is too large. Please upload a PDF smaller than 10MB.",
        );
      }

      throw new Error(
        backendMessage ?? `Upload failed with status code ${response.status}.`,
      );
    }

    const data: UploadApiResponse = await response.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(
      "An unexpected error occurred while connecting to the conversion service.",
    );
  }
}