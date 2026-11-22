// © 2026 Adobe. MIT License. See /LICENSE for details.
import { parent } from "../../voxels/model/index.js";
import { faceCell } from "./component.face-cell.js";
import { faceSide } from "./component.face-side.js";
import { face } from "./internal/component.face.js";

/** What a selected face spawns with: the model it's a face of, its `parent`, too. */
export const SelectedFace = [face, parent, faceCell, faceSide] as const;
