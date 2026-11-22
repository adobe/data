// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Quat } from "@adobe/ecs";

/** An instance's rotation within the model it's placed in. */
export const rotation = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [rotation]: { type: Quat };
    }
}
