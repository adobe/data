// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { camera } from "../../camera/model/index.js";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, parent, scale, size, voxelAt } from "../../voxels/model/index.js";
import { SelectedFace } from "./archetype.selected-face.js";
import { faceCell } from "./component.face-cell.js";
import { faceSide } from "./component.face-side.js";
import { faceAt } from "./internal/index.face-at.js";
import { keyOf } from "./internal/function.key-of.js";
import { pick } from "./internal/function.pick.js";
import { drag } from "./internal/resource.drag.js";
import type { Pointer } from "./internal/type.pointer.js";

/**
 * Starts a selecting drag at the face under the pointer, toggling it: the drag then selects, or deselects, as it
 * became. Which faces it covers `dragSelect` decides as it moves, by the keys held then.
 */
export const pressSelect: System<Pointer> = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] }, voxelAt: { index: voxelAt }, faceAt: { index: faceAt } },
}, ({ lookup, resources, commands }, input: Pointer) => {
    if (resources[drag] !== null) resources[drag] = null;
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame === null) return;
    const { hit } = pick(resources[camera], input, frame, (holder, cell) => lookup.voxelAt(holder, cell) !== null);
    if (hit === null) return;
    const existing = lookup.faceAt(frame.model, hit.cell, hit.side);
    if (existing.length === 0) commands.spawn(SelectedFace)({ [parent]: frame.model, [faceCell]: hit.cell, [faceSide]: hit.side });
    else for (let i = 0; i < existing.length; i++) commands.despawn(existing.at(i).entity);
    const covered = new Map([[keyOf(hit), hit]]);
    resources[drag] = { model: frame.model, anchor: hit, select: existing.length === 0, painted: covered, changed: covered };
});

