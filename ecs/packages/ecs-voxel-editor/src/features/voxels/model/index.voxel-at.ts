// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { material } from "./component.material.js";
import { parent } from "./component.parent.js";
import { position } from "./component.position.js";
import { voxel } from "./component.voxel.js";

/** The voxel at a model's cell: `lookup(model, [x, y, z])`, or null for an empty one. */
export const voxelAt = Index.create({ key: [parent, position], unique: true, components: { with: [voxel, material] } });
