// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { gpuDamageSystem } from "./gpu/system.gpu-damage-system.js";
import { gpuDataSystem } from "./gpu/system.gpu-data-system.js";
import { gpuHealthSystem } from "./gpu/system.gpu-health-system.js";
import { gpuMoreComplexSystem } from "./gpu/system.gpu-more-complex-system.js";
import { gpuMovementSystem } from "./gpu/system.gpu-movement-system.js";
import { gpuRenderSystem } from "./gpu/system.gpu-render-system.js";
import { gpuSpriteSystem } from "./gpu/system.gpu-sprite-system.js";

/** `complexSystemsUpdate` as GPU kernels, its data's `dingy` an f32. */
export const gpuComplexSystemsUpdate: System = System.create([gpuMovementSystem, gpuDataSystem, gpuMoreComplexSystem, gpuHealthSystem, gpuDamageSystem, gpuSpriteSystem, gpuRenderSystem]);
