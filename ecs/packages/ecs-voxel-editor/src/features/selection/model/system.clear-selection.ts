// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editing, mainModel } from "../../voxels/model/index.js";
import { faces } from "./index.faces.js";

/** Deselects every face of the model being edited. */
export const clearSelection: System = System.create({
    lookup: { faces: { index: faces } },
}, ({ lookup, commands, resources }) => {
    const selected = lookup.faces(resources[editing]?.model ?? resources[mainModel]);
    for (let i = 0; i < selected.length; i++) commands.despawn(selected.at(i).entity);
});
