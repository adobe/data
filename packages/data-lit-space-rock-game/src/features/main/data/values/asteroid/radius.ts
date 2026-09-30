// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";

// Collision radius of an asteroid, from its size tier.
export const radius = (asteroid: Asteroid): number => Size.radius[asteroid.size];
