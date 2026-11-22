// © 2026 Adobe. MIT License. See /LICENSE for details.
import { standard } from "./function.standard.js";
import type { StandardMaterial } from "./type.standard-material.js";

/** The materials a new world starts with: colors to build with, metallic or not, smooth or rough. */
export const standardMaterials: readonly StandardMaterial[] = [
    standard("stone", [0.45, 0.43, 0.40, 1], 0.05, 0.85),
    standard("wood", [0.55, 0.35, 0.20, 1], 0, 0.75),
    standard("grass", [0.30, 0.55, 0.22, 1], 0, 0.95),
    standard("sand", [0.86, 0.78, 0.55, 1], 0, 1),
    standard("brick", [0.62, 0.24, 0.18, 1], 0, 0.9),
    standard("ice", [0.85, 0.92, 0.95, 1], 0, 0.15),
    standard("water", [0.20, 0.45, 0.80, 1], 0, 0.05),
    standard("steel", [0.70, 0.72, 0.75, 1], 0.9, 0.35),
    standard("gold", [0.95, 0.75, 0.25, 1], 1, 0.3),
    standard("rubber", [0.15, 0.15, 0.15, 1], 0, 0.9),
    standard("mortar", [0.25, 0.24, 0.22, 1], 0, 0.95),
    standard("asphalt", [0.025, 0.025, 0.028, 1], 0, 0.95),
];
