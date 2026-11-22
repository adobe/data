// © 2026 Adobe. MIT License. See /LICENSE for details.
import { material } from "./component.material.js";
import { paint } from "./component.paint.js";
import { paintedFaces } from "./component.painted-faces.js";
import { parent } from "./component.parent.js";
import { position } from "./component.position.js";
import { voxel } from "./component.voxel.js";

/** What a voxel spawns with. */
export const Voxel = [voxel, position, material, paint, paintedFaces, parent] as const;
