export type JobStatus = "QUEUED" | "PROCESSING" | "DONE" | "FAILED";

export type JobPhase =
  | "QUEUED"
  | "LOADING_SOURCE"
  | "EXTRACTING_CONTENT"
  | "RECOVERING_STRUCTURE"
  | "GENERATING_DOCUMENT"
  | "SAVING_OUTPUT"
  | "COMPLETED";

export type JobOutput = {
  filename: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type JobMetrics = {
  sourceWordCount: number | null;
  outputWordCount: number | null;
};

export type JobStatusResponse = {
  jobId: string;
  status: JobStatus;
  sourceFilename: string | null;
  pageCount: number | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  phase: JobPhase | null;
  progressPercent: number | null;
  durationSeconds: number | null;
  estimatedRemainingSeconds: number | null;
  estimatedTotalSeconds: number | null;
  currentPhaseEstimatedRemainingSeconds: number | null;
  output: JobOutput | null;
  metrics: JobMetrics | null;
};

export class JobStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "JobStatusError";
  }
}

export async function getJobStatus(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobStatusResponse> {
  const response = await fetch(`/api/v1/jobs/${jobId}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new JobStatusError(
      `HTTP ${response.status} - ${response.statusText}`,
      response.status,
    );
  }
  return response.json();
}
