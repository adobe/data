// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { camera } from "../../camera/model/index.js";
import { editing, Instance, instancesIn, mainModel, model, scale, size, voxelAt } from "../../voxels/model/index.js";
import { lookups } from "./internal/function.lookups.js";
import { pointed } from "./internal/function.pointed.js";
import type { Pointer } from "./internal/type.pointer.js";

/** Removes the instance under the pointer, placed in the model being edited; its model stays in the document. */
export const deleteInstanceAt: System<Pointer> = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] }, placed: { index: instancesIn }, voxelAt: { index: voxelAt } },
}, ({ lookup, resources, commands }, input: Pointer) => {
    const found = pointed(resources[camera], input, resources[editing], resources[mainModel], lookups(lookup.models, lookup.instances, lookup.placed, lookup.voxelAt));
    if (found !== null) commands.despawn(found.instance);
});
