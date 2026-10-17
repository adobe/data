import { expect, it } from "vitest";
import { Component } from "../../types/component/component.js";
import { Entity } from "../../types/entity/entity.js";
import { System } from "../../types/system/system.js";
import type { World } from "../../types/world/world.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const local = "upTreeTest/local";
const full = "upTreeTest/full";
const filtered = "upTreeTest/filtered";
const parent = "upTreeTest/parent";
const hidden = "upTreeTest/hidden";

declare module "@adobe/data-ecs" {
    interface Components {
        [local]: { type: number };
        [full]: { type: number };
        [filtered]: { type: number };
        [parent]: { type: Entity; reference: "weak" };
        [hidden]: { type: true };
    }
}

Component.register(local, { type: { type: "number" } });
Component.register(full, { type: { type: "number" } });
Component.register(filtered, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "weak" });
Component.register(hidden, { type: { const: true } });

const propagateFull = System.create({
    name: "upTreeTest/propagateFull",
    kernel: "cpu",
    components: { read: [local], write: [full], not: [hidden] },
    up: { through: parent, read: [full] },
}, (row, { up }) => {
    row[full] = (up === null ? 0 : up[full]) + row[local];
});
const propagateFiltered = System.create({
    name: "upTreeTest/propagateFiltered",
    kernel: "cpu",
    components: { read: [local], write: [filtered], changed: [local], not: [hidden] },
    up: { through: parent, read: [filtered] },
}, (row, { up }) => {
    row[filtered] = (up === null ? 0 : up[filtered]) + row[local];
});

type Operation =
    | { readonly kind: "spawn"; readonly local: number; readonly parent: Entity | null }
    | { readonly kind: "despawn" | "hide" | "show" | "orphan"; readonly entity: Entity }
    | { readonly kind: "reparent"; readonly entity: Entity; readonly to: Entity }
    | { readonly kind: "set"; readonly entity: Entity; readonly local: number };
const operations: Operation[] = [];
const apply = System.create({ name: "upTreeTest/apply" }, ({ commands }) => {
    for (const operation of operations.splice(0)) {
        switch (operation.kind) {
            case "spawn":
                if (operation.parent === null) commands.spawn({ [local]: operation.local, [full]: 0, [filtered]: 0 });
                else commands.spawn({ [local]: operation.local, [full]: 0, [filtered]: 0, [parent]: operation.parent });
                break;
            case "despawn": commands.despawn(operation.entity); break;
            case "hide": commands.add(operation.entity, { [hidden]: true }); break;
            case "show": commands.remove(operation.entity, hidden); break;
            case "orphan": commands.remove(operation.entity, parent); break;
            case "reparent": commands.add(operation.entity, { [parent]: operation.to }); break;
            case "set": commands.add(operation.entity, { [local]: operation.local }); break;
        }
    }
});

/** A small deterministic generator, so a failure replays. */
const generator = (seed: number) => {
    let state = seed;
    return (limit: number): number => {
        state = (state * 1103515245 + 12345) % 2 ** 31;
        // The high bits: a power-of-two modulus leaves the low ones short cycles.
        return Math.floor((state / 2 ** 31) * limit);
    };
};

/** What each matched row outside a cycle should hold, from the world's current tree and the values it stores. */
const expected = async (ecs: World, key: typeof full | typeof filtered): Promise<Map<Entity, number>> => {
    const entities = await select(ecs, { required: [local] });
    const alive = new Set(entities);
    const isHidden = new Set(await select(ecs, { required: [hidden] }));
    // The walk reads only live entities, so one read of each component up front serves it.
    const byEntity = <T>(values: readonly T[]): Map<Entity, T> => new Map(entities.map((entity, i) => [entity, values[i]]));
    const parents = byEntity(await readEach(ecs, entities, parent));
    const locals = byEntity(await readEach(ecs, entities, local));
    const keys = byEntity(await readEach(ecs, entities, key));
    const parentOf = (entity: Entity): Entity | null => {
        const value = parents.get(entity);
        return value !== undefined && value !== null && alive.has(value) ? value : null;
    };
    const matched = (entity: Entity): boolean => alive.has(entity) && !isHidden.has(entity);
    const isCyclic = (entity: Entity): boolean => {
        const seen = new Set<Entity>();
        for (let current: Entity | null = entity; current !== null && matched(current); current = parentOf(current)) {
            if (seen.has(current)) return true;
            seen.add(current);
        }
        return false;
    };
    const values = new Map<Entity, number>();
    const valueOf = (entity: Entity): number => {
        if (!matched(entity) || isCyclic(entity)) return keys.get(entity) ?? 0;
        const known = values.get(entity);
        if (known !== undefined) return known;
        const up = parentOf(entity);
        const value = (up === null ? 0 : valueOf(up)) + (locals.get(entity) ?? 0);
        values.set(entity, value);
        return value;
    };
    const result = new Map<Entity, number>();
    for (const entity of entities) if (matched(entity) && !isCyclic(entity)) result.set(entity, valueOf(entity));
    return result;
};

const actual = async (ecs: World, key: typeof full | typeof filtered, rows: Iterable<Entity>): Promise<Map<Entity, number>> => {
    const entities = [...rows];
    const values = await readEach(ecs, entities, key);
    return new Map(entities.map((entity, i) => [entity, values[i] ?? 0]));
};

it.each([true, false])("keeps its tree current across spawns, despawns, reparents, cycles and matching changes, with WASM %s", async wasm => {
    await using ecs = createWorld({}, { wasm });
    const random = generator(7);
    for (let k = 0; k < 30; k++) operations.push({ kind: "spawn", local: random(10), parent: null });
    await ecs.run(apply);
    for (let frame = 0; frame < 300; frame++) {
        const entities = await select(ecs, { required: [local] });
        const any = (): Entity => entities[random(entities.length)];
        for (let k = 0; k < 4; k++) {
            switch (random(8)) {
                case 0: operations.push({ kind: "spawn", local: random(10), parent: random(4) === 0 ? null : any() }); break;
                case 1: if (entities.length > 20) operations.push({ kind: "despawn", entity: any() }); break;
                case 2: operations.push({ kind: random(2) === 0 ? "hide" : "show", entity: any() }); break;
                case 3: operations.push({ kind: "orphan", entity: any() }); break;
                case 4: case 5: operations.push({ kind: "reparent", entity: any(), to: any() }); break;
                default: operations.push({ kind: "set", entity: any(), local: random(10) });
            }
        }
        await ecs.run(apply);
        await ecs.run(propagateFull);
        await ecs.run(propagateFiltered);
        for (const key of [full, filtered] as const) {
            const want = await expected(ecs, key);
            expect(await actual(ecs, key, want.keys()), `${key}, frame ${frame}`).toEqual(want);
        }
    }
});
