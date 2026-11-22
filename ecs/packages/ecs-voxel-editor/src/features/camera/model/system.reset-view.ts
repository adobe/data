// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, scale, size } from "../../voxels/model/index.js";
import { framing } from "./internal/function.framing.js";
import { camera } from "./resource.camera.js";

/** Turns the camera back to the view the app starts with, the camera's default turn, framing the model being edited. */
export const resetView: System = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] } },
}, ({ lookup, resources }) => {
    const turned = { ...resources[camera], rotation: startingRotation };
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    resources[camera] = frame === null ? turned : framing(turned, frame);
});

/** The camera resource's default turn: looking down a little at the front and right. */
const startingRotation: readonly [number, number, number, number] = [-0.23635, 0.28633, 0.07311, 0.92564];
