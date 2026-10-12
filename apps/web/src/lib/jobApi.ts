import type { ApiErrorResponse } from "./errorMapping";

export type BackendJobStatus = "QUEUED" | "PROCESSING" | "DONE" | "FAILED";

export type JobPhase =
  | "QUEUED"
  | "LOADING_SOURCE"
  | "EXTRACTING_CONTENT"
  | "RECOVERING_STRUCTURE"
  | "GENERATING_DOCUMENT"
  | "SAVING_OUTPUT"
  | "COMPLETED";

export interface JobOutputResponse {
  filename: string;
  sizeBytes: number | null;
  downloadUrl: string;
}

export interface JobMetricsResponse {
  sourceWordCount: number | null;
  outputWordCount: number | null;
  orderedListsDetected?: number | null;
  unorderedListsDetected?: number | null;
  orderedListsReconstructed?: number | null;
  unorderedListsReconstructed?: number | null;
  headingsDetected?: number | null;
  h1HeadingCount?: number | null;
  h2HeadingCount?: number | null;
  h3HeadingCount?: number | null;
  tablesDetected?: number | null;
  imagesDetected?: number | null;
  multiColumnPageCount?: number | null;
  outputPageCount?: number | null;
}

export interface JobStatusResponse {
  jobId: string;
  status: BackendJobStatus;
  sourceFilename: string | null;
  pageCount: number | null;
  createdAt: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  phase?: JobPhase | null;
  progressPercent?: number | null;
  durationSeconds?: number | null;
  estimatedRemainingSeconds?: number | null;
  estimatedTotalSeconds?: number | null;
  currentPhaseEstimatedRemainingSeconds?: number | null;
  output?: JobOutputResponse | null;
  metrics?: JobMetricsResponse | null;
}

export type { ApiErrorResponse };

async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const errorData: ApiErrorResponse = await response.json();
    return errorData.message || null;
  } catch {
    return null;
  }
}

/**
 * Fetches the current conversion status for a given job ID.
 */
export async function getJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<JobStatusResponse> {
  try {
    const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      signal,
    });

    if (!response.ok) {
      const backendMessage = await extractErrorMessage(response);

      if (response.status === 404) {
        throw new Error(backendMessage ?? "Job not found.");
      }

      throw new Error(
        backendMessage ?? `Failed to fetch job status (status code ${response.status}).`
      );
    }

    const data: JobStatusResponse = await response.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("An unexpected error occurred while fetching job status.");
  }
}