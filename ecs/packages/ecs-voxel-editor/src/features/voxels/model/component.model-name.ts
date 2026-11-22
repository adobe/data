// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A model's name, unique in its document. */
export const modelName = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [modelName]: { type: string };
    }
}
