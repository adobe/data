// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { parent, position, voxel } from "../../../voxels/model/index.js";
import { materialSlot } from "./component.material-slot.js";
import { paintSlot } from "./component.paint-slot.js";

/** The voxels the scene draws, a model's together, in the order the render system draws them: `lookup(model)`. */
export const drawnVoxels = Index.create({ key: [parent], sorted: true, components: { with: [voxel, position, materialSlot, paintSlot] } });
