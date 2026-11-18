// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { frameBuffer, frameHeight, frameWidth, position, sprite } from "../../../../model/index.js";
import { movementSystem } from "./system.movement-system.js";
import { spriteSystem } from "./system.sprite-system.js";

/** `RenderSystem`: draws each sprite's character into the frame buffer at its position, truncated as `int`. */
export const renderSystem: System = System.create({ kernel: true, components: { with: [position, sprite] }, after: [movementSystem, spriteSystem] }, (row, { resources }) => {
    const at = row[position];
    const x = Math.trunc(at.x);
    const y = Math.trunc(at.y);
    if (y >= 0 && y < frameHeight && x >= 0 && x < frameWidth) resources[frameBuffer][x + y * frameWidth] = row[sprite].character;
});
