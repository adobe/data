// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/ecs";

/**
 * `DataComponent` for the GPU lane: `dingy` an f32, which GPU kernels hold, where the suite's is a double; laid out
 * for GPU storage, its boolean a word.
 */
export const gpuData = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [gpuData]: {
            type: Schema.Type<{
                type: "object";
                properties: {
                    thingy: { type: "integer"; minimum: -2147483648; maximum: 2147483647 };
                    dingy: { type: "number"; precision: 1 };
                    mingy: { type: "boolean" };
                    seed: { type: "integer"; minimum: 0; maximum: 4294967295 };
                    rng: { type: "array"; items: { type: "integer"; minimum: 0; maximum: 4294967295 }; minItems: 4; maxItems: 4 };
                    numgy: { type: "integer"; minimum: 0; maximum: 4294967295 };
                };
                layout: "storage";
            }>;
        };
    }
}
