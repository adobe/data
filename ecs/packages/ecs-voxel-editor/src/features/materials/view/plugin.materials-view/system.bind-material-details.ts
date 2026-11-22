// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { layer, Material, materials, materialsRevision, selectedMaterial, selectedPaint } from "../../model/index.js";
import { baseColor, metallic, name, roughness } from "../../model/index.js";
import { materialDetails } from "./resource.material-details.js";

/** Writes the selected material's properties, or in paint mode the selected paint's, to the details, as the selection, a material or the materials change. */
export const bindMaterialDetails: System = System.create({
    readonly: true,
    resources: { is: [materialDetails], changed: [materialDetails, selectedMaterial, selectedPaint, layer, materialsRevision] },
    lookup: { material: { with: [...Material] }, all: { index: materials, changed: true } },
}, ({ resources, lookup }) => {
    const selected = resources[layer] === "paint" ? resources[selectedPaint] : resources[selectedMaterial];
    const row = lookup.material(selected);
    resources[materialDetails].material = row === null ? null : {
        id: selected, name: row[name], color: hexOf(row[baseColor]),
        metallic: row[metallic], roughness: row[roughness],
    };
});

/** A linear color as sRGB `#rrggbb`. */
const hexOf = (color: ArrayLike<number>): string => `#${[0, 1, 2].map(i => Math.round(255 * Math.min(Math.max(color[i] ?? 0, 0), 1) ** (1 / 2.2)).toString(16).padStart(2, "0")).join("")}`;
