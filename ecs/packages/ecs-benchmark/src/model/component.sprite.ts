// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";

/** `SpriteComponent`: its `character`, a character code. */
export const sprite = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [sprite]: { type: { readonly character: U32 } };
    }
}
