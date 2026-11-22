// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PalettePanel } from "../../elements/index.js";

/** The page's palette; null until the page provides it. */
export const palettePanel = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [palettePanel]: { type: PalettePanel | null; thread: "main" };
    }
}
