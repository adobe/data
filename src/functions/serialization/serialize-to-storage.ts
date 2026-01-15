// © 2026 Adobe. MIT License. See /LICENSE for details.
import { blobStore } from "../../cache/blob-store.js";
import { serializeToBlobs, deserializeFromBlobs } from "./serialize-to-blobs.js";

export const serializeToStorage = async <T>(data: T, id: string, storage: Storage = sessionStorage): Promise<void> => {
    const { json, binary } = await serializeToBlobs(data);
    const [jsonBlobRef, binaryBlobRef] = await Promise.all([
        blobStore.getRef(json),
        blobStore.getRef(binary)
    ]);
    storage.setItem(id, JSON.stringify({ json: jsonBlobRef, binary: binaryBlobRef }));
}

export const deserializeFromStorage = async <T>(id: string, storage: Storage = sessionStorage): Promise<T | null> => {
    const storedData = storage.getItem(id);
    if (!storedData) {
        return null;
    }

    const { json: jsonBlobRef, binary: binaryBlobRef } = JSON.parse(storedData);
    const [jsonBlob, binaryBlob] = await Promise.all([
        blobStore.getBlob(jsonBlobRef),
        blobStore.getBlob(binaryBlobRef)
    ]);

    if (!jsonBlob || !binaryBlob) {
        return null;
    }

    return deserializeFromBlobs({ json: jsonBlob, binary: binaryBlob });
};
