"use client";

import { useState, useEffect } from "react";
import {
  getJobStatus,
  JobStatusError,
  type JobStatusResponse,
} from "@/lib/jobApi";

const FINAL_STATUSES: JobStatusResponse["status"][] = ["DONE", "FAILED"];
export const POLL_INTERVAL_MS = 3000;
export const MAX_CONSECUTIVE_POLL_ERRORS = 5;

export type UseJobStatusResult = {
  job: JobStatusResponse | null;
  error: string | null;
  notFound: boolean;
  consecutiveErrorsExceeded: boolean;
};

export function useJobStatus(
  jobId: string | null,
  intervalMs: number = POLL_INTERVAL_MS,
  maxConsecutiveErrors: number = MAX_CONSECUTIVE_POLL_ERRORS,
): UseJobStatusResult {
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [consecutiveErrorsExceeded, setConsecutiveErrorsExceeded] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveErrorCount = 0;

    async function poll() {
      try {
        const data = await getJobStatus(id, controller.signal);
        if (controller.signal.aborted) return;
        consecutiveErrorCount = 0;
        setJob(data);
        setError(null);
        if (FINAL_STATUSES.includes(data.status)) return;
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (err instanceof JobStatusError && err.status === 404) {
          setNotFound(true);
          setError(err.message);
          return;
        }

        consecutiveErrorCount += 1;
        const msg = err instanceof Error ? err.message : "Failed to fetch job status";
        setError(msg);

        if (consecutiveErrorCount >= maxConsecutiveErrors) {
          setConsecutiveErrorsExceeded(true);
          return;
        }
      }
      timer = setTimeout(poll, intervalMs);
    }

    poll();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, intervalMs, maxConsecutiveErrors]);

  return { job, error, notFound, consecutiveErrorsExceeded };
}

