// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PaletteItem } from "./type.palette-item.js";

/** A titled section of `<palette-panel>`'s items; one with none isn't shown. */
export type PaletteSection = { readonly title: string; readonly items: readonly PaletteItem[] };
