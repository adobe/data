import { Archetype } from "../interface/archetype/archetype.js";
import { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { System } from "../interface/system/system.js";

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

declare module "@adobe/data-ecs" {
    export interface Components {
        [index]: typeof indexTraits;
        [value]: typeof valueTraits;
        [flag]: typeof flagTraits;
        [amount]: typeof amountTraits;
        [extra]: typeof extraTraits;
        [spawned]: typeof spawnedTraits;
        [source1]: typeof source1Traits;
        [source2]: typeof source2Traits;
        [t0]: typeof t0Traits;
        [t1]: typeof t1Traits;
        [t2]: typeof t2Traits;
        [t3]: typeof t3Traits;
    }
}

const indexTraits = Component.register(index, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
const valueTraits = Component.register(value, { type: { type: "number", precision: 1 } });
const amountTraits = Component.register(amount, { type: { type: "number", precision: 1 } });
const extraTraits = Component.register(extra, { type: { type: "number", precision: 1 } });
const flagTraits = Component.register(flag, { type: { const: true } });
const spawnedTraits = Component.register(spawned, { type: { const: true } });
const source1Traits = Component.register(source1, { type: { const: true } });
const source2Traits = Component.register(source2, { type: { const: true } });
const t0Traits = Component.register(t0, { type: { const: true } });
const t1Traits = Component.register(t1, { type: { const: true } });
const t2Traits = Component.register(t2, { type: { const: true } });
const t3Traits = Component.register(t3, { type: { const: true } });

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
    name: "structural/seed",
    input: { type: "object", properties: { count: { type: "integer" }, sources: { type: "integer" } } },
}, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        commands.spawn(seeded[input.sources === 1 ? 0 : i % 4])({ [index]: i, [value]: i });
    }
});

/** `count` spawns of one archetype. */
export const spawnBulk = System.create({ name: "structural/spawnBulk", input: counted }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) commands.spawn(made)({ [index]: i, [value]: i });
});

/** One spawn of each of four archetypes: a run's fixed cost per spawn. */
export const spawnSingles = System.create({ name: "structural/spawnSingles" }, ({ commands }) => {
    commands.spawn(made)({ [index]: 0, [value]: 0 });
    commands.spawn(sixteen[1])({ [index]: 1, [value]: 1 });
    commands.spawn(sixteen[2])({ [index]: 2, [value]: 2 });
    commands.spawn(sixteen[3])({ [index]: 3, [value]: 3 });
});

/** `count` spawns over sixteen archetypes, entity i into archetype i % 16: more component sets than spawns cache. */
export const spawnSixteen = System.create({ name: "structural/spawnSixteen", input: counted }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        commands.spawn(sixteen[i % 16])({ [index]: i, [value]: i });
    }
});

/** A spawn per row, from a kernel. */
export const spawnKernel = System.create({ name: "structural/spawnKernel", kernel: "cpu", components: { read: [index], not: [spawned] } }, (row, { commands }) => {
    commands.spawn(made)({ [index]: row[index], [value]: 0 });
});

/** Despawns every entity a spawn benchmark made. */
export const despawnSpawned = System.create({ name: "structural/despawnSpawned", components: { has: [spawned] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** Despawns every seeded entity. */
export const despawnAll = System.create({ name: "structural/despawnAll", components: { has: [index], not: [spawned] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** The same, from a kernel. */
export const despawnKernel = System.create({ name: "structural/despawnKernel", kernel: "cpu", components: { has: [index], not: [spawned] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

/** Entities `spawnOne` made, for `despawnOne`. */
const pending: Entity[] = [];

export const spawnOne = System.create({ name: "structural/spawnOne" }, ({ commands }) => {
    pending.push(commands.spawn(made)({ [index]: 0, [value]: 0 }));
});

/** Despawns one entity: a run's fixed cost per despawn. */
export const despawnOne = System.create({ name: "structural/despawnOne" }, ({ commands }) => {
    const entity = pending.pop();
    if (entity !== undefined) commands.despawn(entity);
});

export const addFlag = System.create({ name: "structural/addFlag", components: { has: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, flag);
});

export const removeFlag = System.create({ name: "structural/removeFlag", components: { has: [flag] } }, (row, { commands }) => {
    commands.remove(row.entity, flag);
});

export const addFlagKernel = System.create({ name: "structural/addFlagKernel", kernel: "cpu", components: { has: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, flag);
});

export const removeFlagKernel = System.create({ name: "structural/removeFlagKernel", kernel: "cpu", components: { has: [flag] } }, (row, { commands }) => {
    commands.remove(row.entity, flag);
});

export const addAmount = System.create({ name: "structural/addAmount", components: { read: [index], not: [amount, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, amount, row[index]);
});

export const removeAmount = System.create({ name: "structural/removeAmount", components: { has: [amount] } }, (row, { commands }) => {
    commands.remove(row.entity, amount);
});

/** Adds a value every row already has: no archetype moves, only values replaced and marked changed. */
export const replaceAmount = System.create({ name: "structural/replaceAmount", components: { read: [amount] } }, (row, { commands }) => {
    commands.add(row.entity, amount, row[amount] + 1);
});

export const addSeveral = System.create({ name: "structural/addSeveral", components: { read: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, several, { [amount]: row[index], [extra]: 1 });
});

export const removeSeveral = System.create({ name: "structural/removeSeveral", components: { has: [flag, amount, extra] } }, (row, { commands }) => {
    commands.remove(row.entity, several);
});
