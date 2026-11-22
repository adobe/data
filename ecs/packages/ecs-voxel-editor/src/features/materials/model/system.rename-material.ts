// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { name } from "./component.name.js";
import { materials } from "./index.materials.js";
import { nameProblem } from "./internal/function.name-problem.js";
import { materialsRevision } from "./resource.materials-revision.js";

/** Renames a material; returns why it couldn't, null when it did or the name is its own. */
export const renameMaterial: System<{ readonly entity: Entity; readonly name: string }, string | null> = System.create({
    lookup: { materials: { index: materials } },
}, ({ lookup, commands, resources }, input: { readonly entity: Entity; readonly name: string }) => {
    const wanted = input.name.trim();
    const all = lookup.materials();
    const others: string[] = [];
    let current: string | null = null;
    for (let i = 0; i < all.length; i++) {
        if (all.at(i).entity === input.entity) current = all.at(i)[name];
        else others.push(all.at(i)[name]);
    }
    if (current === null || current === wanted) return null;
    const problem = nameProblem(wanted, others);
    if (problem !== null) return problem;
    commands.add(input.entity, name, wanted);
    resources[materialsRevision] += 1;
    return null;
});
