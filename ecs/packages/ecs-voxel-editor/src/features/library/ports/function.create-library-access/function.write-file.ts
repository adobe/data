// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Writes a text to the file at a path in a folder, making the folders on the way. */
export const writeFile = async (folder: FileSystemDirectoryHandle, path: string, text: string): Promise<void> => {
    const parts = path.split("/");
    const name = parts.pop() ?? "";
    let directory = folder;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
    const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
};
