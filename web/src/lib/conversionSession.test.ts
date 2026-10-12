import { describe, expect, it, beforeEach } from "vitest";
import {
    saveConversionSession,
    getConversionSession,
    clearConversionSession,
    type ConversionSession,
} from "./conversionSession";

describe("conversionSession lib", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe("saveConversionSession and getConversionSession", () => {
        it("returns null when no session is stored", () => {
            expect(getConversionSession()).toBeNull();
        });

        it("saves and retrieves a valid conversion session", () => {
            const mockSession: ConversionSession = {
                jobId: "conv_test_123",
                fileName: "document.pdf",
                status: "processing",
                updatedAt: 1700000000000,
            };

            saveConversionSession(mockSession);
            const retrieved = getConversionSession();

            expect(retrieved).toEqual(mockSession);
        });

        it("handles corrupted JSON gracefully and removes stored item", () => {
            localStorage.setItem("doclift-active-conversion", "{invalid_json:");

            expect(getConversionSession()).toBeNull();
            expect(localStorage.getItem("doclift-active-conversion")).toBeNull();
        });
    });

    describe("clearConversionSession", () => {
        it("removes the active conversion session from localStorage", () => {
            const mockSession: ConversionSession = {
                jobId: "conv_test_456",
                fileName: "test.pdf",
                status: "done",
                updatedAt: Date.now(),
            };

            saveConversionSession(mockSession);
            expect(getConversionSession()).not.toBeNull();

            clearConversionSession();
            expect(getConversionSession()).toBeNull();
        });
    });
});
