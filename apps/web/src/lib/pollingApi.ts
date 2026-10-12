import type { JobStatusResponse } from "./jobApi";

export type {
  BackendJobStatus,
  JobPhase,
  JobOutputResponse,
  JobMetricsResponse,
  JobStatusResponse,
} from "./jobApi";

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
