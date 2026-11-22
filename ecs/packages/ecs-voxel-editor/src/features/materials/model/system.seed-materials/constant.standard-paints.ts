// © 2026 Adobe. MIT License. See /LICENSE for details.
import { standard } from "./function.standard.js";
import type { StandardMaterial } from "./type.standard-material.js";

/** The paints a new world starts with: common colors, glossier than most materials. */
export const standardPaints: readonly StandardMaterial[] = [
    standard("white", [0.9, 0.9, 0.9, 1], 0, 0.45),
    standard("off-white", [0.82, 0.78, 0.68, 1], 0, 0.5),
    standard("light gray", [0.5, 0.5, 0.5, 1], 0, 0.5),
    standard("dark gray", [0.12, 0.12, 0.12, 1], 0, 0.5),
    standard("black", [0.02, 0.02, 0.02, 1], 0, 0.45),
    standard("red", [0.6, 0.03, 0.03, 1], 0, 0.4),
    standard("orange", [0.85, 0.25, 0.02, 1], 0, 0.4),
    standard("yellow", [0.9, 0.7, 0.02, 1], 0, 0.4),
    standard("safety yellow", [0.95, 0.62, 0.0, 1], 0, 0.5),
    standard("lime", [0.35, 0.75, 0.05, 1], 0, 0.4),
    standard("green", [0.03, 0.3, 0.06, 1], 0, 0.4),
    standard("teal", [0.0, 0.32, 0.3, 1], 0, 0.4),
    standard("sky blue", [0.25, 0.55, 0.9, 1], 0, 0.4),
    standard("blue", [0.02, 0.12, 0.6, 1], 0, 0.4),
    standard("navy", [0.01, 0.02, 0.12, 1], 0, 0.4),
    standard("purple", [0.2, 0.04, 0.4, 1], 0, 0.4),
    standard("pink", [0.9, 0.3, 0.45, 1], 0, 0.4),
    standard("brown", [0.18, 0.07, 0.02, 1], 0, 0.5),
    standard("cream", [0.85, 0.75, 0.5, 1], 0, 0.5),
    standard("silver", [0.75, 0.75, 0.77, 1], 1, 0.3),
];
