// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { VoxelFile } from "../type.voxel-file.js";

/** Files by path from their texts, leaving out, as errors, those that aren't voxel documents. */
export const parseFiles = (texts: readonly (readonly [string, string])[]): { readonly files: ReadonlyMap<string, VoxelFile>; readonly errors: readonly string[] } => {
    const files = new Map<string, VoxelFile>();
    const errors: string[] = [];
    for (const [path, text] of texts) {
        try {
            // A file is trusted to hold what its format names, once it names it.
            const parsed: unknown = JSON.parse(text);
            if (typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "format") === "adobe-voxel") files.set(path, parsed as VoxelFile);
            else errors.push(`${path} isn't a voxel document.`);
        } catch {
            errors.push(`${path} isn't valid JSON.`);
        }
    }
    return { files, errors };
};
