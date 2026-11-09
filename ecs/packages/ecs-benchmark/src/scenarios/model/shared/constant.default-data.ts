// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "@adobe/ecs";
import type { data } from "./component.data.js";

/** `DataComponent()`: its generator seeded with `seed`, then stepped once for `numgy`. */
export const defaultData: Component<typeof data> = { thingy: 0, dingy: 0, mingy: false, seed: 340383, rng: [340396, 340384, 174278660, 28672], numgy: 1960634880 };
