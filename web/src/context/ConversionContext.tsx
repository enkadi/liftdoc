"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { ConversionSession, ConversionStatus, saveConversionSession, clearConversionSession, getConversionSession } from "@/lib/conversionSession";
import { saveDraftFile, getDraftFile, clearDraftFile } from "@/lib/fileStorage";
import { uploadFile } from "@/lib/uploadApi";
import { useJobPolling } from "@/lib/useJobPolling";
import { usePurgeCountdown } from "@/lib/usePurgeCountdown";
import { JobStatusResponse } from "@/lib/jobApi";
import AbandonSessionModal from "@/components/ui/AbandonSessionModal";
import { toast } from "sonner";

export type ActiveView = "upload" | "progress" | "result";

interface ConversionContextValue {
    file: File | null;
    setFile: (file: File | null) => void;
    clearFile: () => void;
    resetKey: number;
    reset: () => void;
    resetKeepFile: () => void;
    requestReset: () => void;
    isAbandonModalOpen: boolean;
    openAbandonModal: () => void;
    closeAbandonModal: () => void;
    activeView: ActiveView;
    setActiveView: (view: ActiveView) => void;
    session: ConversionSession | null;
    setSession: (session: ConversionSession | null) => void;
    isUploading: boolean;
    isConverting: boolean;
    isInitialized: boolean;
    startConversion: (fileOverride?: File | null) => Promise<ConversionSession | null>;
    updateStatus: (
        status: ConversionStatus,
        durationOverride?: number,
        jobData?: JobStatusResponse | number
    ) => void;
}

const ConversionContext = createContext<ConversionContextValue | null>(null);

export function ConversionProvider({ children }: { children: ReactNode }) {
    const [file, setFileState] = useState<File | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [activeView, setActiveView] = useState<ActiveView>("upload");
    const [session, setSession] = useState<ConversionSession | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isAbandonModalOpen, setIsAbandonModalOpen] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isUploadingRef = useRef(false);
    const initialPurgeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const purgeExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasWarned30MinRef = useRef(false);
    const hasExpiredRef = useRef(false);

    const isConverting = Boolean(
        session && (session.status === "processing" || session.status === "queued")
    );

    const purgeTimeRemaining = usePurgeCountdown(
        session?.status === "done" ? session?.completedAt : undefined
    );

    const setFile = useCallback((newFile: File | null) => {
        setFileState(newFile);
        if (newFile) {
            saveDraftFile(newFile).then((saved) => {
                if (!saved) {
                    if (typeof toast?.warning === "function") {
                        toast.warning("Could not save file draft for page refresh recovery.");
                    } else if (typeof toast?.error === "function") {
                        toast.error("Could not save file draft for page refresh recovery.");
                    }
                }
            });
        } else {
            clearDraftFile();
        }
    }, []);

    const clearFile = useCallback(() => {
        setFileState(null);
        clearDraftFile();
    }, []);

    const updateStatus = useCallback((
        status: ConversionStatus,
        durationOverride?: number,
        jobData?: JobStatusResponse | number
    ) => {
        setSession((prevSession) => {
            if (!prevSession) return null;
            const now = Date.now();
            const createdAt = prevSession.createdAt || prevSession.updatedAt;
            const calculatedDuration = Math.max(1, Math.round((now - createdAt) / 1000));
            const completedJobData =
                typeof jobData === "number" ? undefined : jobData;
            const outputSizeBytes =
                typeof jobData === "number"
                    ? jobData
                    : completedJobData?.output?.sizeBytes ?? prevSession.outputSizeBytes;
            const durationSeconds =
                completedJobData?.durationSeconds !== undefined && completedJobData?.durationSeconds !== null
                    ? completedJobData.durationSeconds
                    : durationOverride !== undefined
                    ? durationOverride
                    : status === "done"
                    ? (prevSession.durationSeconds ?? calculatedDuration)
                    : prevSession.durationSeconds;

            const completedAtMs = completedJobData?.completedAt
                ? new Date(completedJobData.completedAt).getTime()
                : status === "done"
                ? (prevSession.completedAt ?? now)
                : prevSession.completedAt;

            const updatedSession: ConversionSession = {
                ...prevSession,
                status,
                updatedAt: now,
                durationSeconds,
                outputSizeBytes,
                completedAt: completedAtMs,
                startedAt: completedJobData?.startedAt ?? prevSession.startedAt,
                pageCount: completedJobData?.pageCount ?? prevSession.pageCount,
                output: completedJobData?.output ?? prevSession.output,
                metrics: completedJobData?.metrics ?? prevSession.metrics,
            };
            saveConversionSession(updatedSession);
            return updatedSession;
        });
    }, []);

    const reset = useCallback(() => {
        if (initialPurgeToastTimerRef.current) {
            clearTimeout(initialPurgeToastTimerRef.current);
            initialPurgeToastTimerRef.current = null;
        }
        if (purgeExpiryTimerRef.current) {
            clearTimeout(purgeExpiryTimerRef.current);
            purgeExpiryTimerRef.current = null;
        }
        hasWarned30MinRef.current = false;
        hasExpiredRef.current = false;
        // Cancel any in-flight upload before clearing state.
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        isUploadingRef.current = false;
        setIsUploading(false);
        setFile(null);
        setSession(null);
        clearConversionSession();
        setResetKey((k) => k + 1);
        setActiveView("upload");
        setIsAbandonModalOpen(false);
    }, [setFile]);

    const resetKeepFile = useCallback(() => {
        if (initialPurgeToastTimerRef.current) {
            clearTimeout(initialPurgeToastTimerRef.current);
            initialPurgeToastTimerRef.current = null;
        }
        if (purgeExpiryTimerRef.current) {
            clearTimeout(purgeExpiryTimerRef.current);
            purgeExpiryTimerRef.current = null;
        }
        hasWarned30MinRef.current = false;
        hasExpiredRef.current = false;
        isUploadingRef.current = false;
        setIsUploading(false);
        setSession(null);
        clearConversionSession();
        setResetKey((k) => k + 1);
        setActiveView("upload");
        setIsAbandonModalOpen(false);
    }, []);

    const startConversion = async (fileOverride?: File | null): Promise<ConversionSession | null> => {
        const targetFile = fileOverride !== undefined ? fileOverride : file;
        if (!targetFile || isUploadingRef.current || isConverting) return null;

        isUploadingRef.current = true;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsUploading(true);

        try {
            const res = await uploadFile(targetFile, controller.signal);

            // If reset() was called while the request was in flight, bail out.
            if (controller.signal.aborted) return null;

            const now = Date.now();
            const realJobId = String(res.jobId);
            const newSession: ConversionSession = {
                jobId: realJobId,
                fileName: targetFile.name,
                status: "processing",
                updatedAt: now,
                createdAt: now,
                fileSize: targetFile.size,
            };

            try {
                saveConversionSession(newSession);
            } catch (storageErr) {
                console.warn("Could not persist conversion session to storage:", storageErr);
                toast.warning("Progress may be lost if the page is refreshed.");
            }

            setSession(newSession);
            setActiveView("progress");
            return newSession;
        } catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") return null;

            const errorMessage = err instanceof Error ? err.message : "Upload failed";
            if (typeof toast?.error === "function") {
                toast.error(errorMessage);
            }
            return null;
        } finally {
            isUploadingRef.current = false;
            abortControllerRef.current = null;
            setIsUploading(false);
        }
    };

    const requestReset = () => {
        if (session || isUploading) {
            setIsAbandonModalOpen(true);
        } else {
            reset();
        }
    };

    const handleConfirmAbandon = () => {
        if (session?.status === "failed") {
            resetKeepFile();
        } else {
            reset();
        }
    };

    const openAbandonModal = useCallback(() => setIsAbandonModalOpen(true), []);
    const closeAbandonModal = useCallback(() => setIsAbandonModalOpen(false), []);

    useJobPolling({
        jobId: session?.jobId,
        enabled: isConverting,
        onComplete: (data) => {
            updateStatus("done", undefined, data);
            setActiveView("result");
            if (typeof toast?.success === "function") {
                toast.success("Conversion complete!", {
                    description: "Your file has been converted successfully and is ready for download.",
                });
            }
            if (initialPurgeToastTimerRef.current) {
                clearTimeout(initialPurgeToastTimerRef.current);
            }
            initialPurgeToastTimerRef.current = setTimeout(() => {
                if (typeof toast?.warning === "function") {
                    toast.warning("Auto-Purge Warning", {
                        description: "Your file will be purged in 30 minutes. Please download your Word document soon.",
                    });
                }
            }, 3000);
        },
        onFailed: (err) => {
            updateStatus("failed");
            if (typeof toast?.error === "function") {
                toast.error(err?.message || "Conversion failed");
            }
        },
    });

    useEffect(() => {
        if (purgeTimeRemaining === null || session?.status !== "done") {
            hasExpiredRef.current = false;
            return;
        }

        // Purge expired toast and automatic reset after 2 seconds
        if (purgeTimeRemaining === 0 && !hasExpiredRef.current) {
            hasExpiredRef.current = true;
            if (typeof toast?.error === "function") {
                toast.error("File Purged", {
                    description: "Your file is no longer available for download.",
                });
            } else if (typeof toast?.warning === "function") {
                toast.warning("File Purged", {
                    description: "Your file is no longer available for download.",
                });
            }

            if (purgeExpiryTimerRef.current) {
                clearTimeout(purgeExpiryTimerRef.current);
            }
            purgeExpiryTimerRef.current = setTimeout(() => {
                reset();
            }, 2000);
        }
    }, [purgeTimeRemaining, session?.status, reset]);

    useEffect(() => {
        let isMounted = true;

        const initializeState = async () => {
            const storedSession = getConversionSession();
            if (storedSession && isMounted) {
                setSession(storedSession);
                if (storedSession.status === "processing" || storedSession.status === "queued" || storedSession.status === "failed") {
                    setActiveView("progress");
                } else if (storedSession.status === "done") {
                    setActiveView("result");
                } else if (storedSession.status === "expired") {
                    clearConversionSession();
                    setSession(null);
                    setActiveView("upload");
                }
            }
            if (isMounted) {
                setIsInitialized(true);
            }

            const savedFile = await getDraftFile();
            if (isMounted && savedFile) {
                setFileState((currentFile) => currentFile ?? savedFile);
            }
        };

        initializeState();

        return () => {
            isMounted = false;
            if (initialPurgeToastTimerRef.current) {
                clearTimeout(initialPurgeToastTimerRef.current);
                initialPurgeToastTimerRef.current = null;
            }
            if (purgeExpiryTimerRef.current) {
                clearTimeout(purgeExpiryTimerRef.current);
                purgeExpiryTimerRef.current = null;
            }
        };
    }, []);

    return (
        <ConversionContext.Provider
            value={{
                file,
                setFile,
                clearFile,
                resetKey,
                reset,
                resetKeepFile,
                requestReset,
                isAbandonModalOpen,
                openAbandonModal,
                closeAbandonModal,
                activeView,
                setActiveView,
                session,
                setSession,
                isUploading,
                isConverting,
                isInitialized,
                startConversion,
                updateStatus,
            }}
        >
            {children}
            <AbandonSessionModal
                isOpen={isAbandonModalOpen}
                onClose={() => setIsAbandonModalOpen(false)}
                onConfirm={handleConfirmAbandon}
                session={session}
            />
        </ConversionContext.Provider>
    );
}

export function useConversion() {
  const ctx = useContext(ConversionContext);
  if (!ctx) throw new Error("useConversion must be used within ConversionProvider");
  return ctx;
}
