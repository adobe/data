// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const local = Symbol("upTreeTest/local");
const full = Symbol("upTreeTest/full");
const filtered = Symbol("upTreeTest/filtered");
const parent = Symbol("upTreeTest/parent");
const hidden = Symbol("upTreeTest/hidden");
const free = Symbol("upTreeTest/free");
const marked = Symbol("upTreeTest/marked");

declare module "@adobe/ecs" {
    interface Components {
        [local]: { type: number };
        [full]: { type: number };
        [filtered]: { type: number };
        [parent]: { type: Entity; reference: "weak" };
        [hidden]: { type: true };
        [free]: { type: number };
        [marked]: { type: true };
    }
}


const propagateFull = System.create({
    kernel: true,
    components: { with: [local, full], not: [hidden] },
    up: { through: parent },
}, (row, { up }) => {
    row[full] = (up === null ? 0 : up[full]) + row[local];
});
const propagateFiltered = System.create({
    kernel: true,
    components: { with: [local, filtered], changed: [local], not: [hidden] },
    up: { through: parent },
}, (row, { up }) => {
    row[filtered] = (up === null ? 0 : up[filtered]) + row[local];
});

/** As `propagateFiltered`, into `free`, over rows without `marked`: it agrees with the others until a marked row exists. */
const propagateUnmarked = System.create({
    kernel: true,
    components: { with: [local, free], changed: [local], not: [hidden, marked] },
    up: { through: parent },
}, (row, { up }) => {
    row[free] = (up === null ? 0 : up[free]) + row[local];
});

type Operation =
    | { readonly kind: "spawn"; readonly local: number; readonly parent: Entity | null }
    | { readonly kind: "despawn" | "hide" | "show" | "orphan"; readonly entity: Entity }
    | { readonly kind: "reparent"; readonly entity: Entity; readonly to: Entity }
    | { readonly kind: "set"; readonly entity: Entity; readonly local: number }
    | { readonly kind: "mark"; readonly entity: Entity };
const operations: Operation[] = [];
const apply = System.create({}, ({ commands }) => {
    for (const operation of operations.splice(0)) {
        switch (operation.kind) {
            case "spawn":
                if (operation.parent === null) commands.spawn([local, full, filtered, free])({ [local]: operation.local, [full]: 0, [filtered]: 0, [free]: 0 });
                else commands.spawn([local, full, filtered, free, parent])({ [local]: operation.local, [full]: 0, [filtered]: 0, [free]: 0, [parent]: operation.parent });
                break;
            case "despawn": commands.despawn(operation.entity); break;
            case "hide": commands.add(operation.entity, hidden, true); break;
            case "show": commands.remove(operation.entity, hidden); break;
            case "orphan": commands.remove(operation.entity, parent); break;
            case "reparent": commands.add(operation.entity, parent, operation.to); break;
            case "set": commands.add(operation.entity, local, operation.local); break;
            case "mark": commands.add(operation.entity, marked, true); break;
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
const expected = async (ecs: World, key: typeof full | typeof filtered | typeof free): Promise<Map<Entity, number>> => {
    const entities = await select(ecs, { required: [local] });
    const alive = new Set(entities);
    const isHidden = new Set(await select(ecs, { required: [hidden] }));
    if (key === free) for (const entity of await select(ecs, { required: [marked] })) isHidden.add(entity);
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

const actual = async (ecs: World, key: typeof full | typeof filtered | typeof free, rows: Iterable<Entity>): Promise<Map<Entity, number>> => {
    const entities = [...rows];
    const values = await readEach(ecs, entities, key);
    return new Map(entities.map((entity, i) => [entity, values[i] ?? 0]));
};

it.each([true, false])("keeps its tree current across spawns, despawns, reparents, cycles and matching changes, with WASM %s", async wasm => {
    await using ecs = createWorld({ [workers]: 0 }, { wasm });
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
            expect(await actual(ecs, key, want.keys()), `${String(key)}, frame ${frame}`).toEqual(want);
        }
    }
});

it.each([true, false])("keeps a tree `up`s share current while one runs less often and one stops agreeing on what matches, with WASM %s", async wasm => {
    await using ecs = createWorld({ [workers]: 0 }, { wasm });
    const random = generator(11);
    for (let k = 0; k < 30; k++) operations.push({ kind: "spawn", local: random(10), parent: null });
    await ecs.run(apply);
    for (let frame = 0; frame < 200; frame++) {
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
        // From here on, a marked archetype matches all but `propagateUnmarked`, which then keeps a tree of its own.
        if (frame >= 100 && random(4) === 0) operations.push({ kind: "mark", entity: any() });
        await ecs.run(apply);
        await ecs.run(propagateFull);
        if (frame % 7 === 0) await ecs.run(propagateFiltered);
        await ecs.run(propagateUnmarked);
        const checked = frame % 7 === 0 ? [full, filtered, free] as const : [full, free] as const;
        for (const key of checked) {
            const want = await expected(ecs, key);
            expect(await actual(ecs, key, want.keys()), `${String(key)}, frame ${frame}`).toEqual(want);
        }
    }
});

it("keeps a filtered `up` right that runs less often than its tree's other readers, across rebuilds", async () => {
    await using ecs = createWorld({ [workers]: 0 });
    for (let k = 0; k < 2_000; k++) operations.push({ kind: "spawn", local: 1 + k % 10, parent: null });
    await ecs.run(apply);
    const parents = await select(ecs, { required: [local] });
    for (const entity of parents) operations.push({ kind: "spawn", local: 1, parent: entity });
    await ecs.run(apply);
    await ecs.run(propagateFull);
    await ecs.run(propagateFiltered);
    // Hiding and showing every parent changes no child's own values: only the tree tells the filtered `up` they changed.
    // A few hundred a frame, so the tree builds again only every few frames, between the filtered `up`'s runs.
    for (let frame = 0; frame < 24; frame++) {
        for (const entity of parents.slice((frame >> 1) % 4 * 500, ((frame >> 1) % 4 + 1) * 500)) operations.push({ kind: frame % 2 === 0 ? "hide" : "show", entity });
        await ecs.run(apply);
        await ecs.run(propagateFull);
    }
    await ecs.run(propagateFiltered);
    for (const key of [full, filtered] as const) {
        const want = await expected(ecs, key);
        expect(await actual(ecs, key, want.keys()), String(key)).toEqual(want);
    }
});

let ranRows = 0;
/** As `propagateFiltered`, in JS, counting the rows it runs. */
const countFiltered = System.create({
    kernel: false,
    components: { with: [local, filtered], changed: [local], not: [hidden] },
    up: { through: parent },
}, (row, { up }) => {
    ranRows++;
    row[filtered] = (up === null ? 0 : up[filtered]) + row[local];
});

it("runs only the rows a filtered `up` needs while the journal holds what changed since its last run", async () => {
    await using ecs = createWorld({ [workers]: 0 });
    for (let k = 0; k < 4_000; k++) operations.push({ kind: "spawn", local: k % 10, parent: null });
    await ecs.run(apply);
    await ecs.run(countFiltered);
    const entities = await select(ecs, { required: [local] });
    const ran: number[] = [];
    for (let frame = 0; frame < 24; frame++) {
        // 250 a frame, a sixteenth of the journal: those shown again, and one set, pass.
        for (const entity of entities.slice((frame >> 1) % 8 * 250, ((frame >> 1) % 8 + 1) * 250)) operations.push({ kind: frame % 2 === 0 ? "hide" : "show", entity });
        operations.push({ kind: "set", entity: entities[3_999], local: frame });
        await ecs.run(apply);
        ranRows = 0;
        await ecs.run(countFiltered);
        ran.push(ranRows);
    }
    expect(ran.filter(rows => rows > 251)).toEqual([]);
    const want = await expected(ecs, filtered);
    expect(await actual(ecs, filtered, want.keys())).toEqual(want);
});

const camera = Symbol("upTreeTest/camera");
declare module "@adobe/ecs" {
    interface Resources {
        [camera]: { type: number; default: 0 };
    }
}
/** A filtered `up` every run of which is a whole pass, since the resource it filters on changes every frame. */
const layoutEveryFrame = System.create({
    kernel: false,
    components: { with: [local, filtered], changed: [local] },
    resources: { changed: [camera] },
    up: { through: parent },
}, (row, { up }) => {
    row[filtered] = (up === null ? 0 : up[filtered]) + row[local];
});
const moveCamera = System.create({}, ({ resources }) => {
    resources[camera] += 1;
});

/** Reparents `count` random entities under the first ten, `frames` times, running `each` after each, and gives the most `up`s held. */
const mostTouched = async (ecs: CreatedWorld, frames: number, count: number, each: () => Promise<unknown>): Promise<number> => {
    const entities = await select(ecs, { required: [local] });
    const random = generator(5);
    let most = 0;
    for (let frame = 0; frame < frames; frame++) {
        for (let k = 0; k < count; k++) operations.push({ kind: "reparent", entity: entities[10 + random(entities.length - 10)], to: entities[random(10)] });
        await ecs.run(apply);
        await each();
        most = Math.max(most, (await ecs.tables()).touched);
    }
    return most;
};

it("holds at most a journal's worth of changed entities for a filtered `up` whose runs are whole passes", async () => {
    await using ecs = createWorld({ [workers]: 0 });
    for (let k = 0; k < 4_000; k++) operations.push({ kind: "spawn", local: k % 10, parent: null });
    await ecs.run(apply);
    // The first run is a whole pass; the second, with nothing changed, a filtered one.
    await ecs.run(layoutEveryFrame);
    await ecs.run(layoutEveryFrame);
    const most = await mostTouched(ecs, 400, 100, async () => {
        await ecs.run(moveCamera);
        await ecs.run(layoutEveryFrame);
    });
    expect(most, "most held").toBeLessThanOrEqual(8_192);
    const want = await expected(ecs, filtered);
    expect(await actual(ecs, filtered, want.keys())).toEqual(want);
});

it("holds at most a journal's worth of changed entities for a filtered `up` that stopped running while its tree's other reader runs", async () => {
    await using ecs = createWorld({ [workers]: 0 });
    for (let k = 0; k < 4_000; k++) operations.push({ kind: "spawn", local: k % 10, parent: null });
    await ecs.run(apply);
    await ecs.run(propagateFull);
    await ecs.run(propagateFiltered);
    const most = await mostTouched(ecs, 600, 250, () => ecs.run(propagateFull));
    expect(most, "most held").toBeLessThanOrEqual(8_192);
    await ecs.run(propagateFiltered);
    for (const key of [full, filtered] as const) {
        const want = await expected(ecs, key);
        expect(await actual(ecs, key, want.keys()), String(key)).toEqual(want);
    }
});
