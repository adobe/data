// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The document's main model, the root of everything drawn: none until a document is made or loaded. */
export const mainModel = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [mainModel]: { type: Entity };
    }
}
