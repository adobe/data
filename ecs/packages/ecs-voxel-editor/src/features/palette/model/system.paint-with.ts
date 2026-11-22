// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { paintModel } from "../../edit/model/index.js";
import { model } from "../../voxels/model/index.js";

/** Picks a model to place instances of as extruding fills; one that isn't a model changes nothing. */
export const paintWith: System<{ readonly model: Entity }> = System.create({
    lookup: { models: { with: [model] } },
}, ({ lookup, resources }, input: { readonly model: Entity }) => {
    if (lookup.models(input.model) !== null && resources[paintModel] !== input.model) resources[paintModel] = input.model;
});
