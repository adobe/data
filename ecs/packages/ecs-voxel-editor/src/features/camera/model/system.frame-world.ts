// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, scale, size } from "../../voxels/model/index.js";
import { framing } from "./internal/function.framing.js";
import { camera } from "./resource.camera.js";

/** Aims the camera at the center of the model being edited, wherever it's placed, from far enough away to see all of it. */
export const frameWorld: System = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] } },
}, ({ lookup, resources }) => {
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame !== null) resources[camera] = framing(resources[camera], frame);
});
