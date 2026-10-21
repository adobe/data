import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEntity, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { countingWorkers } from "./platforms.test-helper.js";

/** Scenarios of kernels looking up through indexes across workers, run built in node and from source in chromium. */

const cell = Symbol("indexWorkersTest/cell");
const weight = Symbol("indexWorkersTest/weight");
const total = Symbol("indexWorkersTest/total");
const count = Symbol("indexWorkersTest/count");
const changes = Symbol("indexWorkersTest/changes");
const lane = Symbol("indexWorkersTest/lane");
const rank = Symbol("indexWorkersTest/rank");
const seen = Symbol("indexWorkersTest/seen");
const serial = Symbol("indexWorkersTest/serial");
const target = Symbol("indexWorkersTest/target");
const tally = Symbol("indexWorkersTest/tally");

declare module "@adobe/ecs" {
    interface Components {
        [cell]: { type: readonly [number, number] };
        [weight]: { type: number };
        [total]: { type: number };
        [count]: { type: number };
        [changes]: { type: number };
        [lane]: { type: number };
        [rank]: { type: number };
        [seen]: { type: Entity };
        [serial]: { type: number };
        [target]: { type: number };
        [tally]: { type: number };
    }
}
Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -1000, maximum: 1000 }, minItems: 2, maxItems: 2 } });
Component.register(weight, { type: { type: "number" } });
Component.register(total, { type: { type: "number" } });
Component.register(count, { type: { type: "number" } });
Component.register(changes, { type: { type: "number" } });
Component.register(lane, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(rank, { type: { type: "number" } });
Component.register(seen, { type: Entity.schema });
Component.register(serial, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(target, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(tally, { type: { type: "number" } });

const grid = Index.create({ name: "indexWorkersTest/grid", key: [cell], components: { has: [weight] } });
const lanes = Index.create({ name: "indexWorkersTest/lanes", key: [lane, rank], sorted: true });
const serials = Index.create({ name: "indexWorkersTest/serials", key: [serial], unique: true, components: { has: [weight] } });
const weighted = Index.create({ name: "indexWorkersTest/weighted", key: [], components: { has: [weight] } });

/** Each row's neighbors in the 3 by 3 cells around its own: how many, and their weights' sum. */
const neighbors = System.create({
    name: "indexWorkersTest/neighbors", kernel: "cpu",
    components: { read: [cell], write: [total, count] },
    lookup: { near: { index: grid, read: [weight] } },
}, (row, { lookup }) => {
    const [x, y] = row[cell];
    let sum = 0;
    let found = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const near = lookup.near([x + dx, y + dy]);
            for (let i = 0; i < near.length; i++) {
                sum += near.at(i)[weight];
                found++;
            }
        }
    }
    row[total] = sum;
    row[count] = found;
});

/** Counts runs whose list of the row's own cell changed. */
const watch = System.create({
    name: "indexWorkersTest/watch", kernel: "cpu",
    components: { read: [cell], write: [changes] },
    lookup: { near: { index: grid, changed: [weight] } },
    after: [neighbors],
}, (row, { lookup }) => {
    const [x, y] = row[cell];
    if (lookup.near([x, y]).changed) row[changes] = row[changes] + 1;
});

/** How many rows of the row's lane have a rank within 5 of its own, and the first of them. */
const window = System.create({
    name: "indexWorkersTest/window", kernel: "cpu",
    components: { read: [lane, rank], write: [count, seen] },
    lookup: { inLane: { index: lanes } },
    after: [watch],
}, (row, { lookup }) => {
    const r = row[rank];
    const near = lookup.inLane(row[lane], { ">=": r - 5, "<": r + 5 });
    row[count] = near.length;
    row[seen] = near.length === 0 ? Entity.none : near.at(0).entity;
});

/** The weight of the entity whose serial is the row's target, or -1. */
const follow = System.create({
    name: "indexWorkersTest/follow", kernel: "cpu",
    components: { read: [target], write: [total] },
    lookup: { bySerial: { index: serials, read: [weight] } },
    after: [window],
}, (row, { lookup }) => {
    const found = lookup.bySerial(row[target]);
    row[total] = found === null ? -1 : found[weight];
});

/** Through an index without a key: how many entities it holds, a stride of their weights, and whether it changed. */
const census = System.create({
    name: "indexWorkersTest/census", kernel: "cpu",
    components: { read: [target], write: [tally] },
    lookup: { weighted: { index: weighted, read: [weight], changed: [weight] } },
    after: [follow],
}, (row, { lookup }) => {
    const all = lookup.weighted();
    let sum = 0;
    for (let i = row[target] % 97; i < all.length; i += 97) sum += all.at(i)[weight];
    row[tally] = all.length * 1000000 + sum * 2 + (all.changed ? 1 : 0);
});

const tick = System.create({ name: "indexWorkersTest/tick", systems: [neighbors, watch, window, follow, census] });

const seed = System.create({ name: "indexWorkersTest/seed" }, ({ commands }) => {
    for (let k = 0; k < 3000; k++) {
        commands.spawn([cell, weight, total, count, changes, serial])({ [cell]: [(k * 7) % 31, (k * 3) % 29], [weight]: k % 9, [total]: 0, [count]: 0, [changes]: 0, [serial]: k });
    }
    for (let k = 0; k < 2000; k++) {
        commands.spawn([lane, rank, count, seen])({ [lane]: k % 5, [rank]: (k * 37) % 1009, [count]: 0, [seen]: Entity.none });
    }
    for (let k = 0; k < 1000; k++) commands.spawn([target, total, tally])({ [target]: (k * 13) % 3500, [total]: 0, [tally]: 0 });
});

/** Moves some cells, changes some weights and ranks, despawns some serials and spawns more: a different input each time. */
const stir = System.create({ name: "indexWorkersTest/stir", input: { type: "object", properties: { round: { type: "integer" } } }, components: { write: [cell, weight] } }, (row, { input }) => {
    const [x, y] = row[cell];
    if ((x + y + input.round) % 11 === 0) row[cell] = [(x + 1) % 31, y];
    if ((x * y + input.round) % 13 === 0) row[weight] = row[weight] + 1;
});
const rerank = System.create({ name: "indexWorkersTest/rerank", input: { type: "object", properties: { round: { type: "integer" } } }, components: { write: [rank] } }, (row, { input }) => {
    if ((row[rank] + input.round) % 7 === 0) row[rank] = (row[rank] * 3 + 1) % 1009;
});
const churn = System.create({ name: "indexWorkersTest/churn", input: { type: "object", properties: { round: { type: "integer" } } }, components: { read: [serial] } }, (row, { input, commands }) => {
    if ((row[serial] + input.round) % 17 === 0) commands.despawn(row.entity);
    if (row[serial] % 101 === input.round) {
        commands.spawn([cell, weight, total, count, changes, serial])({ [cell]: [input.round, row[serial] % 29], [weight]: 4, [total]: 0, [count]: 0, [changes]: 0, [serial]: 3000 + row[serial] + input.round });
    }
});

/** Every value the kernels wrote over 6 rounds, sorted, since entity ids depend on reservation interleaving, and the run tasks and windows posted to workers. */
export const simulate = async (threads: number, wasm: boolean): Promise<{ readonly rows: readonly string[]; readonly tasks: number }> => {
    const counting = countingWorkers();
    const ecs = createWorld({ [workers]: threads }, { minimumChunk: 64, wasm, pool: counting.platform });
    try {
        await ecs.run(seed);
        const posted = (): number => counting.posted("run") + counting.posted("window");
        const before = posted();
        for (let round = 0; round < 6; round++) {
            await ecs.run(tick);
            await ecs.run(stir, { round });
            await ecs.run(rerank, { round });
            await ecs.run(churn, { round });
        }
        await ecs.run(tick);
        const tasks = posted() - before;
        const cells = await Promise.all((await select(ecs, { required: [cell] })).map(async entity => {
            const values = await readEntity(ecs, entity, [cell, weight, total, count, changes]);
            return values === null ? null : [values[cell], values[weight], values[total], values[count], values[changes]];
        }));
        const ranked = await Promise.all((await select(ecs, { required: [rank] })).map(async entity => {
            const values = await readEntity(ecs, entity, [lane, rank, count, seen]);
            if (values === null) return null;
            // The first row's lane and rank name it, entity ids aside.
            const first = values[seen] === Entity.none ? null : await readEntity(ecs, values[seen], [lane, rank]);
            return [values[lane], values[rank], values[count], first === null ? null : [first[lane], first[rank]]];
        }));
        const targets = await Promise.all((await select(ecs, { required: [target] })).map(async entity => {
            const values = await readEntity(ecs, entity, [target, total, tally]);
            return values === null ? null : [values[target], values[total], values[tally]];
        }));
        const rows = [...cells, ...ranked, ...targets].map(row => JSON.stringify(row));
        return { rows: rows.sort(), tasks };
    }
    finally {
        await ecs.dispose();
    }
};
