// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { modelNamed } from "../../voxels/model/index.js";

/** The model of a name, or none. */
export const modelOfName: System<{ readonly name: string }, Entity> = System.create({
    lookup: { models: { index: modelNamed } },
}, ({ lookup }, input: { readonly name: string }) => lookup.models(input.name)?.entity ?? Entity.none);
