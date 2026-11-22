// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, scale, size } from "../../voxels/model/index.js";
import { framing } from "./internal/function.framing.js";
import { camera } from "./resource.camera.js";

/** Frames the model being edited as editing moves to another, as entering an instance zooms into it. */
export const followEditing: System = System.create({
    resources: { changed: [editing] },
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] } },
}, ({ lookup, resources }) => {
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame !== null) resources[camera] = framing(resources[camera], frame);
});
