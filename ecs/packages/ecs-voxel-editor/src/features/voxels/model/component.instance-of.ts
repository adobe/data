// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The model an instance places: the instance is despawned with it. */
export const instanceOf = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [instanceOf]: { type: Entity; reference: "owner" };
    }
}
