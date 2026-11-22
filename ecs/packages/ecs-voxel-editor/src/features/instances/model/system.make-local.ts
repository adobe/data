// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { source } from "../../voxels/model/index.js";

/** Makes a referenced model the document's own: saving keeps it in the document's file, no longer writing its library file. */
export const makeLocal: System<{ readonly model: Entity }> = System.create({
    lookup: { referenced: { with: [source] } },
}, ({ lookup, commands }, input: { readonly model: Entity }) => {
    if (lookup.referenced(input.model) !== null) commands.remove(input.model, source);
});
