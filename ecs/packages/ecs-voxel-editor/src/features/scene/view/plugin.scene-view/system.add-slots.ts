// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { layer } from "../../../materials/model/index.js";
import { material, paint, paintedFaces, voxel } from "../../../voxels/model/index.js";
import { materialSlot } from "./component.material-slot.js";
import { paintSlot } from "./component.paint-slot.js";
import { materialTable } from "./resource.material-table.js";
import { bindMaterialTable } from "./system.bind-material-table.js";
import { refreshMaterialTable } from "./system.refresh-material-table.js";

/** Gives each voxel without them its material's slot and its paint's, so it can be drawn. */
export const addSlots: System = System.create({
    components: { with: [voxel, material, paint, paintedFaces], not: [materialSlot] },
    resources: { is: [materialTable] },
    after: [bindMaterialTable, refreshMaterialTable],
}, (row, { resources, commands }) => {
    const { slots } = resources[materialTable];
    commands.add(row.entity, materialSlot, slots.get(row[material]) ?? 0);
    commands.add(row.entity, paintSlot, ((slots.get(row[paint]) ?? 0) << 6 | (resources[layer] === "paint" ? row[paintedFaces] & 63 : 0)) >>> 0);
});
