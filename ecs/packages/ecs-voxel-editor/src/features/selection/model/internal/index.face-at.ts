// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { parent } from "../../../voxels/model/index.js";
import { faceCell } from "../component.face-cell.js";
import { faceSide } from "../component.face-side.js";
import { face } from "./component.face.js";

/**
 * The selected faces at a model's cell's side: `lookup(model, [x, y, z], side)`, none when it isn't selected. Faces moved
 * by edits pass through each other, so several may be at one side at once.
 */
export const faceAt = Index.create({ key: [parent, faceCell, faceSide], components: { with: [face] } });
