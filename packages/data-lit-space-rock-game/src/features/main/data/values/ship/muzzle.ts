// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { Ship } from "./ship.js";
import { facing } from "./facing.js";
import { radius } from "./radius.js";

// Spawn kinematics for a bullet fired now: it leaves the ship's nose and
// inherits the ship's momentum plus `bulletSpeed` along the facing. Takes the
// speed as a parameter so the ship never names the bullet's constants.
export const muzzle = (
  ship: Ship,
  bulletSpeed: number,
): { readonly position: Vec2; readonly velocity: Vec2 } => {
  const dir = facing(ship.rotation);
  return {
    position: Vec2.add(ship.position, Vec2.scale(dir, radius)),
    velocity: Vec2.add(ship.velocity, Vec2.scale(dir, bulletSpeed)),
  };
};
