// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * How a model looks, for drawing a thumbnail of it: its name, and every voxel it shows, its own and its instances' however
 * deep, as a cube centered at `at` in the model's voxels, `across` of them wide, colored `color`, a CSS color.
 */
export type ModelLook = {
    readonly name: string;
    readonly size: readonly [number, number, number];
    readonly cubes: readonly { readonly at: readonly [number, number, number]; readonly across: number; readonly color: string }[];
};
