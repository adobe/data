// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The texts of the file at `path` in the library folder and every file it references, however deeply, by path; with the
 * paths that couldn't be read.
 */
export const readWithReferences = async (folder: FileSystemDirectoryHandle, path: string): Promise<{ readonly files: [string, string][]; readonly missing: string[] }> => {
    const files: [string, string][] = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    const visit = async (at: string): Promise<void> => {
        if (seen.has(at)) return;
        seen.add(at);
        const text = await read(folder, at);
        if (text === null) {
            missing.push(at);
            return;
        }
        files.push([at, text]);
        for (const reference of text.matchAll(/"ref"\s*:\s*"([^"#]+)(?:#[^"]*)?"/g)) await visit(reference[1] ?? "");
    };
    await visit(path);
    return { files, missing };
};

/** The text of the file at a path in a folder, null where there's none. */
async function read(folder: FileSystemDirectoryHandle, path: string): Promise<string | null> {
    try {
        const parts = path.split("/");
        const name = parts.pop() ?? "";
        let directory = folder;
        for (const part of parts) directory = await directory.getDirectoryHandle(part);
        return await (await (await directory.getFileHandle(name)).getFile()).text();
    } catch {
        return null;
    }
}
