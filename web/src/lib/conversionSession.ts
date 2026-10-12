export type ConversionStatus = "queued" | "processing" | "done" | "failed" | "expired";

export type ConversionSession = {
    jobId: string;
    fileName: string;
    status: ConversionStatus;
    updatedAt: number;
    createdAt?: number;
    startedAt?: string | null;
    durationSeconds?: number;
    outputSizeBytes?: number;
    completedAt?: number;
    fileSize?: number;
    pageCount?: number | null;
    output?: {
        filename: string;
        sizeBytes: number | null;
        downloadUrl: string;
    } | null;
    metrics?: {
        sourceWordCount: number | null;
        outputWordCount: number | null;
        orderedListsDetected?: number | null;
        unorderedListsDetected?: number | null;
        orderedListsReconstructed?: number | null;
        unorderedListsReconstructed?: number | null;
    } | null;
};

const STORAGE_KEY = "doclift-active-conversion";

export function saveConversionSession(session: ConversionSession) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getConversionSession(): ConversionSession | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) return null;

    try {
        return JSON.parse(stored);
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

export function clearConversionSession() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
}
