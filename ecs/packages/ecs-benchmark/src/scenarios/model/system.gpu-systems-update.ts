// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { gpuDataSystem } from "./gpu/system.gpu-data-system.js";
import { gpuMovementSystem } from "./gpu/system.gpu-movement-system.js";

/** `systemsUpdate` as GPU kernels, its data's `dingy` an f32. */
export const gpuSystemsUpdate: System = System.create([gpuMovementSystem, gpuDataSystem]);
