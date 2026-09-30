// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Bullet } from "./bullet.js";
import { Ship } from "../ship/ship.js";
import { speed } from "./speed.js";

// A bullet fired now from `ship`'s nose, inheriting its momentum.
export const fire = (ship: Ship): Bullet => ({ ...Ship.muzzle(ship, speed), age: 0 });
