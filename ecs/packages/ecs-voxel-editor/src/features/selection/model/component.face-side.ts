// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";

/** Which side of its cell a selected face is: `0` to `5` for `+x`, `-x`, `+y`, `-y`, `+z` and `-z`. */
export const faceSide = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [faceSide]: { type: U32 };
    }
}
