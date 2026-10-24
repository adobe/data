// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from "../interface/archetype/archetype.js";
import type { Entity } from "../interface/entity/entity.js";
import { System } from "../interface/system/system.js";
import type { F32, U32 } from "../interface/math/index.js";

// Structural changes one kind at a time: spawns, despawns, adds and removes, through main-thread systems and kernels,
// each applied by the sync point that ends its run.

export const index = Symbol("structural/index");
export const value = Symbol("structural/value");
export const flag = Symbol("structural/flag");
export const amount = Symbol("structural/amount");
export const extra = Symbol("structural/extra");
export const spawned = Symbol("structural/spawned");
const source1 = Symbol("structural/source1");
const source2 = Symbol("structural/source2");
const t0 = Symbol("structural/t0");
const t1 = Symbol("structural/t1");
const t2 = Symbol("structural/t2");
const t3 = Symbol("structural/t3");

declare module "@adobe/ecs" {
    export interface Components {
        [index]: { type: U32 };
        [value]: { type: F32 };
        [flag]: { type: true };
        [amount]: { type: F32 };
        [extra]: { type: F32 };
        [spawned]: { type: true };
        [source1]: { type: true };
        [source2]: { type: true };
        [t0]: { type: true };
        [t1]: { type: true };
        [t2]: { type: true };
        [t3]: { type: true };
    }
}


const seeded = [
    Archetype.create([index, value]),
    Archetype.create([index, value, source1]),
    Archetype.create([index, value, source2]),
    Archetype.create([index, value, source1, source2]),
] as const;
const made = Archetype.create([index, value, spawned]);
/** Every set of the four tags `t0` to `t3`, by its bits. */
const tags = [t0, t1, t2, t3] as const;
const sixteen = Array.from({ length: 16 }, (_, bits) => Archetype.create([index, value, spawned, ...tags.filter((_, bit) => (bits & (1 << bit)) !== 0)]));
const several = Archetype.create([flag, amount, extra]);

const counted = { type: "object", properties: { count: { type: "integer" } } } as const;

/** `count` entities of one archetype, or with `sources: 4`, interleaved over four by two source tags. */
export const seed = System.create({
}, ({ commands }, input: { readonly count: number; readonly sources: number }) => {
    for (let i = 0; i < input.count; i++) {
        commands.spawn(seeded[input.sources === 1 ? 0 : i % 4])({ [index]: i, [value]: i });
    }
});

/** `count` spawns of one archetype. */
export const spawnBulk = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn(made)({ [index]: i, [value]: i });
});

/** One spawn of each of four archetypes: a run's fixed cost per spawn. */
export const spawnSingles = System.create({}, ({ commands }) => {
    commands.spawn(made)({ [index]: 0, [value]: 0 });
    commands.spawn(sixteen[1])({ [index]: 1, [value]: 1 });
    commands.spawn(sixteen[2])({ [index]: 2, [value]: 2 });
    commands.spawn(sixteen[3])({ [index]: 3, [value]: 3 });
});

/** `count` spawns over sixteen archetypes, entity i into archetype i % 16: more component sets than spawns cache. */
export const spawnSixteen = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        commands.spawn(sixteen[i % 16])({ [index]: i, [value]: i });
    }
});

/** A spawn per row, from a kernel. */
export const spawnKernel = System.create({ kernel: "cpu", components: { read: [index], not: [spawned] } }, (row, { commands }) => {
    commands.spawn(made)({ [index]: row[index], [value]: 0 });
});

/** Despawns every entity a spawn benchmark made. */
export const despawnSpawned = System.create({ components: { has: [spawned] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** Despawns every seeded entity. */
export const despawnAll = System.create({ components: { has: [index], not: [spawned] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** The same, from a kernel. */
export const despawnKernel = System.create({ kernel: "cpu", components: { has: [index], not: [spawned] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** Entities `spawnOne` made, for `despawnOne`. */
const pending: Entity[] = [];

export const spawnOne = System.create({}, ({ commands }) => {
    pending.push(commands.spawn(made)({ [index]: 0, [value]: 0 }));
});

/** Despawns one entity: a run's fixed cost per despawn. */
export const despawnOne = System.create({}, ({ commands }) => {
    const entity = pending.pop();
    if (entity !== undefined) commands.despawn(entity);
});

export const addFlag = System.create({ components: { has: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, flag);
});

export const removeFlag = System.create({ components: { has: [flag] } }, (row, { commands }) => {
    commands.remove(row.entity, flag);
});

export const addFlagKernel = System.create({ kernel: "cpu", components: { has: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, flag);
});

export const removeFlagKernel = System.create({ kernel: "cpu", components: { has: [flag] } }, (row, { commands }) => {
    commands.remove(row.entity, flag);
});

export const addAmount = System.create({ components: { read: [index], not: [amount, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, amount, row[index]);
});

export const removeAmount = System.create({ components: { has: [amount] } }, (row, { commands }) => {
    commands.remove(row.entity, amount);
});

/** Adds a value every row already has: no archetype moves, only values replaced and marked changed. */
export const replaceAmount = System.create({ components: { read: [amount] } }, (row, { commands }) => {
    commands.add(row.entity, amount, row[amount] + 1);
});

export const addSeveral = System.create({ components: { read: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, several, { [amount]: row[index], [extra]: 1 });
});

export const removeSeveral = System.create({ components: { has: [flag, amount, extra] } }, (row, { commands }) => {
    commands.remove(row.entity, several);
});
