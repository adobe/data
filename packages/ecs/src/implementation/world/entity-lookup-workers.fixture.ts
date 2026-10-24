// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../interface/entity/entity.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEntity, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { countingWorkers } from "./platforms.test-helper.js";

/** Kernels' lookups by entity with `changed` across workers, beside a main-thread system doing the same: built in node and from source in chromium. */

const weight = Symbol("entityLookupWorkersTest/weight");
const mark = Symbol("entityLookupWorkersTest/mark");
const follows = Symbol("entityLookupWorkersTest/follows");
const kernelSeen = Symbol("entityLookupWorkersTest/kernelSeen");
const plainSeen = Symbol("entityLookupWorkersTest/plainSeen");
const banned = Symbol("entityLookupWorkersTest/banned");

declare module "@adobe/ecs" {
    interface Components {
        [weight]: { type: number };
        [mark]: { type: number };
        [follows]: { type: Entity };
        [kernelSeen]: { type: number };
        [plainSeen]: { type: number };
        [banned]: { type: true };
    }
}

/**
 * Counts, in base 4 by run, what the lookups gave the entity a row follows: 0 not found, 1 unchanged, 2 changed, and
 * whether its mark changed in the next digit, then whether it has a mark and isn't banned.
 */
const watchKernel = System.create({
    kernel: "cpu",
    components: { read: [follows], write: [kernelSeen] },
    lookup: { found: { read: [weight], changed: [weight] }, marked: { read: [mark], changed: [mark] }, eligible: { has: [mark], not: [banned] } },
}, (row, { lookup }) => {
    const found = lookup.found(row[follows]);
    const marked = lookup.marked(row[follows]);
    const seen = found === null ? 0 : found[weight] >= 0 ? found.changed ? 2 : 1 : 3;
    const flagged = marked === null ? 0 : marked[mark] > 0 ? marked.changed ? 2 : 1 : 3;
    const eligible = lookup.eligible(row[follows]) === null ? 0 : 1;
    row[kernelSeen] = ((row[kernelSeen] * 4 + seen) % 1000003 * 4 + flagged) * 2 + eligible;
});

const watchPlain = System.create({
    components: { read: [follows], write: [plainSeen] },
    lookup: { found: { read: [weight], changed: [weight] }, marked: { read: [mark], changed: [mark] }, eligible: { has: [mark], not: [banned] } },
}, (row, { lookup }) => {
    const found = lookup.found(row[follows]);
    const marked = lookup.marked(row[follows]);
    const seen = found === null ? 0 : found[weight] >= 0 ? found.changed ? 2 : 1 : 3;
    const flagged = marked === null ? 0 : marked[mark] > 0 ? marked.changed ? 2 : 1 : 3;
    const eligible = lookup.eligible(row[follows]) === null ? 0 : 1;
    row[plainSeen] = ((row[plainSeen] * 4 + seen) % 1000003 * 4 + flagged) * 2 + eligible;
});

const tick = System.create({ systems: [watchKernel, watchPlain] });

const targets: Entity[] = [];
const seed = System.create({}, ({ commands }) => {
    targets.length = 0;
    for (let k = 0; k < 500; k++) targets.push(k % 3 === 0 ? commands.spawn([weight, mark])({ [weight]: k, [mark]: 1 }) : commands.spawn([weight])({ [weight]: k }));
    for (let k = 0; k < 4000; k++) commands.spawn([follows, kernelSeen, plainSeen])({ [follows]: targets[(k * 7) % targets.length], [kernelSeen]: 0, [plainSeen]: 0 });
});

/** Writes some weights, marks and unmarks some targets, despawns some and spawns others: a different change each round. */
const stir = System.create({ components: { write: [weight] } }, (row, { commands }, input: { readonly round: number }) => {
    const w = row[weight];
    if ((w + input.round) % 5 === 0) row[weight] = w + 1000;
    if ((w + input.round) % 11 === 0) commands.add(row.entity, mark, 2);
    if ((w + input.round) % 13 === 0) commands.remove(row.entity, mark);
    if ((w + input.round) % 7 === 0) commands.add(row.entity, banned, true);
    if ((w + input.round) % 17 === 0) commands.remove(row.entity, banned);
    if ((w + input.round) % 97 === 0) commands.despawn(row.entity);
});

/** Every row's record of what both systems saw over 6 rounds, sorted, and the run tasks and windows posted to workers. */
export const simulate = async (threads: number, wasm: boolean): Promise<{ readonly rows: readonly string[]; readonly agree: boolean; readonly tasks: number }> => {
    const counting = countingWorkers();
    const ecs = createWorld({ [workers]: threads }, { minimumChunk: 64, wasm, pool: counting.platform });
    try {
        await ecs.run(seed);
        const posted = (): number => counting.posted("run") + counting.posted("window");
        const before = posted();
        for (let round = 0; round < 6; round++) {
            await ecs.run(tick);
            await ecs.run(tick);
            await ecs.run(stir, { round });
        }
        await ecs.run(tick);
        const tasks = posted() - before;
        const rows = await Promise.all((await select(ecs, { required: [follows] })).map(async entity => {
            const values = await readEntity(ecs, entity, [kernelSeen, plainSeen]);
            return values === null ? [] : [values[kernelSeen], values[plainSeen]];
        }));
        return { rows: rows.map(row => JSON.stringify(row)).sort(), agree: rows.every(([kernel, plain]) => kernel === plain), tasks };
    }
    finally {
        await ecs.dispose();
    }
};
