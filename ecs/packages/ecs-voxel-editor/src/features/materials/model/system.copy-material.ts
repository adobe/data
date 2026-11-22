// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { Material } from "./archetype.material.js";
import { baseColor } from "./component.base-color.js";
import { isPaint } from "./component.is-paint.js";
import { metallic } from "./component.metallic.js";
import { name } from "./component.name.js";
import { roughness } from "./component.roughness.js";
import { materials } from "./index.materials.js";
import { nameProblem } from "./internal/function.name-problem.js";
import { selectedMaterial } from "./resource.selected-material.js";
import { selectedPaint } from "./resource.selected-paint.js";

/**
 * Adds a copy of a material, every property the same, named after it with the first number free, `stone 2`, and selects
 * it, so a new material starts from one like it, a paint's copy a paint; returns it, or none for an entity that isn't a material.
 */
export const copyMaterial: System<{ readonly entity: Entity }, Entity> = System.create({
    lookup: { materials: { index: materials }, material: { with: [...Material], optional: [isPaint] } },
}, ({ lookup, commands, resources }, input: { readonly entity: Entity }) => {
    const source = lookup.material(input.entity);
    if (source === null) return Entity.none;
    const all = lookup.materials();
    const taken: string[] = [];
    for (let i = 0; i < all.length; i++) taken.push(all.at(i)[name]);
    const base = source[name].replace(/ \d+$/, "");
    let wanted = base;
    for (let n = 2; nameProblem(wanted, taken) !== null; n++) wanted = `${base} ${n}`;
    const values = { [name]: wanted, [baseColor]: source[baseColor], [metallic]: source[metallic], [roughness]: source[roughness] };
    const paint = source[isPaint] === true;
    const copy = paint ? commands.spawn([...Material, isPaint])({ ...values, [isPaint]: true }) : commands.spawn(Material)(values);
    if (paint) resources[selectedPaint] = copy;
    else resources[selectedMaterial] = copy;
    return copy;
});
