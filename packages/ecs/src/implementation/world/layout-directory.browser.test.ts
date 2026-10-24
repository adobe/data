// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import type { F32 } from "../../interface/math/index.js";

const value = Symbol("layoutDirectoryTest/value");
const target = Symbol("layoutDirectoryTest/target");
const seen = Symbol("layoutDirectoryTest/seen");
const child = Symbol("layoutDirectoryTest/child");
const tag0 = Symbol("layoutDirectoryTest/tag0");
const tag1 = Symbol("layoutDirectoryTest/tag1");
const tag2 = Symbol("layoutDirectoryTest/tag2");
const tag3 = Symbol("layoutDirectoryTest/tag3");
const tag4 = Symbol("layoutDirectoryTest/tag4");
const tag5 = Symbol("layoutDirectoryTest/tag5");
const tag6 = Symbol("layoutDirectoryTest/tag6");
const tags = [tag0, tag1, tag2, tag3, tag4, tag5, tag6] as const;

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: F32 };
        [target]: { type: Entity };
        [seen]: { type: F32 };
        [child]: { type: true };
        [tag0]: { type: true };
        [tag1]: { type: true };
        [tag2]: { type: true };
        [tag3]: { type: true };
        [tag4]: { type: true };
        [tag5]: { type: true };
        [tag6]: { type: true };
    }
}


/** The component lists of 100 archetypes: `value` with each of the first 100 combinations of the tags. */
const lists = Array.from({ length: 100 }, (_, i): (typeof value | (typeof tags)[number])[] => [value, ...tags.filter((_, bit) => (i & (1 << bit)) !== 0)]);

/** Spawns `count` entities into each of the 100 archetypes. */
const fill = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (const list of lists) for (let i = 0; i < input.count; i++) commands.spawn(list)({ [value]: 0 });
});

const bump = System.create({ kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const total = { sum: 0, count: 0 };
/** Sums every value on the world's thread, so it reads what workers wrote. */
const sum = System.create({ components: { read: [value] } }, row => {
    total.sum += row[value];
    total.count++;
});

/** Entities whose values the lookups read, recorded as they spawn. */
const spawned: Entity[] = [];
const make = System.create({}, ({ commands }) => {
    for (let i = 0; i < 64; i++) commands.spawn([target, seen])({ [target]: Entity.none, [seen]: 0 });
    commands.spawn([value])({ [value]: -1 });
});
const spawnMany = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) spawned.push(commands.spawn([value])({ [value]: i }));
});
/** Aims each looker at one of the last spawned entities. */
let aimed = 0;
const aim = System.create({ components: { write: [target] } }, row => {
    row[target] = spawned[spawned.length - 1 - aimed++];
});
const despawnValues = System.create({ components: { has: [value], not: [child] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
/** Lookups from workers. */
const look = System.create({
    kernel: "cpu",
    components: { read: [target], write: [seen] },
    lookup: { targets: { read: [value] } },
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    row[seen] = other === null ? -1 : other[value];
});
/** Spawns from workers: a child per looker. */
const breed = System.create({ kernel: "cpu", components: { read: [seen] } }, (row, { commands }) => {
    commands.spawn([value, child])({ [value]: row[seen] });
});

const disposals: World[] = [];
afterEach(async () => {
    for (const world of disposals.splice(0)) await world.dispose();
});

/** Counts the layout messages posted to workers while `during` runs. */
const layoutMessages = async (during: () => Promise<void>): Promise<number> => {
    let messages = 0;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (typeof message === "object" && message !== null && Reflect.get(message, "kind") === "layout") messages++;
        original.call(this, message, transfer as StructuredSerializeOptions);
    };
    try {
        await during();
    }
    finally {
        Worker.prototype.postMessage = original;
    }
    return messages;
};

const totals = async (world: World): Promise<{ sum: number; count: number }> => {
    total.sum = total.count = 0;
    await world.run(sum);
    return { ...total };
};

describe("the layout directory", () => {
    for (const wasm of [true, false]) {
        it(`lets workers' ${wasm ? "WASM" : "JS"} kernels see every row of 100 archetypes grown across sync points, with no layout message after the one creating them`, async () => {
            const world = createWorld({ [workers]: 3 }, { minimumChunk: 16, wasm });
            disposals.push(world);
            await world.run(fill, { count: 1 });
            await world.run(bump);
            const counts = [16, 32, 64, 128, 256];
            const messages = await layoutMessages(async () => {
                for (const count of counts) {
                    await world.run(fill, { count });
                    await world.run(bump);
                }
            });
            expect(messages).toBe(0);
            // Each entity was bumped once per round from the one it spawned in.
            const rounds = counts.length;
            const expected = 100 * (rounds + 1) + counts.reduce((sum, count, r) => sum + 100 * count * (rounds - r), 0);
            expect(await totals(world)).toEqual({ sum: expected, count: 100 * (1 + counts.reduce((a, b) => a + b, 0)) });
        });
    }

    it("lets workers' lookups and spawns use the entity table once it grows between runs, with no message", async () => {
        spawned.length = 0;
        aimed = 0;
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 16, wasm: false });
        disposals.push(world);
        await world.run(make);
        await world.run(look);
        await world.run(breed);
        const lookers = await select(world, { required: [seen] });
        const messages = await layoutMessages(async () => {
            // The table grows from 64 entities to past 10,000.
            await world.run(spawnMany, { count: 10_000 });
            await world.run(aim);
            await world.run(look);
            expect(new Set(await readEach(world, lookers, seen))).toEqual(new Set(Array.from({ length: 64 }, (_, i) => 9_999 - i)));
            // The free list grows past 10,000 indexes, which workers' spawns then reuse.
            await world.run(despawnValues);
            await world.run(breed);
        });
        expect(messages).toBe(0);
        const children = await select(world, { required: [child] });
        expect(new Set(children).size).toBe(128);
        expect((await readEach(world, children, value)).filter(each => each === -1)).toHaveLength(64);
        expect((await readEach(world, children, value)).filter(each => each !== null && each >= 9_936)).toHaveLength(64);
    });

    for (const wasm of [true, false]) {
        it(`lets workers' ${wasm ? "WASM" : "JS"} kernels rebuild their views once memory grows between runs`, async () => {
            const world = createWorld({ [workers]: 2 }, { minimumChunk: 16, wasm });
            disposals.push(world);
            await world.run(fill, { count: 1 });
            await world.run(bump);
            let grows = 0;
            const original = WebAssembly.Memory.prototype.grow;
            WebAssembly.Memory.prototype.grow = function (this: WebAssembly.Memory, delta: number) {
                grows++;
                return original.call(this, delta);
            };
            let messages = 0;
            try {
                messages = await layoutMessages(async () => {
                    await world.run(fill, { count: 2_000 });
                    await world.run(bump);
                });
            }
            finally {
                WebAssembly.Memory.prototype.grow = original;
            }
            expect(grows).toBeGreaterThan(0);
            expect(messages).toBe(0);
            expect(await totals(world)).toEqual({ sum: 100 * 2 + 100 * 2_000, count: 100 * 2_001 });
        });
    }
});
