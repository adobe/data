// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, type World } from "@adobe/ecs";
import { addReference, loadDocument, nameDocument, serializeDocument } from "../../document/model/index.js";
import { newDocument } from "../../voxels/model/index.js";
import { type Library, type LibraryAccess, setLibrary } from "../model/index.js";
import { folderStore } from "./function.create-library-access/constant.folder-store.js";
import { listEntries } from "./function.create-library-access/function.list-entries.js";
import { readWithReferences } from "./function.create-library-access/function.read-with-references.js";
import { writeFile } from "./function.create-library-access/function.write-file.js";

/**
 * Reaches the library's folder with the File System Access API, for `world`: the folder chosen is kept for the next
 * visit, when the browser asks the user's permission again. Saving writes only the files whose text changed since they
 * were read or written, so a referenced model's file is written back only once it's edited; saving to another path,
 * not standalone, makes it the document's.
 */
export const createLibraryAccess = (world: Pick<World, "run">): LibraryAccess & { readonly restore: () => Promise<void> } => {
    let folder: FileSystemDirectoryHandle | null = null;
    let state: Library = { folder: null, state: "none", entries: [], message: null };
    /** Each file's text as it was last read or written, by path. */
    const known = new Map<string, string>();

    const report = async (change: Partial<Library>): Promise<void> => {
        state = { ...state, ...change };
        await world.run(setLibrary, state);
    };
    const list = async (): Promise<void> => {
        if (folder === null) return;
        await report({ folder: folder.name, state: "ready", entries: await listEntries(folder) });
    };
    const ready = async (handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> => {
        const options = { mode: "readwrite" } as const;
        if (await handle.queryPermission(options) === "granted") return true;
        return ask && await handle.requestPermission(options) === "granted";
    };
    const failed = (error: unknown): Promise<void> => report({ message: error instanceof Error ? error.message : String(error) });

    return {
        restore: async () => {
            const kept = await folderStore.load().catch(() => null);
            if (kept === null) return;
            folder = kept;
            if (await ready(kept, false)) await list();
            else await report({ folder: kept.name, state: "permission" });
        },
        choose: async () => {
            try {
                const chosen = await showDirectoryPicker({ mode: "readwrite" });
                folder = chosen;
                await folderStore.save(chosen);
                await list();
            } catch (error) {
                if (!(error instanceof DOMException && error.name === "AbortError")) await failed(error);
            }
        },
        reconnect: async () => {
            if (folder !== null && await ready(folder, true)) await list();
        },
        open: async path => {
            if (folder === null) return;
            try {
                const { files, missing } = await readWithReferences(folder, path);
                for (const [at, text] of files) known.set(at, text);
                const errors = await world.run(loadDocument, { path, files });
                const problems = [...missing.map(at => `Missing ${at}.`), ...errors];
                await report({ message: problems.length === 0 ? `Opened ${path}.` : problems.join(" ") });
            } catch (error) {
                await failed(error);
            }
        },
        save: async ({ path, standalone, thumbnails }) => {
            if (folder === null) {
                await report({ message: "Choose a library folder to save to." });
                return;
            }
            try {
                const files = await world.run(serializeDocument, { path, standalone, thumbnails });
                const written: string[] = [];
                for (const file of files) {
                    if (known.get(file.path) === file.text) continue;
                    await writeFile(folder, file.path, file.text);
                    known.set(file.path, file.text);
                    written.push(file.path);
                }
                if (!standalone) await world.run(nameDocument, { path });
                await list();
                await report({ message: written.length === 0 ? "Nothing changed to save." : `Saved ${written.join(", ")}.` });
            } catch (error) {
                await failed(error);
            }
        },
        create: async () => {
            await world.run(newDocument, { size: [16, 16, 16], scale: [1, 1, 1] });
            await world.run(nameDocument, { path: null });
        },
        reference: async path => {
            if (folder === null) return Entity.none;
            try {
                const { files, missing } = await readWithReferences(folder, path);
                for (const [at, text] of files) known.set(at, text);
                const { model, errors } = await world.run(addReference, { path, files });
                const problems = [...missing.map(at => `Missing ${at}.`), ...errors];
                if (problems.length > 0) await report({ message: problems.join(" ") });
                return model;
            } catch (error) {
                await failed(error);
                return Entity.none;
            }
        },
    };
};

declare global {
    function showDirectoryPicker(options?: { readonly mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
    interface FileSystemHandle {
        queryPermission(options?: { readonly mode?: "read" | "readwrite" }): Promise<PermissionState>;
        requestPermission(options?: { readonly mode?: "read" | "readwrite" }): Promise<PermissionState>;
    }
}
