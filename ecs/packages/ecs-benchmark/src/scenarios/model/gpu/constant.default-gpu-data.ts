// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "@adobe/ecs";
import type { gpuData } from "./component.gpu-data.js";

/** `DataComponent()`, as `defaultData` is, its `dingy` an f32. */
export const defaultGpuData: Component<typeof gpuData> = { thingy: 0, dingy: 0, mingy: false, seed: 340383, rng: [340396, 340384, 174278660, 28672], numgy: 1960634880 };
