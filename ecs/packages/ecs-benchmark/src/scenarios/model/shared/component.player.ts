// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";
import type { Random } from "./type.random.js";

/** `PlayerComponent`: its generator, and its `playerType`. */
export const player = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [player]: { type: { readonly rng: Random; readonly type: U32 } };
    }
}
