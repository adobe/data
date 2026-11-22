// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { VoxelFile } from "../../../document/model/index.js";
import type { LibraryEntry } from "../../model/index.js";

/** Every model file, `*.voxel.json`, in a folder and those within it, as the library lists it; a file that isn't one is left out. */
export const listEntries = async (folder: FileSystemDirectoryHandle, path = ""): Promise<LibraryEntry[]> => {
    const found: LibraryEntry[] = [];
    for await (const [name, handle] of folder.entries()) {
        const at = path === "" ? name : `${path}/${name}`;
        if (handle instanceof FileSystemDirectoryHandle) found.push(...await listEntries(handle, at));
        else if (handle instanceof FileSystemFileHandle && name.endsWith(suffix)) {
            const entry = await entryOf(handle, at, path);
            if (entry !== null) found.push(entry);
        }
    }
    return found.sort((a, b) => a.path.localeCompare(b.path));
};

const suffix = ".voxel.json";

async function entryOf(handle: FileSystemFileHandle, path: string, folder: string): Promise<LibraryEntry | null> {
    try {
        // A file is trusted to hold what its format names, once it names it.
        const parsed: unknown = JSON.parse(await (await handle.getFile()).text());
        if (typeof parsed !== "object" || parsed === null || Reflect.get(parsed, "format") !== "adobe-voxel") return null;
        const file = parsed as VoxelFile;
        const main = file.models[file.main];
        const embedded = main !== undefined && "size" in main ? main : null;
        return {
            path, folder, name: handle.name.slice(0, -suffix.length),
            size: embedded?.size ?? [1, 1, 1], scale: embedded?.scale ?? [1, 1, 1],
            thumbnail: file.thumbnails?.[file.main] ?? null,
        };
    } catch {
        return null;
    }
}
