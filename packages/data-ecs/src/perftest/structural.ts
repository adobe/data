import { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { System } from "../interface/system/system.js";
import type { Values } from "../interface/component/values.js";

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
        [index]: { type: number };
        [value]: { type: number };
        [flag]: { type: true };
        [amount]: { type: number };
        [extra]: { type: number };
        [spawned]: { type: true };
        [source1]: { type: true };
        [source2]: { type: true };
        [t0]: { type: true };
        [t1]: { type: true };
        [t2]: { type: true };
        [t3]: { type: true };
    }
}

Component.register(index, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
for (const key of [value, amount, extra] as const) Component.register(key, { type: { type: "number", precision: 1 } });
for (const key of [flag, spawned, source1, source2, t0, t1, t2, t3] as const) Component.register(key, { type: { const: true } });

const counted = { type: "object", properties: { count: { type: "integer" } } } as const;

/** `count` entities of one archetype, or with `sources: 4`, interleaved over four by two source tags. */
export const seed = System.create({
    name: "structural/seed",
    input: { type: "object", properties: { count: { type: "integer" }, sources: { type: "integer" } } },
}, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        switch (input.sources === 1 ? 0 : i % 4) {
            case 0: commands.spawn({ [index]: i, [value]: i }); break;
            case 1: commands.spawn({ [index]: i, [value]: i, [source1]: true }); break;
            case 2: commands.spawn({ [index]: i, [value]: i, [source2]: true }); break;
            default: commands.spawn({ [index]: i, [value]: i, [source1]: true, [source2]: true });
        }
    }
});

/** `count` spawns of one archetype. */
export const spawnBulk = System.create({ name: "structural/spawnBulk", input: counted }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) commands.spawn({ [index]: i, [value]: i, [spawned]: true });
});

/** One spawn of each of four archetypes: a run's fixed cost per spawn. */
export const spawnSingles = System.create({ name: "structural/spawnSingles" }, ({ commands }) => {
    commands.spawn({ [index]: 0, [value]: 0, [spawned]: true });
    commands.spawn({ [index]: 1, [value]: 1, [spawned]: true, [source1]: true });
    commands.spawn({ [index]: 2, [value]: 2, [spawned]: true, [source2]: true });
    commands.spawn({ [index]: 3, [value]: 3, [spawned]: true, [source1]: true, [source2]: true });
});

/** `count` spawns over sixteen archetypes, entity i into archetype i % 16: more component sets than spawns cache. */
export const spawnSixteen = System.create({ name: "structural/spawnSixteen", input: counted }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        let values: Values;
        switch (i % 16) {
            case 0: values = { [index]: i, [value]: i, [spawned]: true }; break;
            case 1: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true }; break;
            case 2: values = { [index]: i, [value]: i, [spawned]: true, [t1]: true }; break;
            case 3: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t1]: true }; break;
            case 4: values = { [index]: i, [value]: i, [spawned]: true, [t2]: true }; break;
            case 5: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t2]: true }; break;
            case 6: values = { [index]: i, [value]: i, [spawned]: true, [t1]: true, [t2]: true }; break;
            case 7: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t1]: true, [t2]: true }; break;
            case 8: values = { [index]: i, [value]: i, [spawned]: true, [t3]: true }; break;
            case 9: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t3]: true }; break;
            case 10: values = { [index]: i, [value]: i, [spawned]: true, [t1]: true, [t3]: true }; break;
            case 11: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t1]: true, [t3]: true }; break;
            case 12: values = { [index]: i, [value]: i, [spawned]: true, [t2]: true, [t3]: true }; break;
            case 13: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t2]: true, [t3]: true }; break;
            case 14: values = { [index]: i, [value]: i, [spawned]: true, [t1]: true, [t2]: true, [t3]: true }; break;
            default: values = { [index]: i, [value]: i, [spawned]: true, [t0]: true, [t1]: true, [t2]: true, [t3]: true };
        }
        commands.spawn(values);
    }
});

/** A spawn per row, from a kernel. */
export const spawnKernel = System.create({ name: "structural/spawnKernel", kernel: "cpu", components: { read: [index], not: [spawned] } }, (row, { commands }) => {
    commands.spawn({ [index]: row[index], [value]: 0, [spawned]: true });
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
    pending.push(commands.spawn({ [index]: 0, [value]: 0, [spawned]: true }));
});

/** Despawns one entity: a run's fixed cost per despawn. */
export const despawnOne = System.create({ name: "structural/despawnOne" }, ({ commands }) => {
    const entity = pending.pop();
    if (entity !== undefined) commands.despawn(entity);
});

export const addFlag = System.create({ name: "structural/addFlag", components: { has: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, { [flag]: true });
});

export const removeFlag = System.create({ name: "structural/removeFlag", components: { has: [flag] } }, (row, { commands }) => {
    commands.remove(row.entity, flag);
});

export const addFlagKernel = System.create({ name: "structural/addFlagKernel", kernel: "cpu", components: { has: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, { [flag]: true });
});

export const removeFlagKernel = System.create({ name: "structural/removeFlagKernel", kernel: "cpu", components: { has: [index], has: [flag] } }, (row, { commands }) => {
    commands.remove(row.entity, flag);
});

export const addAmount = System.create({ name: "structural/addAmount", components: { read: [index], not: [amount, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, { [amount]: row[index] });
});

export const removeAmount = System.create({ name: "structural/removeAmount", components: { has: [amount] } }, (row, { commands }) => {
    commands.remove(row.entity, amount);
});

/** Adds a value every row already has: no archetype moves, only values replaced and marked changed. */
export const replaceAmount = System.create({ name: "structural/replaceAmount", components: { read: [amount] } }, (row, { commands }) => {
    commands.add(row.entity, { [amount]: row[amount] + 1 });
});

export const addSeveral = System.create({ name: "structural/addSeveral", components: { read: [index], not: [flag, spawned] } }, (row, { commands }) => {
    commands.add(row.entity, { [flag]: true, [amount]: row[index], [extra]: 1 });
});

export const removeSeveral = System.create({ name: "structural/removeSeveral", components: { has: [flag, amount, extra] } }, (row, { commands }) => {
    commands.remove(row.entity, flag, amount, extra);
});
