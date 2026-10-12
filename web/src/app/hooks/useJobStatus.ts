"use client";

import { useState, useEffect } from "react";
import {
  getJobStatus,
  JobStatusError,
  type JobStatusResponse,
} from "@/lib/pollingApi";

const FINAL_STATUSES: JobStatusResponse["status"][] = ["DONE", "FAILED"];
export const POLL_INTERVAL_MS = 5000;

export type UseJobStatusResult = {
  job: JobStatusResponse | null;
  error: string | null;
  notFound: boolean;
};

export function useJobStatus(
  jobId: string | null,
  intervalMs: number = POLL_INTERVAL_MS,
): UseJobStatusResult {
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const data = await getJobStatus(id, controller.signal);
        if (controller.signal.aborted) return;
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
      
        setError(err instanceof Error ? err.message : "Failed to fetch job status");
      }
      timer = setTimeout(poll, intervalMs);
    }

    poll();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, intervalMs]);

  return { job, error, notFound };
}
