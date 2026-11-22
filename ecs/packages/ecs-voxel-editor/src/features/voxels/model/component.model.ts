// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks an entity as a model: a grid of voxels, which instances place within other models. */
export const model = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [model]: { type: true };
    }
}
