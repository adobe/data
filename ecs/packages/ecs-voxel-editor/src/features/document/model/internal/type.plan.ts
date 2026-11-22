// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { VoxelFile } from "../type.voxel-file.js";

/**
 * What loading files spawns: their materials, each named once; and their models, each by a key, `path#name`, unique
 * across the files, with the name it takes in the document, its library `source`, null for the document's own, and its
 * voxels and instances, which name models by key. `errors` says what couldn't be read.
 */
export type Plan = {
    readonly materials: VoxelFile["materials"];
    readonly models: readonly {
        readonly key: string;
        readonly name: string;
        readonly source: string | null;
        readonly size: readonly [number, number, number];
        readonly scale: readonly [number, number, number];
        readonly unlocked: boolean;
        readonly voxels: { readonly palette: readonly string[]; readonly runs: readonly number[] };
        readonly paints: { readonly palette: readonly string[]; readonly runs: readonly number[] } | null;
        readonly instances: readonly { readonly model: string; readonly position: readonly [number, number, number]; readonly rotation: readonly [number, number, number, number] }[];
        readonly selections: { readonly [name: string]: readonly (readonly [number, number, number, number])[] };
    }[];
    readonly errors: readonly string[];
};
