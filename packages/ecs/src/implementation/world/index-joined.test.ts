// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import { Observe } from "../../observe/index.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { backToBack } from "./loop.js";
import { dropReports, runReported } from "./reports.test-helper.js";

// Systems on a joined thread looking up through the world's indexes, the world and the thread on this one, against a
// world running them itself.

const cell = Symbol("indexJoinedTest/cell");
const weight = Symbol("indexJoinedTest/weight");
const serial = Symbol("indexJoinedTest/serial");
const target = Symbol("indexJoinedTest/target");
const lane = Symbol("indexJoinedTest/lane");
const rank = Symbol("indexJoinedTest/rank");
const label = Symbol("indexJoinedTest/label");
const name = Symbol("indexJoinedTest/name");
const title = Symbol("indexJoinedTest/title");
const band = Symbol("indexJoinedTest/band");
const bandReader = Symbol("indexJoinedTest/bandReader");

declare module "@adobe/ecs" {
    export interface Threads {
        indexJoinedTest: true;
    }
    interface Components {
        [cell]: { type: readonly [number, number] };
        [weight]: { type: number };
        [serial]: { type: number };
        [target]: { type: number };
        [lane]: { type: number };
        [rank]: { type: number };
        [label]: { type: { readonly text: string }; thread: "indexJoinedTest" };
        [name]: { type: { readonly text: string }; thread: "indexJoinedTest" };
        [title]: { type: string };
        [band]: { type: number };
        [bandReader]: { type: true };
    }
}
Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -1000, maximum: 1000 }, minItems: 2, maxItems: 2 } });
Component.register(weight, { type: { type: "number" } });
Component.register(serial, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(target, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(lane, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(rank, { type: { type: "number" } });
const text = { type: "object", properties: { text: { type: "string" } } } as const;
/** A label's start, which a command here gives it by this value. */
const blank = { text: "" };
Component.register(label, { type: { ...text, default: blank }, thread: "indexJoinedTest" });
Component.register(name, { type: text, thread: "indexJoinedTest" });
Component.register(title, { type: { type: "string" } });
Component.register(band, { type: { type: "integer", minimum: 0, maximum: 1 } });
Component.register(bandReader, { type: { const: true } });

const grid = Index.create({ name: "indexJoinedTest/grid", key: [cell], components: { has: [weight] } });
const serials = Index.create({ name: "indexJoinedTest/serials", key: [serial], unique: true, components: { has: [weight] } });
const lanes = Index.create({ name: "indexJoinedTest/lanes", key: [lane, rank], sorted: true });
const names = Index.create({ name: "indexJoinedTest/names", key: [name] });
const titles = Index.create({ name: "indexJoinedTest/titles", key: [title] });
const weighted = Index.create({ name: "indexJoinedTest/weighted", key: [], components: { has: [weight] } });
/** Two long buckets, which changes leave unsorted until a list is read by position. */
const bands = Index.create({ name: "indexJoinedTest/bands", key: [band], components: { has: [serial] } });

/** On the joined thread: the serials of a band's rows, in entity order. */
const describeBand = System.create({
    name: "indexJoinedTest/describeBand",
    components: { read: [target], write: [label], has: [bandReader] },
    lookup: { inBand: { index: bands, read: [serial] } },
}, (row, { lookup }) => {
    const list = lookup.inBand(row[target]);
    const serials: number[] = [];
    for (let i = 0; i < list.length; i++) serials.push(list.at(i)[serial]);
    row[label] = { text: `${row[target]}:${serials.join(",")}` };
});
const seedBands = System.create({ name: "indexJoinedTest/seedBands" }, ({ commands }) => {
    for (let k = 0; k < 300; k++) commands.spawn([band, serial])({ [band]: k % 2, [serial]: k });
    for (let k = 0; k < 2; k++) commands.spawn([target, label, bandReader])({ [target]: k, [label]: blank });
});
/** Moves some entities to the other band, despawns some and spawns others. */
const stirBands = System.create({ name: "indexJoinedTest/stirBands", components: { read: [serial], write: [band] } }, (row, { commands }, input: { readonly round: number }) => {
    if ((row[serial] + input.round) % 7 === 0) row[band] = 1 - row[band];
    if ((row[serial] + input.round) % 29 === 0) commands.despawn(row.entity);
    if (row[serial] % 31 === input.round) commands.spawn([band, serial])({ [band]: row[serial] % 2, [serial]: 1000 + row[serial] * 10 + input.round });
});
/** Seeds the bands, then reads them on the thread around changes; every label after each read. */
const bandScenario = async (world: CreatedWorld, holder: World): Promise<readonly (readonly string[])[]> => {
    const seen: (readonly string[])[] = [];
    await world.run(seedBands);
    for (let round = 0; round < 6; round++) {
        await world.run(describeBand);
        seen.push(await labels(holder, world));
        await world.run(stirBands, { round });
    }
    return seen;
};

/** On the joined thread, in the tier before the lookups, so a task of consecutive tiers there would see the index before it: moves some cells. */
const shift = System.create({ name: "indexJoinedTest/shift", components: { read: [serial], write: [cell, label] } }, row => {
    if (row[serial] % 17 !== 0) return;
    const [x, y] = row[cell];
    row[cell] = [(x + 1) % 13, y];
    row[label] = { text: "" };
});

/** On the joined thread: each cell's neighbors' count and weights, whether its list changed, and its serial's target's weight. */
const describeCells = System.create({
    name: "indexJoinedTest/describeCells",
    components: { read: [cell, target], write: [label] },
    lookup: { near: { index: grid, read: [weight], changed: [weight] }, bySerial: { index: serials, read: [weight] }, all: { index: weighted, read: [weight] } },
    after: [shift],
}, (row, { lookup }) => {
    const [x, y] = row[cell];
    let found = 0;
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) {
        const near = lookup.near([x + dx, y]);
        for (let i = 0; i < near.length; i++) {
            sum += near.at(i)[weight];
            found++;
        }
    }
    const followed = lookup.bySerial(row[target]);
    const all = lookup.all();
    let every = 0;
    for (let i = row[target] % 11; i < all.length; i += 11) every += all.at(i)[weight] * (i + 1);
    row[label] = { text: `${found}:${sum}:${lookup.near([x, y]).changed}:${followed === null ? "none" : followed[weight]}:${all.length}:${every}:${all.changed}` };
});

/** On the joined thread: the rows of the row's lane within 5 of its rank, in key order. */
const describeRanks = System.create({
    name: "indexJoinedTest/describeRanks",
    components: { read: [lane, rank], write: [label] },
    lookup: { inLane: { index: lanes, read: [rank] } },
    after: [describeCells],
}, (row, { lookup }) => {
    const r = row[rank];
    const near = lookup.inLane(row[lane], { ">=": r - 5, "<=": r + 5 });
    const ranks: number[] = [];
    for (let i = 0; i < near.length; i++) ranks.push(near.at(i)[rank]);
    row[label] = { text: ranks.join(",") };
});

const tick = System.create({ name: "indexJoinedTest/tick", systems: [shift, describeCells, describeRanks] });

const seed = System.create({ name: "indexJoinedTest/seed" }, ({ commands }) => {
    for (let k = 0; k < 200; k++) commands.spawn([cell, weight, serial, target, label])({ [cell]: [k % 13, k % 7], [weight]: k % 5, [serial]: k, [target]: (k * 7) % 230, [label]: blank });
    for (let k = 0; k < 150; k++) commands.spawn([lane, rank, label])({ [lane]: k % 3, [rank]: (k * 37) % 97, [label]: blank });
});

/** Moves cells, changes weights and ranks, despawns some and spawns others. */
const stir = System.create({ name: "indexJoinedTest/stir", components: { read: [serial], write: [cell, weight] } }, (row, { commands }, input: { readonly round: number }) => {
    const [x, y] = row[cell];
    if ((row[serial] + input.round) % 9 === 0) row[cell] = [(x + 1) % 13, y];
    if ((row[serial] + input.round) % 11 === 0) row[weight] = row[weight] + 1;
    if ((row[serial] + input.round) % 23 === 0) commands.despawn(row.entity);
    if (row[serial] % 50 === input.round) commands.spawn([cell, weight, serial, target, label])({ [cell]: [input.round, 3], [weight]: 2, [serial]: 1000 + row[serial], [target]: row[serial], [label]: blank });
});
const rerank = System.create({ name: "indexJoinedTest/rerank", components: { write: [rank] } }, (row, _context, input: { readonly round: number }) => {
    if ((row[rank] + input.round) % 5 === 0) row[rank] = (row[rank] * 3 + 1) % 97;
});

/** A system of the joined thread looking up through an index of its strings, which the world keeps on its own thread. */
const byName = System.create({
    name: "indexJoinedTest/byName",
    components: { read: [name], write: [label] },
    lookup: { named: { index: names } },
}, (row, { lookup }) => {
    row[label] = { text: String(lookup.named(row[name]).length) };
});

/** On the joined thread, added and removed: labels each cell by its bucket's length. */
const counting = System.create({
    name: "indexJoinedTest/counting",
    components: { read: [cell], write: [label] },
    lookup: { near: { index: grid, changed: [weight] } },
}, (row, { lookup }) => {
    const [x, y] = row[cell];
    row[label] = { text: String(lookup.near([x, y]).length) };
});
const keepTicking = System.create({ name: "indexJoinedTest/keepTicking" }, () => {});

const ranks = Index.create({ name: "indexJoinedTest/ranks", key: [rank], sorted: true });
/** Systems of the joined thread writing a string, and looking up by strings, which only the world's thread does. */
const writeTitle = System.create({ name: "indexJoinedTest/writeTitle", components: { read: [label], write: [title] } }, row => {
    row[title] = row[label].text;
});
const byTitle = System.create({ name: "indexJoinedTest/byTitle", components: { read: [title], write: [label] }, lookup: { titled: { index: titles } } }, (row, { lookup }) => {
    row[label] = { text: String(lookup.titled(row[title]).length) };
});

/** A system of the joined thread whose rows are in an index's order, which runs only on the world's thread. */
const inOrder = System.create({ name: "indexJoinedTest/inOrder", components: { read: [rank], write: [label] }, order: ranks }, row => {
    row[label] = { text: String(row[rank]) };
});

/** Systems on the joined thread and an observer system of its objects, each with an index as a change filter, which run only on the world's thread. */
const countWhenMoved = System.create({ name: "indexJoinedTest/countWhenMoved", components: { read: [cell], write: [label] }, lookup: { near: { index: grid, changed: true } } }, (row, { lookup }) => {
    row[label] = { text: String(lookup.near(row[cell]).length) };
});
const readWhenMoved = System.create({ name: "indexJoinedTest/readWhenMoved", observer: true, components: { read: [label] }, lookup: { near: { index: grid, changed: true } } }, row => {
    void row[label];
});
const ownWhenMoved = System.create({ name: "indexJoinedTest/ownWhenMoved", observer: true, lookup: { near: { index: grid, changed: true } } }, () => {});

/** The entities `readLabels` reads, and their labels. */
const reading: { entities: readonly Entity[]; labels: readonly string[] } = { entities: [], labels: [] };
const readLabels = System.create({ name: "indexJoinedTest/readLabels", observer: true, lookup: { labeled: { read: [label] } } }, ({ lookup }) => {
    reading.labels = reading.entities.map(entity => lookup.labeled(entity)?.[label].text ?? "missing");
});

/** Each entity's label, sorted, as the world or the thread that fills its objects reads it, as of the last sync point. */
const labels = async (holder: World, world: World): Promise<readonly string[]> => {
    reading.entities = await Observe.toPromise(Observe.select(world, { required: [label] }));
    await holder.run(readLabels);
    return [...reading.labels].sort();
};

/** Seeds, then ticks around changes; every label after each tick, and the warnings of each tick. */
const scenario = async (world: CreatedWorld, holder: World): Promise<{ readonly labels: readonly (readonly string[])[]; readonly warnings: readonly (readonly string[])[] }> => {
    const seen: (readonly string[])[] = [];
    const warnings: (readonly string[])[] = [];
    await world.run(seed);
    for (let round = 0; round < 5; round++) {
        const report = await runReported(world, tick);
        expect(report.failures).toEqual([]);
        warnings.push(report.warnings.map(warning => warning.name));
        await world.run(dropReports);
        seen.push(await labels(holder, world));
        await world.run(stir, { round });
        await world.run(rerank, { round });
    }
    return { labels: seen, warnings };
};

/** Once the last thread shared has joined. */
const joinedStatus = (world: CreatedWorld): Promise<void> => new Promise(resolve => {
    let done = false;
    const stop = world.threads(threads => {
        if (done || threads.at(-1)?.status !== "joined") return;
        done = true;
        queueMicrotask(() => stop());
        resolve();
    });
});

describe("systems on a joined thread looking up through indexes", () => {
    it("find what the world's own systems find: hash buckets, unique rows, sorted ranges and changes", async () => {
        const inline = createWorld({ [workers]: 0 });
        const alone = await scenario(inline, inline);
        await inline.dispose();
        const world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["indexJoinedTest"] });
        await joinedStatus(world);
        const there = await scenario(world, remote);
        expect(there.labels).toEqual(alone.labels);
        expect(alone.labels.flat().some(text => text.includes("true"))).toBe(true);
        // The systems ran there, their tiers waiting for the thread.
        expect(there.warnings.every(names => names.includes("indexJoinedTest/describeCells"))).toBe(true);
        expect(alone.warnings.flat()).toEqual([]);
        await remote.dispose();
        await world.dispose();
    });
    it("read a hash index's long buckets in entity order after changes left them unsorted, as the world's own systems do", async () => {
        const inline = createWorld({ [workers]: 0 });
        const alone = await bandScenario(inline, inline);
        await inline.dispose();
        const world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["indexJoinedTest"] });
        await joinedStatus(world);
        expect(await bandScenario(world, remote)).toEqual(alone);
        expect(alone.every(round => round.length === 2 && round.every(text => text.split(",").length > 100))).toBe(true);
        await remote.dispose();
        await world.dispose();
    });
    it("release the index and its records once the last system using it there is removed", async () => {
        const driver = backToBack();
        const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["indexJoinedTest"] });
        await joinedStatus(world);
        await world.run(seed);
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
        world.add(keepTicking);
        // Ticks of what an index is keyed by and watches stay once started, as any component's do, and task blocks keep
        // their size.
        for (let round = 0; round < 2; round++) {
            world.add(counting);
            await ticks(2);
            world.remove(counting);
            await ticks(4);
        }
        const before = await world.tables();
        world.add(counting);
        await ticks(2);
        const added = await world.tables();
        expect(added.indexes).toBe(before.indexes + 1);
        expect(added.arena).toBeGreaterThan(before.arena);
        world.remove(counting);
        await ticks(4);
        const removed = await world.tables();
        expect(removed.indexes).toBe(before.indexes);
        expect(removed.arena).toBe(before.arena);
        expect(removed.joined).toEqual(before.joined);
        driver.close();
        await remote.dispose();
        await world.dispose();
    });
    it("throw for an index with an object or string key part, which the world keeps on its own thread, for an order, for a string written, and for an index as a change filter", async () => {
        const world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["indexJoinedTest"] });
        await joinedStatus(world);
        await expect(world.run(byName)).rejects.toThrow('looks up through index "indexJoinedTest/names", whose key part "indexJoinedTest/name" is an object, so it runs only on the world\'s thread.');
        await expect(world.run(inOrder)).rejects.toThrow("orders its rows by an index, which runs only on the world's thread");
        await expect(world.run(writeTitle)).rejects.toThrow(`System "indexJoinedTest/writeTitle" runs on thread "indexJoinedTest", which a joined thread fills, and writes "indexJoinedTest/title", a string, which only the world's thread writes.`);
        await expect(world.run(byTitle)).rejects.toThrow('looks up through index "indexJoinedTest/titles", whose key part "indexJoinedTest/title" is a string, which the world\'s thread keeps keys of, so it runs only on the world\'s thread.');
        const moved = `and when index "indexJoinedTest/grid" changed, a lookup's changed being true, which runs only on the world's thread.`;
        await expect(world.run(countWhenMoved)).rejects.toThrow(`System "indexJoinedTest/countWhenMoved" runs on thread "indexJoinedTest", which a joined thread fills, ${moved}`);
        await expect(world.run(readWhenMoved)).rejects.toThrow(`System "indexJoinedTest/readWhenMoved" runs on thread "indexJoinedTest", which a joined thread fills, ${moved}`);
        expect(() => remote.add(ownWhenMoved)).toThrow(`Observer system "indexJoinedTest/ownWhenMoved" runs when index "indexJoinedTest/grid" changed, as its lookup "near"'s changed is true, so it runs only on the world's thread.`);
        await remote.dispose();
        await world.dispose();
    });
});
