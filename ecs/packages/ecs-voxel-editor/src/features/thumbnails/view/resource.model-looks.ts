// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import type { ModelLook } from "./internal/type.model-look.js";

/** How each model of the document looks, for its thumbnail; replaced as voxels, instances or materials change. */
export const modelLooks = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [modelLooks]: { type: ReadonlyMap<Entity, ModelLook> | null; thread: "main" };
    }
}
