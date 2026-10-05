// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";

// Unit direction the ship points, from its rotation angle.
export const facing = (rotation: number): Vec2 => [Math.cos(rotation), Math.sin(rotation)];
