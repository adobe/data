// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { camera } from "../../camera/model/index.js";
import { chainOf, editing, editingOf, Instance, instanceOf, instancesIn, mainModel, model, scale, size, voxelAt } from "../../voxels/model/index.js";
import { lookups } from "./internal/function.lookups.js";
import { pointed } from "./internal/function.pointed.js";
import type { Pointer } from "./internal/type.pointer.js";

/** Enters the instance under the pointer, placed in the model being edited, to edit its model there; returns whether it did. */
export const enterInstanceAt: System<Pointer, boolean> = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] }, placed: { index: instancesIn }, voxelAt: { index: voxelAt } },
}, ({ lookup, resources }, input: Pointer) => {
    const found = pointed(resources[camera], input, resources[editing], resources[mainModel], lookups(lookup.models, lookup.instances, lookup.placed, lookup.voxelAt));
    const entered = found === null ? null : lookup.instances(found.instance);
    if (found === null || entered === null) return false;
    resources[editing] = editingOf(found.editing.root, [...chainOf(found.editing), found.instance], entered[instanceOf]);
    return true;
});
