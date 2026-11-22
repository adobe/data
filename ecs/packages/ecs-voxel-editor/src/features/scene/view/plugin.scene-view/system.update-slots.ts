// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { layer } from "../../../materials/model/index.js";
import { material, paint, paintedFaces, voxel } from "../../../voxels/model/index.js";
import { materialSlot } from "./component.material-slot.js";
import { paintSlot } from "./component.paint-slot.js";
import { materialTable } from "./resource.material-table.js";
import { bindMaterialTable } from "./system.bind-material-table.js";
import { refreshMaterialTable } from "./system.refresh-material-table.js";

/** Keeps each voxel's slots its material's and its paint's, as either, its painted faces, the mode or the table changes. */
export const updateSlots: System = System.create({
    components: { with: [voxel, material, paint, paintedFaces, materialSlot, paintSlot], changed: [material, paint, paintedFaces] },
    resources: { is: [materialTable], changed: [materialTable, layer] },
    after: [bindMaterialTable, refreshMaterialTable],
}, (row, { resources }) => {
    const { slots } = resources[materialTable];
    const slot = slots.get(row[material]) ?? 0;
    const painted = ((slots.get(row[paint]) ?? 0) << 6 | (resources[layer] === "paint" ? row[paintedFaces] & 63 : 0)) >>> 0;
    if (row[materialSlot] !== slot) row[materialSlot] = slot;
    if (row[paintSlot] !== painted) row[paintSlot] = painted;
});
