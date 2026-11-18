// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, World, workers } from "@adobe/ecs";

/** A new world for `lane`, its pool `threads` workers on the `threads` lane and none otherwise, on `device` on the `gpu` lane. */
export const laneWorld = (lane: Lane, threads: number, device: GPUDevice | null = null): World =>
    World.create({ [workers]: lane === "threads" ? threads : 0, ...lane === "gpu" ? { [gpuDevice]: device } : {} });

/**
 * How a run uses the machine: `js`, kernels in JS on one thread, as a page without cross-origin isolation runs them;
 * `wasm`, kernels in WASM on one thread; `threads`, kernels in WASM on the worker pool; `gpu`, GPU kernels on the
 * page's GPU.
 */
type Lane = "js" | "wasm" | "threads" | "gpu";
