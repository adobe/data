// © 2026 Adobe. MIT License. See /LICENSE for details.
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";
import { gpuData } from "./component.gpu-data.js";

/** `Full` with the GPU lane's data. */
export const GpuFull = [position, velocity, gpuData] as const;
