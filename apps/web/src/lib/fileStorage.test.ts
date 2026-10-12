import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { saveDraftFile, getDraftFile, clearDraftFile } from "./fileStorage";

describe("fileStorage", () => {
    beforeEach(async () => {
        await clearDraftFile();
    });

    it("saves a File to IndexedDB, reloads it with metadata/content, and clears it", async () => {
        const fileContent = "PDF file content stream";
        const originalFile = new File([fileContent], "contract.pdf", {
            type: "application/pdf",
            lastModified: 1700000000000,
        });

        // 1. Save draft file
        const saved = await saveDraftFile(originalFile);
        expect(saved).toBe(true);

        // 2. Retrieve draft file and verify metadata & content
        const restoredFile = await getDraftFile();
        expect(restoredFile).not.toBeNull();
        expect(restoredFile?.name).toBe("contract.pdf");
        expect(restoredFile?.type).toBe("application/pdf");

        const restoredText = await restoredFile?.text();
        expect(restoredText).toBe(fileContent);

        // 3. Clear draft file
        await clearDraftFile();

        // 4. Verify draft file is cleared
        const clearedFile = await getDraftFile();
        expect(clearedFile).toBeNull();
    });

    it("handles missing IndexedDB gracefully without throwing", async () => {
        const originalIndexedDB = window.indexedDB;
        // Temporarily delete indexedDB
        // @ts-expect-error simulating missing indexedDB
        delete window.indexedDB;

        const testFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

        await expect(saveDraftFile(testFile)).resolves.toBe(false);
        await expect(getDraftFile()).resolves.toBeNull();
        await expect(clearDraftFile()).resolves.not.toThrow();

        // Restore indexedDB
        window.indexedDB = originalIndexedDB;
    });
});
