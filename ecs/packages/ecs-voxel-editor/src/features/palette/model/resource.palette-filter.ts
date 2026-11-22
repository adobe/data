// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PaletteFilter } from "./type.palette-filter.js";

/** What the palette shows. */
export const paletteFilter = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [paletteFilter]: { type: PaletteFilter; default: { kind: "all"; size: "any"; search: "" }; thread: "main" };
    }
}
