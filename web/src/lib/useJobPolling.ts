import { useEffect, useRef } from "react";
import { getJobStatus, BackendJobStatus, JobStatusResponse } from "./jobApi";

export interface UseJobPollingOptions {
  jobId: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
  maxConsecutiveErrors?: number;
  onStatusChange?: (status: BackendJobStatus, data: JobStatusResponse) => void;
  onComplete?: (data: JobStatusResponse) => void;
  onFailed?: (error?: Error) => void;
  onError?: (error: Error) => void;
}

/**
 * Custom hook to poll the backend job status at regular intervals.
 * Automatically stops polling when job status reaches 'DONE' or 'FAILED',
 * or when disabled / unmounted.
 */
export function useJobPolling({
  jobId,
  enabled = true,
  intervalMs = 5000,
  maxConsecutiveErrors = 5,
  onStatusChange,
  onComplete,
  onFailed,
  onError,
}: UseJobPollingOptions) {
  const consecutiveErrorsRef = useRef(0);
  const callbackRefs = useRef({ onStatusChange, onComplete, onFailed, onError });

  useEffect(() => {
    callbackRefs.current = { onStatusChange, onComplete, onFailed, onError };
  });

  useEffect(() => {
    if (!enabled || !jobId) return;

    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;
    consecutiveErrorsRef.current = 0;

    const poll = async () => {
      abortController = new AbortController();

      try {
        const response = await getJobStatus(jobId, abortController.signal);
        if (!isMounted) return;

        consecutiveErrorsRef.current = 0;
        callbackRefs.current.onStatusChange?.(response.status, response);

        if (response.status === "DONE") {
          callbackRefs.current.onComplete?.(response);
          return;
        }

        if (response.status === "FAILED") {
          callbackRefs.current.onFailed?.(new Error("Job conversion failed on backend."));
          return;
        }

        if (isMounted) {
          timerId = setTimeout(poll, intervalMs);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        if (err instanceof Error && err.name === "AbortError") return;

        consecutiveErrorsRef.current += 1;
        const error = err instanceof Error ? err : new Error("Failed to poll job status.");
        callbackRefs.current.onError?.(error);

        if (consecutiveErrorsRef.current >= maxConsecutiveErrors) {
          callbackRefs.current.onFailed?.(
            new Error(`Job polling failed after ${maxConsecutiveErrors} consecutive attempts.`)
          );
          return;
        }

        if (isMounted) {
          timerId = setTimeout(poll, intervalMs);
        }
      }
    };

    poll();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      abortController?.abort();
    };
  }, [jobId, enabled, intervalMs, maxConsecutiveErrors]);
}