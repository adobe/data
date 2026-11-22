// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { Voxel } from "./archetype.voxel.js";
import { parent } from "./component.parent.js";

/** The voxels of a model, `lookup(model)`, or of every model, `lookup()`. */
export const voxels = Index.create({ key: [parent], sorted: true, components: { with: [...Voxel] } });
