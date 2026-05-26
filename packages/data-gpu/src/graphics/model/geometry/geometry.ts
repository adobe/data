// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * One row of the `Geometry` archetype — an asset identified by URL. The
 * model loader fetches the URL, then writes derived state (`_bounds`,
 * primitive entities, animation clips) onto the same row.
 */
export interface Geometry {
    modelUrl: string;
}

export * as Geometry from "./public.js";
