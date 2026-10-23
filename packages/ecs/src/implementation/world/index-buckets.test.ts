// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, type CreatedWorld } from "./create.js";
import type { U32 } from "../../interface/math/index.js";

// Long buckets of a hash index, which a change may leave unsorted until a list is read by position: every reader still
// gets each bucket's rows in entity order.

const group = Symbol("indexBucketsTest/group");
const serial = Symbol("indexBucketsTest/serial");
const hidden = Symbol("indexBucketsTest/hidden");
const extra = Symbol("indexBucketsTest/extra");
const reads = Symbol("indexBucketsTest/reads");
const sum = Symbol("indexBucketsTest/sum");
const sumByHand = Symbol("indexBucketsTest/sumByHand");

declare module "@adobe/ecs" {
    interface Components {
        [group]: { type: U32 };
        [serial]: { type: U32 };
        [hidden]: { type: true };
        [extra]: { type: true };
        [reads]: { type: U32 };
        [sum]: { type: number };
        [sumByHand]: { type: number };
    }
}

const groups = [0, 1, 2];
const byGroup = Index.create({ name: "indexBucketsTest/byGroup", key: [group], components: { has: [serial], not: [hidden] } });

/** What a reader saw: each bucket's length, or each bucket's rows as entity index and serial, in order. */
let lengths: number[] = [];
let rows: (readonly [number, number])[][] = [];
const readLengths = System.create({ name: "indexBucketsTest/readLengths", lookup: { byGroup: { index: byGroup } } }, ({ lookup }) => {
    lengths = groups.map(value => lookup.byGroup(value).length);
});
const readRows = System.create({ name: "indexBucketsTest/readRows", lookup: { byGroup: { index: byGroup, read: [serial] } } }, ({ lookup }) => {
    rows = groups.map(value => {
        const list = lookup.byGroup(value);
        const found: (readonly [number, number])[] = [];
        for (let i = 0; i < list.length; i++) {
            const row = list.at(i);
            found.push([row.entity >>> 0, row[serial]]);
        }
        return found;
    });
});

/** Each reader row's bucket's serials, each times its position plus one: a sum that tells the order. */
const orderSum = System.create({
    name: "indexBucketsTest/orderSum", kernel: "cpu",
    components: { read: [reads], write: [sum] },
    lookup: { byGroup: { index: byGroup, read: [serial] } },
}, (row, { lookup }) => {
    const list = lookup.byGroup(row[reads]);
    let total = 0;
    for (let i = 0; i < list.length; i++) total += (i + 1) * list.at(i)[serial];
    row[sum] = total;
});
const orderSumByHand = System.create({
    name: "indexBucketsTest/orderSumByHand",
    components: { read: [reads], write: [sumByHand] },
    lookup: { byGroup: { index: byGroup, read: [serial] } },
}, (row, { lookup }) => {
    const list = lookup.byGroup(row[reads]);
    let total = 0;
    for (let i = 0; i < list.length; i++) total += (i + 1) * list.at(i)[serial];
    row[sumByHand] = total;
});
let sums: { kernel: number[]; byHand: number[] } = { kernel: [], byHand: [] };
const readSums = System.create({ name: "indexBucketsTest/readSums", components: { read: [reads, sum, sumByHand] } }, row => {
    sums.kernel[row[reads]] = row[sum];
    sums.byHand[row[reads]] = row[sumByHand];
});
const spawnReaders = System.create({ name: "indexBucketsTest/spawnReaders" }, ({ commands }) => {
    for (const value of groups) commands.spawn([reads, sum, sumByHand])({ [reads]: value, [sum]: 0, [sumByHand]: 0 });
});

/** An entity as the test keeps it, and the changes a round makes. */
type Held = { group: number; readonly serial: number; hidden: boolean };
type Change =
    | { readonly kind: "spawn"; readonly group: number; readonly serial: number; readonly extra: boolean }
    | { readonly kind: "despawn" | "hide" | "show" | "extra" | "plain"; readonly entity: Entity }
    | { readonly kind: "group"; readonly entity: Entity; readonly group: number };

let spawned: Entity[] = [];
const apply = System.create({ name: "indexBucketsTest/apply" }, ({ commands }, input: { readonly changes: readonly Change[] }) => {
    spawned = [];
    for (const change of input.changes) {
        switch (change.kind) {
            case "spawn":
                spawned.push(change.extra
                    ? commands.spawn([group, serial, extra])({ [group]: change.group, [serial]: change.serial, [extra]: true })
                    : commands.spawn([group, serial])({ [group]: change.group, [serial]: change.serial }));
                break;
            case "despawn": commands.despawn(change.entity); break;
            case "hide": commands.add(change.entity, hidden); break;
            case "show": commands.remove(change.entity, hidden); break;
            case "extra": commands.add(change.entity, extra); break;
            case "plain": commands.remove(change.entity, extra); break;
            case "group": commands.add(change.entity, group, change.group); break;
        }
    }
});

/** A seeded generator of numbers in [0, 1). */
const generator = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/** The world and what it holds, as the test keeps it: entities by entity, and the next serial. */
type Scenario = { readonly world: CreatedWorld; readonly held: Map<Entity, Held>; next: number };

const applyChanges = async (scenario: Scenario, changes: readonly Change[]): Promise<void> => {
    await scenario.world.run(apply, { changes });
    let k = 0;
    for (const change of changes) {
        if (change.kind === "spawn") scenario.held.set(spawned[k++], { group: change.group, serial: change.serial, hidden: false });
        else if (change.kind === "despawn") scenario.held.delete(change.entity);
        else if (change.kind === "hide" || change.kind === "show") {
            const found = scenario.held.get(change.entity);
            if (found !== undefined) found.hidden = change.kind === "hide";
        }
        else if (change.kind === "group") {
            const found = scenario.held.get(change.entity);
            if (found !== undefined) found.group = change.group;
        }
    }
};

const spawnMany = (scenario: Scenario, count: number, groupOf: (k: number) => number): Change[] =>
    Array.from({ length: count }, (_, k): Change => ({ kind: "spawn", group: groupOf(k), serial: scenario.next++, extra: k % 3 === 0 }));

/** Each bucket's rows as the index must give them: by entity index. */
const expectedRows = (scenario: Scenario): (readonly [number, number])[][] => groups.map(value => [...scenario.held]
    .filter(([, held]) => held.group === value && !held.hidden)
    .map(([entity, held]): readonly [number, number] => [entity >>> 0, held.serial])
    .sort((a, b) => a[0] - b[0]));

const orderSumOf = (bucket: readonly (readonly [number, number])[]): number => bucket.reduce((total, [, value], i) => total + (i + 1) * value, 0);

const checkRows = async (scenario: Scenario): Promise<void> => {
    await scenario.world.run(readRows);
    expect(rows).toEqual(expectedRows(scenario));
};
const checkLengths = async (scenario: Scenario): Promise<void> => {
    await scenario.world.run(readLengths);
    expect(lengths).toEqual(expectedRows(scenario).map(bucket => bucket.length));
};

/** A round of random changes: entities moved between buckets, hidden and shown, given a tag and plain again, despawned and spawned. */
const randomChanges = (scenario: Scenario, next: () => number, count: number): Change[] => {
    const entities = [...scenario.held.keys()];
    const pick = (): Entity => entities[Math.floor(next() * entities.length)];
    const used = new Set<Entity>();
    const changes: Change[] = [];
    for (let k = 0; k < count; k++) {
        const entity = pick();
        const choice = next();
        if (choice < 0.08) {
            changes.push({ kind: "spawn", group: Math.floor(next() * 3), serial: scenario.next++, extra: next() < 0.5 });
            continue;
        }
        // One change an entity a round, so the test's model applies them as the sync point does.
        if (used.has(entity)) continue;
        used.add(entity);
        const held = scenario.held.get(entity);
        if (held === undefined) continue;
        if (choice < 0.6) changes.push({ kind: "group", entity, group: (held.group + 1 + Math.floor(next() * 2)) % 3 });
        else if (choice < 0.7) changes.push({ kind: "despawn", entity });
        else if (choice < 0.8) changes.push({ kind: held.hidden ? "show" : "hide", entity });
        else changes.push({ kind: next() < 0.5 ? "extra" : "plain", entity });
    }
    return changes;
};

const createScenario = (wasm = true): Scenario => ({ world: createWorld({ [workers]: 0 }, { wasm }), held: new Map(), next: 0 });

describe("a hash index's long buckets", () => {
    it.each([[1], [2], [3], [4]])("give their rows in entity order after random changes, read by length and by position, seed %i", async seed => {
        const scenario = createScenario();
        await using _world = scenario.world;
        const next = generator(seed);
        await applyChanges(scenario, spawnMany(scenario, 600, k => k % 3));
        await checkRows(scenario);
        for (let round = 0; round < 80; round++) {
            await applyChanges(scenario, randomChanges(scenario, next, Math.floor(next() * 60)));
            const mode = Math.floor(next() * 4);
            if (mode === 0 || mode === 2) await checkLengths(scenario);
            if (mode === 1 || mode === 2) await checkRows(scenario);
        }
        await checkRows(scenario);
        expect(expectedRows(scenario).every(bucket => bucket.length >= 64)).toBe(true);
    });
    it("give their rows in entity order after an entity leaves and comes back, and one moves between buckets each run", async () => {
        const scenario = createScenario();
        await using _world = scenario.world;
        await applyChanges(scenario, spawnMany(scenario, 300, k => k % 2));
        await checkRows(scenario);
        const entities = [...scenario.held.keys()];
        for (let k = 0; k < 400; k++) {
            const entity = entities[(k * 37) % entities.length];
            const held = scenario.held.get(entity);
            if (held === undefined) continue;
            await applyChanges(scenario, [k % 5 === 0 ? { kind: held.hidden ? "show" : "hide", entity } : { kind: "group", entity, group: 1 - held.group }]);
            if (k % 7 === 0) await checkRows(scenario);
            else await checkLengths(scenario);
        }
        await checkRows(scenario);
    });
    it("give their rows in entity order after a refresh that builds the index again, and changes after it", async () => {
        const scenario = createScenario();
        await using _world = scenario.world;
        await applyChanges(scenario, spawnMany(scenario, 6000, k => k % 3));
        await checkLengths(scenario);
        const next = generator(9);
        for (let round = 0; round < 6; round++) {
            await applyChanges(scenario, randomChanges(scenario, next, 30));
            await checkLengths(scenario);
            // More changes than a refresh patches: the index is built again, its unsorted buckets with it.
            const everyOther = [...scenario.held].filter((_, k) => k % 2 === round % 2).map(([entity, held]): Change => ({ kind: "group", entity, group: (held.group + 1) % 3 }));
            await applyChanges(scenario, [...randomChanges(scenario, next, 30).filter(change => change.kind === "spawn"), ...everyOther]);
            await checkLengths(scenario);
            await applyChanges(scenario, randomChanges(scenario, next, 30));
            await checkRows(scenario);
        }
    });
    it("give their rows in entity order after a build in phases, and changes after it", async () => {
        const scenario = createScenario();
        await using _world = scenario.world;
        // Enough entities for a build in phases (`rebuildPhased`).
        await applyChanges(scenario, spawnMany(scenario, 70_000, k => k % 2));
        await checkLengths(scenario);
        const next = generator(11);
        for (let round = 0; round < 4; round++) {
            await applyChanges(scenario, randomChanges(scenario, next, 50));
            await checkLengths(scenario);
            await applyChanges(scenario, randomChanges(scenario, next, 50));
            await checkRows(scenario);
        }
        expect((await scenario.world.tables()).phasedBuilds).toBeGreaterThan(0);
    });
});

describe.each([[true], [false]])("kernels reading a hash index's long buckets, WASM %s", wasm => {
    it("read their rows in entity order, as a main-thread system does, after changes left them unsorted", async () => {
        const scenario = createScenario(wasm);
        await using _world = scenario.world;
        await scenario.world.run(spawnReaders);
        await applyChanges(scenario, spawnMany(scenario, 600, k => k % 3));
        const next = generator(5);
        for (let round = 0; round < 12; round++) {
            await applyChanges(scenario, randomChanges(scenario, next, 40));
            // Read by length only, so the buckets stay unsorted for the kernel.
            await checkLengths(scenario);
            await scenario.world.run(orderSum);
            await scenario.world.run(orderSumByHand);
            sums = { kernel: [], byHand: [] };
            await scenario.world.run(readSums);
            const expected = expectedRows(scenario).map(orderSumOf);
            expect(sums.kernel).toEqual(expected);
            expect(sums.byHand).toEqual(expected);
        }
    });
});
