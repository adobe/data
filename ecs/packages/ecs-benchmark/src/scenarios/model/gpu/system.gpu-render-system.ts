// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "../shared/component.position.js";
import { sprite } from "../shared/component.sprite.js";
import { frameHeight } from "../shared/constant.frame-height.js";
import { frameWidth } from "../shared/constant.frame-width.js";
import { frameBuffer } from "../shared/resource.frame-buffer.js";
import { gpuMovementSystem } from "./system.gpu-movement-system.js";
import { gpuSpriteSystem } from "./system.gpu-sprite-system.js";

/** `RenderSystem` as a GPU kernel: draws each sprite's character into the frame buffer at its position, truncated as `int`. */
export const gpuRenderSystem: System = System.create({ kernel: "gpu", components: { with: [position, sprite] }, after: [gpuMovementSystem, gpuSpriteSystem] }, (row, { resources }) => {
    const at = row[position];
    const x = Math.trunc(at.x);
    const y = Math.trunc(at.y);
    if (y >= 0 && y < frameHeight && x >= 0 && x < frameWidth) resources[frameBuffer][x + y * frameWidth] = row[sprite].character;
});
