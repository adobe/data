// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Where the library folder chosen is kept for the next visit, IndexedDB, since a folder can't be kept in local storage:
 * `load` gives it, null for none, and `save` keeps one.
 */
export const folderStore = {
    load: async (): Promise<FileSystemDirectoryHandle | null> => {
        const database = await open();
        return await new Promise(resolve => {
            const request = database.transaction(store).objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result instanceof FileSystemDirectoryHandle ? request.result : null);
            request.onerror = () => resolve(null);
        });
    },
    save: async (folder: FileSystemDirectoryHandle): Promise<void> => {
        const database = await open();
        await new Promise<void>(resolve => {
            const transaction = database.transaction(store, "readwrite");
            transaction.objectStore(store).put(folder, key);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
        });
    },
};

const store = "folders";
const key = "library";

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("voxel-editor", 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
