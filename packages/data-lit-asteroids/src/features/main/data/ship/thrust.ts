// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { facing } from "./facing.js";
import { thrustAccel } from "./thrust-accel.js";

// Accelerate `velocity` along the facing direction for `dt` — the momentum
// carries between ticks, so this only adds to the existing velocity.
export const thrust = (velocity: Vec2, rotation: number, dt: number): Vec2 =>
  Vec2.add(velocity, Vec2.scale(facing(rotation), thrustAccel * dt));
