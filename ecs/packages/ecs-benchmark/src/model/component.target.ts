// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The entity a probe gets components of: the suite's vector of entities, one probe per element, in its order. */
export const target = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [target]: { type: Entity };
    }
}
