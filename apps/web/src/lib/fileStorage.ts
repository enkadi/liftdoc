const DB_NAME = "doclift-file-db";
const STORE_NAME = "draft-files";
const FILE_KEY = "current-uploaded-file";

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const idb = typeof window !== "undefined" && window.indexedDB ? window.indexedDB : (typeof globalThis !== "undefined" ? globalThis.indexedDB : undefined);
        if (!idb) {
            return reject(new Error("IndexedDB not available"));
        }
        const request = idb.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB open error"));
    });
}

export async function saveDraftFile(file: File): Promise<boolean> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const record = {
            arrayBuffer,
            name: file.name,
            type: file.type,
            lastModified: file.lastModified,
        };
        store.put(record, FILE_KEY);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("Save draft file error"));
        });
        return true;
    } catch (error) {
        console.warn("Failed to save draft file to IndexedDB:", error);
        return false;
    }
}

export async function getDraftFile(): Promise<File | null> {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(FILE_KEY);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const res = request.result;
                if (!res) {
                    resolve(null);
                    return;
                }
                if (res instanceof File) {
                    resolve(res);
                    return;
                }
                if (typeof res === "object") {
                    try {
                        const buffer = res.arrayBuffer || res.blob || res;
                        const name = res.name || "uploaded.pdf";
                        const type = res.type || "application/pdf";
                        const lastModified = res.lastModified || Date.now();

                        const restoredFile = new File([buffer], name, {
                            type,
                            lastModified,
                        });
                        resolve(restoredFile);
                    } catch {
                        resolve(null);
                    }
                    return;
                }
                resolve(null);
            };
            request.onerror = () => reject(request.error || new Error("Get draft file error"));
        });
    } catch {
        return null;
    }
}

export async function clearDraftFile(): Promise<void> {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(FILE_KEY);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("Clear draft file error"));
        });
    } catch {
        // Silently catch in environments without IndexedDB support
    }
}
