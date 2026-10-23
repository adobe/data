// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Index } from "../../interface/indexes/index-type.js";
import { Observe } from "../../observe/index.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { backToBack } from "./loop.js";
import type { U32 } from "../../interface/math/index.js";

const rank = Symbol("indexOrderTest/rank");
const lane = Symbol("indexOrderTest/lane");
const weight = Symbol("indexOrderTest/weight");
const extra = Symbol("indexOrderTest/extra");
const marker = Symbol("indexOrderTest/marker");

declare module "@adobe/ecs" {
    interface Components {
        [rank]: { type: number };
        [lane]: { type: U32 };
        [weight]: { type: number };
        [extra]: { type: true };
        [marker]: { type: number };
    }
}

/** By lane, then rank, of the entities that have a weight. */
const ranked = Index.create({ name: "indexOrderTest/ranked", key: [lane, rank], sorted: true, components: { has: [weight] } });

/** Each row's lane and rank as one number, in the order rows ran. */
let order: number[] = [];
const visit = System.create({ name: "indexOrderTest/visit", components: { read: [lane, rank] }, order: ranked }, row => {
    order.push(row[lane] * 1000 + row[rank]);
});
const visitChanged = System.create({ name: "indexOrderTest/visitChanged", components: { read: [lane, rank], changed: [weight] }, order: ranked }, row => {
    order.push(row[lane] * 1000 + row[rank]);
});
/** A kernel spawning a marker for each row in turn, so the markers' entities, in order, are the rows' order. */
const markEach = System.create({ name: "indexOrderTest/markEach", kernel: "cpu", components: { read: [lane, rank] }, order: ranked }, (row, { commands }) => {
    commands.spawn([marker])({ [marker]: row[lane] * 1000 + row[rank] });
});
const markChanged = System.create({ name: "indexOrderTest/markChanged", kernel: "cpu", components: { read: [lane, rank], changed: [weight] }, order: ranked }, (row, { commands }) => {
    commands.spawn([marker])({ [marker]: row[lane] * 1000 + row[rank] });
});
const keepTicking = System.create({ name: "indexOrderTest/keepTicking" }, () => {});

/** Changes the weight of every row whose weight ends in 3, a tenth of them. */
const nudge = System.create({ name: "indexOrderTest/nudge", components: { write: [weight] } }, row => {
    if (row[weight] % 10 === 3) row[weight] = row[weight] + 1;
});

/** Entities in two archetypes, interleaved in the index's order, some without the weight the index requires. */
const seed = System.create({ name: "indexOrderTest/seed" }, ({ commands }, input: { readonly count: number }) => {
    for (let k = 0; k < input.count; k++) {
        const values = { [lane]: k % 3, [rank]: (k * 37) % 101, [weight]: k };
        if (k % 5 === 4) commands.spawn([lane, rank])({ [lane]: k % 3, [rank]: (k * 37) % 101 });
        else if (k % 2 === 0) commands.spawn([lane, rank, weight, extra])(values);
        else commands.spawn([lane, rank, weight])(values);
    }
});

/** The lane and rank of every entity holding a weight, sorted by them, then by entity: the index's order. */
const expected = async (world: CreatedWorld, only?: (weighed: number) => boolean): Promise<number[]> => {
    const entities = await Observe.toPromise(Observe.select(world, { required: [lane, rank, weight] }));
    const rows = await Promise.all(entities.map(async entity => ({ entity, values: await Observe.toPromise(Observe.entity(world, entity, { required: [lane, rank, weight] })) })));
    return rows
        .flatMap(({ entity, values }) => values === null || (only !== undefined && !only(values[weight])) ? [] : [{ entity, key: values[lane] * 1000 + values[rank] }])
        .sort((a, b) => a.key - b.key || (a.entity >>> 0) - (b.entity >>> 0))
        .map(({ key }) => key);
};

const markerValues: number[] = [];
const readMarkers = System.create({ name: "indexOrderTest/readMarkers", observer: true, components: { read: [marker] } }, row => { markerValues.push(row[marker]); });

/** Markers' values in the order they were spawned: their archetype's rows', in storage order. */
const markers = async (world: CreatedWorld): Promise<number[]> => {
    markerValues.length = 0;
    await world.run(readMarkers);
    return [...markerValues];
};

describe("systems ordering their rows by a sorted index", () => {
    it("run the rows it holds in key order, then entity order, across archetypes, skipping rows it doesn't hold", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 300 });
        order = [];
        await world.run(visit);
        expect(order).toEqual(await expected(world));
        expect(order.length).toBe(240);
    });
    it("with change filters, run the rows that pass, in the index's order, whether few or most passed", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 3000 });
        await world.run(visitChanged);
        await world.run(nudge);
        order = [];
        await world.run(visitChanged);
        expect(order).toEqual(await expected(world, weighed => weighed % 10 === 4));
        expect(order.length).toBeGreaterThan(100);
        // Most rows change: the index is scanned rather than the rows' positions sorted.
        await world.run(System.create({ components: { write: [weight] } }, row => { row[weight] = row[weight] + 2; }));
        order = [];
        await world.run(visitChanged);
        expect(order).toEqual(await expected(world));
    });
    it.each([[true], [false]])("give kernels' rows, commands included, in the index's order, WASM %s", async wasm => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(seed, { count: 300 });
        await world.run(markEach);
        expect(await markers(world)).toEqual(await expected(world));
    });
    it.each([[true], [false]])("give kernels' rows that pass their change filters in the index's order, WASM %s", async wasm => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(seed, { count: 3000 });
        await world.run(markChanged);
        const before = (await markers(world)).length;
        await world.run(nudge);
        await world.run(markChanged);
        expect((await markers(world)).slice(before)).toEqual(await expected(world, weighed => weighed % 10 === 4));
    });
    it("hold their index while registered and release it with them", async () => {
        const driver = backToBack();
        await using world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
        await world.run(seed, { count: 10 });
        /** Once `count` more ticks ran. */
        const ticks = async (count: number): Promise<void> => {
            const first = (await Observe.toPromise(Observe.resource(world, clock))).tick;
            await new Promise<void>(resolve => {
                const stop = Observe.resource(world, clock)(({ tick }) => {
                    if (tick < first + count) return;
                    queueMicrotask(() => stop());
                    resolve();
                });
            });
        };
        // Ticks run only while a system is added.
        world.add(keepTicking);
        await ticks(1);
        const before = (await world.tables()).indexes;
        world.add(visit);
        await ticks(2);
        expect((await world.tables()).indexes).toBe(before + 1);
        world.remove(visit);
        await ticks(2);
        expect((await world.tables()).indexes).toBe(before);
        driver.close();
    });
});
