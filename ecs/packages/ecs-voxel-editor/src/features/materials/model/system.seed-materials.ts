// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { Material } from "./archetype.material.js";
import { baseColor } from "./component.base-color.js";
import { isPaint } from "./component.is-paint.js";
import { metallic } from "./component.metallic.js";
import { name } from "./component.name.js";
import { roughness } from "./component.roughness.js";
import { standardMaterials } from "./system.seed-materials/constant.standard-materials.js";
import { standardPaints } from "./system.seed-materials/constant.standard-paints.js";
import { materials } from "./index.materials.js";
import { selectedMaterial } from "./resource.selected-material.js";
import { selectedPaint } from "./resource.selected-paint.js";

/**
 * Spawns each standard material and paint a world lacks, by name, so a document made before one was standard gains it,
 * and selects the first of each where none is.
 */
export const seedMaterials: System = System.create({
    lookup: { materials: { index: materials } },
}, ({ lookup, commands, resources }) => {
    const known = new Map<string, Entity>();
    const all = lookup.materials();
    for (let i = 0; i < all.length; i++) known.set(all.at(i)[name], all.at(i).entity);
    const spawn = commands.spawn(Material);
    const spawnPaint = commands.spawn([...Material, isPaint]);
    const seed = (list: typeof standardMaterials, paint: boolean): Entity => {
        let first = Entity.none;
        for (const each of list) {
            const values = { [name]: each.name, [baseColor]: each.baseColor, [metallic]: each.metallic, [roughness]: each.roughness };
            const entity = known.get(each.name) ?? (paint ? spawnPaint({ ...values, [isPaint]: true }) : spawn(values));
            if (first === Entity.none) first = entity;
        }
        return first;
    };
    const firstMaterial = seed(standardMaterials, false);
    const firstPaint = seed(standardPaints, true);
    if (resources[selectedMaterial] === Entity.none) resources[selectedMaterial] = firstMaterial;
    if (resources[selectedPaint] === Entity.none) resources[selectedPaint] = firstPaint;
});
