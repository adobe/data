// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Archetype } from "../../interface/archetype/archetype.js";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import type { I32 } from "../../interface/math/i32/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";
import { blockShift, chunkShift } from "./kernel.js";
import { readEach, select } from "./reads.test-helper.js";

// Change filters skip chunks and blocks whose ticks aren't newer than their `lastRun`, so every writer of a row's tick
// raises its chunk's and block's. Each case writes a few rows far apart in an archetype of many chunks, through one
// writer, and every kind of reader must find exactly those rows.

const value = Symbol("changeBlocksTest/value");
const at = Symbol("changeBlocksTest/at");
const seen = Symbol("changeBlocksTest/seen");
const group = Symbol("changeBlocksTest/group");
const tagged = Symbol("changeBlocksTest/tagged");
const note = Symbol("changeBlocksTest/note");
const parent = Symbol("changeBlocksTest/parent");

declare module "@adobe/ecs" {
    interface Threads {
        changeBlocksTest: true;
    }
    interface Components {
        [value]: { type: number };
        [at]: { type: number };
        [seen]: { type: number };
        [group]: { type: number };
        [tagged]: { type: true };
        [note]: { type: { readonly text: string } | null; thread: "changeBlocksTest" };
        [parent]: { type: Entity; reference: "owner" };
    }
}
Component.register(value, { type: { type: "number" } });
Component.register(at, { type: { type: "integer", minimum: 0, maximum: 0x7FFFFFFF } });
Component.register(seen, { type: { type: "number" } });
Component.register(group, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(tagged, { type: { const: true } });
const text = { type: "object", properties: { text: { type: "string" } } } as const;
Component.register(note, { type: { anyOf: [text, { type: "null" }], default: { text: "none" } }, thread: "changeBlocksTest" });
Component.register(parent, { type: Entity.schema, reference: "owner" });

/** Rows in the archetype: five chunks, the last partial. */
const rows = 4500;
const plain = Archetype.create([value, at, seen, group]);
const marked = Archetype.create([value, at, seen, group, tagged]);
const noted = Archetype.create([value, at, note]);

let entities: Entity[] = [];
const seed = System.create({ name: "changeBlocksTest/seed" }, ({ commands }) => {
    entities = [];
    for (let i = 0; i < rows; i++) entities.push(commands.spawn(plain)({ [value]: 0, [at]: i, [seen]: 0, [group]: 0 }));
    // Rows an entity tagged later moves after, so it lands far into that archetype.
    for (let i = rows; i < 2 * rows; i++) entities.push(commands.spawn(marked)({ [value]: 0, [at]: i, [seen]: 0, [group]: 0, [tagged]: true }));
});

// Writers.
const setValue = System.create({ name: "changeBlocksTest/setValue", target: "entity", components: { write: [value] } }, (row, _context, input: { readonly entity: Entity }) => {
    row[value] += 1;
});
const replace = System.create({ name: "changeBlocksTest/replace" }, ({ commands }, input: { readonly entities: readonly Entity[] }) => {
    for (const entity of input.entities) commands.add(entity, value, 7);
});
const despawn = System.create({ name: "changeBlocksTest/despawn" }, ({ commands }, input: { readonly entities: readonly Entity[] }) => {
    for (const entity of input.entities) commands.despawn(entity);
});
const tag = System.create({ name: "changeBlocksTest/tag" }, ({ commands }, input: { readonly entities: readonly Entity[] }) => {
    for (const entity of input.entities) commands.add(entity, tagged);
});
const spawnOne = System.create({ name: "changeBlocksTest/spawnOne" }, ({ commands }, input: { readonly at: number }) => {
    commands.spawn(plain)({ [value]: 0, [at]: input.at, [seen]: 0, [group]: 0 });
});
/** Writes the rows whose `at` is in a list of up to four, which stamps row by row. */
const writeSome = System.create({ name: "changeBlocksTest/writeSome", kernel: "cpu", components: { read: [at], write: [value] } }, (row, _context, input: { readonly a: I32; readonly b: I32; readonly c: I32; readonly d: I32 }) => {
    const here = row[at];
    if (here === input.a || here === input.b || here === input.c || here === input.d) row[value] += 1;
});
/** Writes every row, which stamps chunks and blocks once per call. */
const writeAll = System.create({ name: "changeBlocksTest/writeAll", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] += 1;
});
const setGroup = System.create({ name: "changeBlocksTest/setGroup", target: "entity", components: { write: [group] } }, (row, _context, input: { readonly entity: Entity }) => {
    row[group] = 1;
});

// Readers.
let found: number[] = [];
const onMain = System.create({ name: "changeBlocksTest/onMain", components: { read: [at], changed: [value] } }, row => { found.push(row[at]); });
const observed = System.create({ name: "changeBlocksTest/observed", observer: true, components: { read: [at], changed: [value] } }, row => { found.push(row[at]); });
const ofTwo = System.create({ name: "changeBlocksTest/ofTwo", components: { read: [at], changed: [group, value] } }, row => { found.push(row[at]); });
const inKernel = System.create({ name: "changeBlocksTest/inKernel", kernel: "cpu", components: { write: [seen], changed: [value] } }, row => { row[seen] += 1; });
const inUp = System.create({ name: "changeBlocksTest/inUp", components: { read: [at], changed: [value] }, up: { through: parent, read: [value] } }, row => { found.push(row[at]); });
const byGroup = Index.create({ name: "changeBlocksTest/byGroup", key: [group] });
let grouped: number[] = [];
const inGroup = System.create({ name: "changeBlocksTest/inGroup", lookup: { byGroup: { index: byGroup } } }, ({ lookup }) => {
    const list = lookup.byGroup(1);
    grouped = Array.from({ length: list.length }, (_, i) => list.at(i).entity);
});

// On a joined thread, by the object they read: a writer, and readers of its writes and of the world's thread's.
const seedNoted = System.create({ name: "changeBlocksTest/seedNoted" }, ({ commands }) => {
    entities = [];
    for (let i = 0; i < rows; i++) entities.push(commands.spawn(noted)({ [value]: 0, [at]: i }));
});
const noteSome = System.create({ name: "changeBlocksTest/noteSome", components: { read: [at], write: [note] } }, (row, _context, input: { readonly ats: readonly number[] }) => {
    if (input.ats.includes(row[at])) row[note] = { text: "noted" };
});
const notesThere = System.create({ name: "changeBlocksTest/notesThere", components: { read: [at, note], changed: [note] } }, row => { if (row[note] !== undefined) found.push(row[at]); });
const valuesThere = System.create({ name: "changeBlocksTest/valuesThere", components: { read: [at, note], changed: [value] } }, row => { if (row[note] !== undefined) found.push(row[at]); });

/** The `at` of the rows a main-thread reader ran, in order. */
const ranOn = async (world: World, reader: System): Promise<number[]> => {
    found = [];
    await world.run(reader);
    return [...found].sort((a, b) => a - b);
};

/** The `at` of the rows the kernel reader ran, by the `seen` it raised. */
const ranInKernel = async (world: World): Promise<number[]> => {
    const all = await select(world, { required: [seen] });
    const before = await readEach(world, all, seen);
    await world.run(inKernel);
    const after = await readEach(world, all, seen);
    const ats = await readEach(world, all, at);
    return all.flatMap((_, k) => after[k] !== before[k] ? [ats[k] ?? -1] : []).sort((a, b) => a - b);
};

const readers = { onMain, observed, ofTwo, inUp } as const;

/** Every reader's rows after `write`, each having run once before, so each sees only what `write` changed. */
const seenAfter = async (world: World, write: () => Promise<unknown>): Promise<{ readonly [reader: string]: readonly number[] }> => {
    for (const reader of Object.values(readers)) await world.run(reader);
    await world.run(inKernel);
    await write();
    const result: { [reader: string]: readonly number[] } = {};
    for (const [name, reader] of Object.entries(readers)) result[name] = await ranOn(world, reader);
    result.inKernel = await ranInKernel(world);
    return result;
};

const every = (expected: readonly number[]) => ({ onMain: expected, observed: expected, ofTwo: expected, inUp: expected, inKernel: expected });

/** Rows far apart: in the first block, a middle block of a middle chunk, and the last chunk's last block. */
const spread = [5, (2 << chunkShift) + (5 << blockShift) + 9, rows - 1] as const;

describe("chunk and block ticks", () => {
    for (const wasm of [false, true]) {
        const label = wasm ? "WASM" : "JS";
        const inline = () => createWorld({ [workers]: 0 }, { wasm });

        it(`let readers find rows a main-thread system wrote (${label} kernels)`, async () => {
            await using world = inline();
            await world.run(seed);
            expect(await seenAfter(world, async () => {
                for (const row of spread) await world.run(setValue, { entity: entities[row] });
            })).toEqual(every(spread));
        });

        it(`let readers find rows a kernel wrote, row by row and once per call (${label} kernels)`, async () => {
            await using world = inline();
            await world.run(seed);
            expect(await seenAfter(world, () => world.run(writeSome, { a: spread[0], b: spread[1], c: spread[2], d: -1 }))).toEqual(every(spread));
            const all = Array.from({ length: 2 * rows }, (_, k) => k);
            expect(await seenAfter(world, () => world.run(writeAll))).toEqual(every(all));
        });

        it(`let readers find rows commands wrote, moved, swapped into and spawned (${label} kernels)`, async () => {
            await using world = inline();
            await world.run(seed);
            expect(await seenAfter(world, () => world.run(replace, { entities: spread.map(row => entities[row]) }))).toEqual(every(spread));
            // The last row, changed, is swapped into the first block's despawned row.
            const last = rows - 1;
            expect(await seenAfter(world, async () => {
                await world.run(setValue, { entity: entities[last] });
                await world.run(despawn, { entities: [entities[3]] });
            })).toEqual(every([last]));
            // A changed row moves to the end of another archetype, past its first chunks.
            const moved = spread[1];
            expect(await seenAfter(world, async () => {
                await world.run(setValue, { entity: entities[moved] });
                await world.run(tag, { entities: [entities[moved]] });
            })).toEqual(every([moved]));
            expect(await seenAfter(world, () => world.run(spawnOne, { at: 9999 }))).toEqual(every([9999]));
        });
    }

    it("let a filter of two components find a row only the other component changed in", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(seed);
        await world.run(ofTwo);
        await world.run(setGroup, { entity: entities[spread[1]] });
        expect(await ranOn(world, ofTwo)).toEqual([spread[1]]);
    });

    it("let systems on a joined thread find rows written there and on the world's thread", async () => {
        const world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["changeBlocksTest"] });
        try {
            await new Promise<void>(resolve => {
                const stop = world.threads(threads => {
                    if (threads.at(-1)?.status !== "joined") return;
                    queueMicrotask(() => stop());
                    resolve();
                });
            });
            await world.run(seedNoted);
            await world.run(valuesThere);
            await world.run(notesThere);
            for (const row of spread) await world.run(setValue, { entity: entities[row] });
            expect(await ranOn(world, valuesThere)).toEqual(spread);
            await world.run(noteSome, { ats: [spread[1], spread[2]] });
            expect(await ranOn(world, notesThere)).toEqual([spread[1], spread[2]]);
        }
        finally {
            await remote.dispose();
            await world.dispose();
        }
    });

    it("let an index refresh find a key written in a block of a chunk", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(seed);
        await world.run(inGroup);
        expect(grouped).toEqual([]);
        await world.run(setGroup, { entity: entities[spread[1]] });
        await world.run(inGroup);
        expect(grouped).toEqual([entities[spread[1]]]);
    });
});
