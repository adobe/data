// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { baseColor, Material, metallic, roughness } from "../../../materials/model/index.js";
import { materialTable } from "./resource.material-table.js";
import { bindMaterialTable } from "./system.bind-material-table.js";

/** Writes a material's new look into the table the GPU reads, as its color, metallic or roughness changes. */
export const refreshMaterialTable: System = System.create({
    components: { with: [...Material], changed: [baseColor, metallic, roughness] },
    after: [bindMaterialTable],
}, (row, { resources }) => {
    const table = resources[materialTable];
    const slot = table?.slots.get(row.entity);
    if (table === null) return;
    if (slot === undefined) return;
    const [r, g, b] = row[baseColor];
    const look = [r, g, b, row[metallic], row[roughness], 0, 0, 0];
    if (look.every((value, i) => table.values[slot * 8 + i] === value)) return;
    const values = [...table.values];
    values.splice(slot * 8, 8, ...look);
    resources[materialTable] = { slots: table.slots, values };
});
