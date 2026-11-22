// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { paletteFilter } from "./resource.palette-filter.js";
import type { PaletteFilter } from "./type.palette-filter.js";

/** Chooses what the palette shows. */
export const setPaletteFilter: System<PaletteFilter> = System.create({}, ({ resources }, input: PaletteFilter) => {
    const current = resources[paletteFilter];
    if (current.kind !== input.kind || current.size !== input.size || current.search !== input.search) resources[paletteFilter] = input;
});
