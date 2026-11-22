// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A voxel document's file, `*.voxel.json`: its main model's name, the materials its voxels use, by name, and its models
 * and paints by name, each embedded or a reference to a library file's model, `path` for its main model or `path#name` for another
 * it holds; with each model's thumbnail, an image's data URL.
 */
export type VoxelFile = {
    readonly format: "adobe-voxel";
    readonly version: 1;
    readonly main: string;
    readonly materials: readonly {
        readonly name: string;
        readonly baseColor: readonly [number, number, number, number];
        readonly metallic: number;
        readonly roughness: number;
        // Whether it's a paint, coating voxels rather than making them; a material where it's left out.
        readonly paint?: true;
    }[];
    readonly models: { readonly [name: string]: { readonly ref: string } | {
        readonly size: readonly [number, number, number];
        readonly scale: readonly [number, number, number];
        // Whether its size is unlocked, so editing past its bounds grows it; locked where it's left out.
        readonly unlocked?: boolean;
        // Cells in x-fastest order as runs: a count, then 0 for empty or 1 + an index into `palette`.
        readonly voxels: { readonly palette: readonly string[]; readonly runs: readonly number[] };
        // Each painted cell's painted faces, a bit for each side as `1 << side` (+x, -x, +y, -y, +z, -z), a space, then its
        // paint's name, kept as `voxels` keeps names; none painted where it's left out.
        readonly paints?: { readonly palette: readonly string[]; readonly runs: readonly number[] };
        readonly instances: readonly { readonly model: string; readonly position: readonly [number, number, number]; readonly rotation: readonly [number, number, number, number] }[];
        readonly selections?: { readonly [name: string]: readonly (readonly [number, number, number, number])[] };
    } };
    readonly thumbnails?: { readonly [name: string]: string };
};
