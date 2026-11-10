// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";
import { timeDelta } from "../shared/constant.time-delta.js";

/** `MovementSystem` as a GPU kernel: `position += direction * dt`, in floats. */
export const gpuMovementSystem: System = System.create({ kernel: "gpu", components: { with: [position, velocity] } }, row => {
    const from = row[position];
    const direction = row[velocity];
    row[position] = { x: Math.fround(from.x + Math.fround(direction.x * timeDelta)), y: Math.fround(from.y + Math.fround(direction.y * timeDelta)) };
});
