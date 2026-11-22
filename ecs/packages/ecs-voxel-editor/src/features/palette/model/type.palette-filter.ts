// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * What the palette shows: materials, models or both; models of a size, by their longest side in voxels, `small` up to
 * 8, `medium` up to 32, `large` beyond; and those whose name holds `search`.
 */
export type PaletteFilter = {
    readonly kind: "all" | "materials" | "models";
    readonly size: "any" | "small" | "medium" | "large";
    readonly search: string;
};
