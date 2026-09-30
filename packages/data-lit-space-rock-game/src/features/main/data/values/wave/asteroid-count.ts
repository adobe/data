// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Wave } from "./wave.js";

// Each wave spawns one more rock than the last.
export const asteroidCount = (wave: Wave): number => 3 + wave;
