// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import { decodeRuns } from "./function.decode-runs.js";
import type { Plan } from "./type.plan.js";

/**
 * Spawns what a plan loads, through `world`: its materials, merged by name into those the document has, keeping the
 * properties of one it has, and taking the one it has for one whose name differs only in case, which is an error; then
 * its models, their voxels, each painted where the plan paints its faces, and their
 * instances. Returns each model's entity by key, and the errors.
 */
export const applyPlan = (plan: Plan, world: {
    readonly materials: readonly { readonly name: string; readonly entity: Entity }[];
    readonly spawnMaterial: (material: Plan["materials"][number]) => Entity;
    readonly spawnModel: (model: Plan["models"][number]) => Entity;
    readonly unlockSize: (model: Entity) => void;
    readonly spawnVoxel: (model: Entity, cell: readonly [number, number, number], material: Entity, paint: Entity, paintedFaces: number) => void;
    readonly spawnInstance: (holder: Entity, of: Entity, position: readonly [number, number, number], rotation: readonly [number, number, number, number]) => void;
}): { readonly entities: ReadonlyMap<string, Entity>; readonly errors: readonly string[] } => {
    const errors = [...plan.errors];
    const byName = new Map(world.materials.map(each => [each.name, each.entity]));
    const byFolded = new Map(world.materials.map(each => [each.name.toLowerCase(), each.name]));
    for (const material of plan.materials) {
        if (byName.has(material.name)) continue;
        const folded = byFolded.get(material.name.toLowerCase());
        if (folded !== undefined) {
            errors.push(`Material "${material.name}" differs from "${folded}" only in case; using "${folded}".`);
            byName.set(material.name, byName.get(folded) ?? world.spawnMaterial(material));
            continue;
        }
        byName.set(material.name, world.spawnMaterial(material));
        byFolded.set(material.name.toLowerCase(), material.name);
    }
    const entities = new Map(plan.models.map(each => [each.key, world.spawnModel(each)]));
    for (const each of plan.models) {
        const spawned = entities.get(each.key);
        if (each.unlocked && spawned !== undefined) world.unlockSize(spawned);
    }
    for (const each of plan.models) {
        const holder = entities.get(each.key);
        if (holder === undefined) continue;
        const painted = new Map<string, { readonly coat: Entity; readonly sides: number }>();
        if (each.paints !== null) decodeRuns(each.size, each.paints, (x, y, z, entry) => {
            // An entry is the painted faces' bits, a space, then the paint's name.
            const [, bits = "63", name = entry] = /^(\d+) (.*)$/.exec(entry) ?? [];
            const coat = byName.get(name);
            if (coat !== undefined) painted.set(`${x},${y},${z}`, { coat, sides: Number(bits) & 63 });
        });
        decodeRuns(each.size, each.voxels, (x, y, z, name) => {
            const filling = byName.get(name);
            const coated = painted.get(`${x},${y},${z}`);
            if (filling !== undefined) world.spawnVoxel(holder, [x, y, z], filling, coated?.coat ?? filling, coated?.sides ?? 0);
        });
        for (const placed of each.instances) {
            const of = entities.get(placed.model);
            if (of !== undefined) world.spawnInstance(holder, of, placed.position, placed.rotation);
        }
    }
    return { entities, errors };
};
