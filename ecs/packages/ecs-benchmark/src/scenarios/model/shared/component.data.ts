// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32, U32 } from "@adobe/ecs";
import type { Random } from "./type.random.js";

/** `DataComponent`, the suite's component three. */
export const data = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [data]: {
            type: { readonly thingy: I32; readonly dingy: number; readonly mingy: boolean; readonly seed: U32; readonly rng: Random; readonly numgy: U32 };
        };
    }
}
