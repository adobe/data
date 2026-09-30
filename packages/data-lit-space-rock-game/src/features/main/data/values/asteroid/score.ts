// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";

// Points awarded for destroying this asteroid, from its size tier.
export const score = (asteroid: Asteroid): number => Size.score[asteroid.size];
