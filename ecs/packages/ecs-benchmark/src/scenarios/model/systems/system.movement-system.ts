// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";
import { timeDelta } from "../shared/constant.time-delta.js";

/** `MovementSystem`: `position += direction * dt`, in floats. */
export const movementSystem: System = System.create({ kernel: true, components: { with: [position, velocity] } }, row => {
    const from = row[position];
    const direction = row[velocity];
    row[position] = { x: Math.fround(from.x + Math.fround(direction.x * timeDelta)), y: Math.fround(from.y + Math.fround(direction.y * timeDelta)) };
});
