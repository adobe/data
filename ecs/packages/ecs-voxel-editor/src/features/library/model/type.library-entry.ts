// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A model file in the library: its path from the library's folder, the folder it's in, its name, its main model's size and scale, and its thumbnail. */
export type LibraryEntry = {
    readonly path: string;
    readonly folder: string;
    readonly name: string;
    readonly size: readonly [number, number, number];
    readonly scale: readonly [number, number, number];
    readonly thumbnail: string | null;
};
