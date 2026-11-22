// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LibraryEntry } from "./type.library-entry.js";

/**
 * The library: the folder models are loaded from and saved to, by name, null before one is chosen; whether it's `ready`,
 * or needs the user's `permission` again, as after a reload; its model files; and the last thing to report, such as a
 * file that couldn't be read.
 */
export type Library = {
    readonly folder: string | null;
    readonly state: "none" | "permission" | "ready";
    readonly entries: readonly LibraryEntry[];
    readonly message: string | null;
};
