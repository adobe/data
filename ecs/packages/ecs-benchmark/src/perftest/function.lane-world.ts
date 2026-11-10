// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, World, workers } from "@adobe/ecs";
import type { Lane } from "./type.lane.js";

/** A new world for `lane`, its pool `threads` workers on the `threads` lane and none otherwise, on `device` on the `gpu` lane. */
export const laneWorld = (lane: Lane, threads: number, device: GPUDevice | null = null): World =>
    World.create({ [workers]: lane === "threads" ? threads : 0, ...lane === "gpu" ? { [gpuDevice]: device } : {} });
