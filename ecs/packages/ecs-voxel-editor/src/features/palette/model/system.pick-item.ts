// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { paintModel } from "../../edit/model/index.js";
import { isPaint, materialNamed, selectedMaterial, selectedPaint } from "../../materials/model/index.js";
import { modelNamed } from "../../voxels/model/index.js";

/**
 * Picks what extruding fills with, by a palette item's key: a material, `material:<name>`, to fill voxels of, or a
 * model, `model:<name>`, to place instances of; or, for a paint's key, what painting coats voxels with.
 */
export const pickItem: System<{ readonly key: string }> = System.create({
    lookup: { materials: { index: materialNamed }, paints: { with: [isPaint] }, models: { index: modelNamed } },
}, ({ lookup, resources }, input: { readonly key: string }) => {
    const [kind, ...rest] = input.key.split(":");
    const name = rest.join(":");
    if (kind === "material") {
        const found = lookup.materials(name);
        if (found === null) return;
        if (lookup.paints(found.entity) !== null) {
            resources[selectedPaint] = found.entity;
            return;
        }
        resources[selectedMaterial] = found.entity;
        if (resources[paintModel] !== Entity.none) resources[paintModel] = Entity.none;
    } else if (kind === "model") {
        const found = lookup.models(name);
        if (found !== null) resources[paintModel] = found.entity;
    }
});
