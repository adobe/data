// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position, timeDelta, velocity } from "../../../../model/index.js";

/** `MovementSystem`: `position += direction * dt`, in floats. */
export const movementSystem: System = System.create({ kernel: true, components: { with: [position, velocity] } }, row => {
    const from = row[position];
    const direction = row[velocity];
    row[position] = { x: Math.fround(from.x + Math.fround(direction.x * timeDelta)), y: Math.fround(from.y + Math.fround(direction.y * timeDelta)) };
});
