// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { countingWorkers } from "./platforms.test-helper.js";
import type { F32 } from "../../interface/math/index.js";

/** Scenarios of workers reading layouts from the directory, run built in node and from source in chromium. */

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

const bump = System.create({ kernel: true, components: { write: [value] } }, row => {
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
    kernel: true,
    components: { read: [target], write: [seen] },
    lookup: { targets: { read: [value] } },
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    row[seen] = other === null ? -1 : other[value];
});
/** Spawns from workers: a child per looker. */
const breed = System.create({ kernel: true, components: { read: [seen] } }, (row, { commands }) => {
    commands.spawn([value, child])({ [value]: row[seen] });
});

/** Runs `use` with a world, then disposes it. */
const using = async <T>(world: World, use: (world: World) => Promise<T>): Promise<T> => {
    try {
        return await use(world);
    }
    finally {
        await world.dispose();
    }
};

const totals = async (world: World): Promise<{ sum: number; count: number }> => {
    total.sum = total.count = 0;
    await world.run(sum);
    return { ...total };
};

/** Rows that spawn into each of the 100 archetypes in each round after the first, which spawns 1. */
export const rounds: readonly number[] = [16, 32, 64, 128, 256];

/** 100 archetypes grown over `rounds`, each round bumped by workers: layout messages after the first round, and the totals. */
export const grown = async (wasm: boolean): Promise<{ readonly messages: number; readonly totals: { sum: number; count: number } }> => {
    const counting = countingWorkers();
    // Pieces of two rows, so the first round's single rows start the pool and its layout message is before the count.
    return using(createWorld({ [workers]: 3 }, { minimumChunk: 2, wasm, pool: counting.platform }), async world => {
        await world.run(fill, { count: 1 });
        await world.run(bump);
        const before = counting.posted("layout");
        for (const count of rounds) {
            await world.run(fill, { count });
            await world.run(bump);
        }
        return { messages: counting.posted("layout") - before, totals: await totals(world) };
    });
};

/**
 * Lookups and spawns from workers once the entity table grows from 64 entities past 10,000 and its free list past
 * 10,000 indexes: layout messages meanwhile, what the lookers saw, and the children workers spawned.
 */
export const tableGrown = async (): Promise<{ readonly messages: number; readonly seen: readonly (number | null)[]; readonly children: number; readonly values: readonly (number | null)[] }> => {
    spawned.length = 0;
    aimed = 0;
    const counting = countingWorkers();
    return using(createWorld({ [workers]: 2 }, { minimumChunk: 16, wasm: false, pool: counting.platform }), async world => {
        await world.run(make);
        await world.run(look);
        await world.run(breed);
        const lookers = await select(world, { required: [seen] });
        const before = counting.posted("layout");
        await world.run(spawnMany, { count: 10_000 });
        await world.run(aim);
        await world.run(look);
        const seenValues = await readEach(world, lookers, seen);
        await world.run(despawnValues);
        await world.run(breed);
        const messages = counting.posted("layout") - before;
        const children = await select(world, { required: [child] });
        return { messages, seen: seenValues, children: new Set(children).size, values: await readEach(world, children, value) };
    });
};

/** Workers' kernels once memory grows between runs: how often it grew, layout messages meanwhile, and the totals. */
export const memoryGrown = async (wasm: boolean): Promise<{ readonly grows: number; readonly messages: number; readonly totals: { sum: number; count: number } }> => {
    const counting = countingWorkers();
    return using(createWorld({ [workers]: 2 }, { minimumChunk: 2, wasm, pool: counting.platform }), async world => {
        await world.run(fill, { count: 1 });
        await world.run(bump);
        let grows = 0;
        const original = WebAssembly.Memory.prototype.grow;
        WebAssembly.Memory.prototype.grow = function (this: WebAssembly.Memory, delta: number) {
            grows++;
            return original.call(this, delta);
        };
        const before = counting.posted("layout");
        try {
            await world.run(fill, { count: 2_000 });
            await world.run(bump);
        }
        finally {
            WebAssembly.Memory.prototype.grow = original;
        }
        return { grows, messages: counting.posted("layout") - before, totals: await totals(world) };
    });
};
