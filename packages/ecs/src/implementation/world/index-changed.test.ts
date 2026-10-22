import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Index } from "../../interface/indexes/index-type.js";
import { Resource } from "../../interface/resource/resource.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";

// An index lookup's `changed: true`: the index's entries changing is a change filter of its system.

const group = Symbol("indexChangedTest/group");
const weight = Symbol("indexChangedTest/weight");
const total = Symbol("indexChangedTest/total");
const paused = Symbol("indexChangedTest/paused");

declare module "@adobe/ecs" {
    interface Components {
        [group]: { type: number };
        [weight]: { type: number };
        [total]: { type: number };
    }
    interface Resources {
        [paused]: { type: boolean };
    }
}
Component.register(group, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(weight, { type: { type: "number" } });
Component.register(total, { type: { type: "number" } });
Resource.register(paused, { type: { type: "boolean", default: false } });

const byGroup = Index.create({ name: "indexChangedTest/byGroup", key: [group], components: { has: [weight] } });
const inOrder = Index.create({ name: "indexChangedTest/inOrder", key: [group], sorted: true });
const weighted = Index.create({ name: "indexChangedTest/weighted", key: [], components: { has: [weight] } });

const one = { type: "object", properties: { entity: Entity.schema, value: { type: "number" } } } as const;
const entityOnly = { type: "object", properties: { entity: Entity.schema } } as const;
let spawned: Entity[] = [];
const spawn = System.create({ name: "indexChangedTest/spawn", input: { type: "object", properties: { groups: { type: "array", items: { type: "integer" } } } } }, ({ input, commands }) => {
    for (const value of input.groups) spawned.push(commands.spawn([group, weight, total])({ [group]: value, [weight]: 1, [total]: 0 }));
});
const setGroup = System.create({ name: "indexChangedTest/setGroup", input: one, target: "entity", components: { write: [group] } }, (row, { input }) => {
    row[group] = input.value;
});
const setWeight = System.create({ name: "indexChangedTest/setWeight", input: one, target: "entity", components: { write: [weight] } }, (row, { input }) => {
    row[weight] = input.value;
});
const despawn = System.create({ name: "indexChangedTest/despawn", input: entityOnly, target: "entity", components: { has: [group] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
const dropWeight = System.create({ name: "indexChangedTest/dropWeight", input: entityOnly, target: "entity", components: { has: [weight] } }, (row, { commands }) => {
    commands.remove(row.entity, weight);
});
const pause = System.create({ name: "indexChangedTest/pause", input: { type: "object", properties: { paused: { type: "boolean" } } }, resources: { write: [paused] } }, ({ input, resources }) => {
    resources[paused] = input.paused;
});

/** What each run of a gated system saw: its lists' lengths and `changed` for groups 1 and 2. */
let seen: string[] = [];
const counting = System.create({ name: "indexChangedTest/counting", lookup: { byGroup: { index: byGroup, changed: true } } }, ({ lookup }) => {
    const first = lookup.byGroup(1);
    const second = lookup.byGroup(2);
    seen.push(`${first.length}${first.changed ? "*" : ""} ${second.length}${second.changed ? "*" : ""}`);
});

/** Each row's total: how many rows share its group, by hundreds, and its weight; run only when the groups changed. */
const tally = System.create({
    name: "indexChangedTest/tally", kernel: "cpu",
    components: { read: [group, weight], write: [total] },
    lookup: { byGroup: { index: byGroup, changed: true } },
}, (row, { lookup }) => {
    row[total] = lookup.byGroup(row[group]).length * 100 + row[weight];
});

const inline = () => createWorld({ [workers]: 0 });

/** Runs `system`, then what `counting`-like systems saw, emptied. */
const after = async (run: Promise<number>): Promise<string[]> => {
    await run;
    const found = seen;
    seen = [];
    return found;
};

describe("an index lookup's changed: true", () => {
    it("runs its system on its first run, then only once an entity entered or left the index or moved to another key", async () => {
        await using world = inline();
        spawned = [];
        seen = [];
        await world.run(spawn, { groups: [1, 1, 2] });
        const [a, b] = spawned;
        expect(await after(world.run(counting))).toEqual(["2* 1*"]);
        expect(await after(world.run(counting))).toEqual([]);
        // What the index holds by doesn't change: a value it doesn't key on, or its key written the same.
        await world.run(setWeight, { entity: a, value: 5 });
        await world.run(setGroup, { entity: a, value: 1 });
        expect(await after(world.run(counting))).toEqual([]);
        // Moved to another key; its lists' changed reports which.
        await world.run(setGroup, { entity: b, value: 2 });
        expect(await after(world.run(counting))).toEqual(["1* 2*"]);
        await world.run(spawn, { groups: [3] });
        expect(await after(world.run(counting))).toEqual(["1 2"]);
        await world.run(despawn, { entity: a });
        expect(await after(world.run(counting))).toEqual(["0* 2"]);
        // Left the index, losing what it has.
        await world.run(dropWeight, { entity: b });
        expect(await after(world.run(counting))).toEqual(["0 1*"]);
        expect(await after(world.run(counting))).toEqual([]);
    });

    it("runs an observer system after the passes in which the index's entries changed, by position in a sorted one", async () => {
        await using world = inline();
        spawned = [];
        const orders: string[] = [];
        const ordering = System.create({ name: "indexChangedTest/ordering", observer: true, lookup: { inOrder: { index: inOrder, changed: true } } }, ({ lookup }) => {
            const all = lookup.inOrder();
            const groups: number[] = [];
            for (let i = 0; i < all.length; i++) groups.push(all.at(i).entity === spawned[0] ? -1 : 0);
            orders.push(groups.join(","));
        });
        await world.run(spawn, { groups: [1, 2] });
        world.add(ordering);
        await world.run(ordering);
        expect(orders).toEqual(["-1,0"]);
        await world.run(setWeight, { entity: spawned[0], value: 3 });
        await world.run(setGroup, { entity: spawned[0], value: 1 });
        expect(orders).toEqual(["-1,0"]);
        await world.run(setGroup, { entity: spawned[0], value: 5 });
        expect(orders).toEqual(["-1,0", "0,-1"]);
        world.remove(ordering);
    });

    it("keeps its system's lastRun while skipped, as a failed condition does", async () => {
        await using world = inline();
        spawned = [];
        const flags: boolean[] = [];
        const watching = System.create({
            name: "indexChangedTest/watching",
            lookup: { byGroup: { index: byGroup, changed: true }, weights: { read: [weight], changed: [weight] } },
        }, ({ lookup }) => {
            flags.push(lookup.weights(spawned[0])?.changed ?? false);
        });
        await world.run(spawn, { groups: [1, 2] });
        await world.run(watching);
        await world.run(setWeight, { entity: spawned[0], value: 7 });
        await world.run(watching);
        expect(flags).toEqual([true]);
        await world.run(setGroup, { entity: spawned[1], value: 3 });
        await world.run(watching);
        // Since its last run, not the skipped one, the first entity's weight changed.
        expect(flags).toEqual([true, true]);
    });

    it("passes every row when the index changed, and otherwise the rows its other change filters pass", async () => {
        await using world = inline();
        spawned = [];
        const rows: number[] = [];
        const filtering = System.create({
            name: "indexChangedTest/filtering",
            components: { read: [weight], changed: [weight] },
            lookup: { byGroup: { index: byGroup, changed: true } },
        }, row => {
            rows.push(row[weight]);
        });
        await world.run(spawn, { groups: [1, 2, 3] });
        await world.run(filtering);
        expect(rows).toEqual([1, 1, 1]);
        rows.length = 0;
        await world.run(setWeight, { entity: spawned[1], value: 4 });
        await world.run(filtering);
        expect(rows).toEqual([4]);
        rows.length = 0;
        await world.run(setGroup, { entity: spawned[2], value: 1 });
        await world.run(filtering);
        expect(rows).toEqual([1, 4, 1]);
        rows.length = 0;
        await world.run(filtering);
        expect(rows).toEqual([]);
    });

    it("runs when any of its indexes changed, and not while a condition fails, seeing the change once it holds", async () => {
        await using world = inline();
        spawned = [];
        let runs = 0;
        const both = System.create({
            name: "indexChangedTest/both",
            resources: { not: [paused] },
            lookup: { byGroup: { index: byGroup, changed: true }, weighted: { index: weighted, changed: true } },
        }, () => {
            runs++;
        });
        await world.run(spawn, { groups: [1, 2] });
        await world.run(both);
        expect(runs).toBe(1);
        // Only `weighted` changes: it holds every entity with weight, whatever its group.
        await world.run(dropWeight, { entity: spawned[0] });
        await world.run(both);
        expect(runs).toBe(2);
        await world.run(pause, { paused: true });
        await world.run(setGroup, { entity: spawned[1], value: 3 });
        await world.run(both);
        expect(runs).toBe(2);
        await world.run(pause, { paused: false });
        await world.run(both);
        expect(runs).toBe(3);
        await world.run(both);
        expect(runs).toBe(3);
    });

    it("skips a CPU kernel's run in which its index didn't change", async () => {
        await using world = inline();
        spawned = [];
        const totals: number[] = [];
        const readTotals = System.create({ name: "indexChangedTest/readTotals", observer: true, components: { read: [total] } }, row => {
            totals.push(row[total]);
        });
        const totalsOf = async (): Promise<number[]> => {
            totals.length = 0;
            await world.run(readTotals);
            return [...totals];
        };
        await world.run(spawn, { groups: [1, 1, 2] });
        await world.run(tally);
        expect(await totalsOf()).toEqual([201, 201, 101]);
        await world.run(setWeight, { entity: spawned[0], value: 5 });
        await world.run(tally);
        expect(await totalsOf()).toEqual([201, 201, 101]);
        await world.run(setGroup, { entity: spawned[1], value: 2 });
        await world.run(tally);
        expect(await totalsOf()).toEqual([105, 201, 201]);
    });

    it("is only for a system's index lookups", () => {
        const untypedSystem = (declaration: object): unknown => Reflect.apply(System.create, undefined, [declaration, () => {}]);
        const untypedFinalizer = (declaration: object): unknown => Reflect.apply(Finalizer.create, undefined, [declaration, () => {}]);
        expect(() => untypedSystem({ name: "indexChangedTest/byEntity", lookup: { weights: { read: [weight], changed: true } } }))
            .toThrow(`System "indexChangedTest/byEntity": lookup "weights"'s changed is true, which only an index lookup takes; name the components it watches.`);
        expect(() => untypedFinalizer({ name: "indexChangedTest/finalizer", components: { read: [group] }, lookup: { byGroup: { index: byGroup, changed: true } } }))
            .toThrow(`Finalizer "indexChangedTest/finalizer": lookup "byGroup"'s changed is true, which only a system's index lookup takes; a finalizer runs on each entity that stops matching.`);
    });
});
