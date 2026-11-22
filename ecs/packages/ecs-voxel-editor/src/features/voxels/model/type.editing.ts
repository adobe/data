// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/**
 * Which model is being edited: `root`, the main model or another shown alone, and the first `depth` of `chain`, the
 * instances entered from it, each placed in the model of the one before; `model` is the last one's model, or `root` for
 * none. It's plain data of a fixed size, so the systems reading it may run with the page's objects or the GPU's alike;
 * `chainOf` and `editingOf` read and make it.
 */
export type Editing = {
    readonly root: Entity;
    readonly model: Entity;
    readonly depth: number;
    readonly chain: readonly [Entity, Entity, Entity, Entity, Entity, Entity, Entity, Entity];
};
