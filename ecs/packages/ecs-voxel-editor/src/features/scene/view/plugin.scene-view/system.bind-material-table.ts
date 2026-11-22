// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { baseColor, materials, metallic, roughness } from "../../../materials/model/index.js";
import { materialTable } from "./resource.material-table.js";

/** Gives each material a slot in the table the GPU reads, with its color, metallic and roughness, as materials change. */
export const bindMaterialTable: System = System.create({
    lookup: { materials: { index: materials, changed: true } },
}, ({ lookup, resources }) => {
    const all = lookup.materials();
    const slots = new Map<Entity, number>();
    const values: number[] = [];
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        const [r, g, b] = row[baseColor];
        slots.set(row.entity, i);
        values.push(r, g, b, row[metallic], row[roughness], 0, 0, 0);
    }
    resources[materialTable] = { slots, values };
});
