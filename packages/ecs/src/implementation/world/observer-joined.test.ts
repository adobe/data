// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Index, System, workers } from "../../index.js";
import type { Entity } from "../../interface/entity/entity.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { tablesOf } from "./join.js";
import { Observe } from "../../observe/index.js";
import { reportOf, runReported } from "./reports.test-helper.js";

// Observer systems on a joined thread, with the world and the thread on this one, joined through a MessageChannel.

const level = Symbol("observerJoinedTest/level");
const amount = Symbol("observerJoinedTest/amount");
const cell = Symbol("observerJoinedTest/cell");
const tagged = Symbol("observerJoinedTest/tagged");
const label = Symbol("observerJoinedTest/label");
const name = Symbol("observerJoinedTest/name");
declare module "@adobe/ecs" {
    interface Threads {
        observerJoinedTest: true;
    }
    interface Components {
        [amount]: { type: number };
        [cell]: { type: number };
        [tagged]: { type: true };
        [label]: { type: { readonly text: string }; thread: "observerJoinedTest"; default: typeof blank };
        [name]: { type: string; default: "" };
    }
    interface Resources {
        [level]: { type: number; default: 0 };
    }
}
/** The label's start, which a command here gives it by this value. */
const blank = { text: "" };

const byCell = Index.create({ key: [cell], components: { has: [amount] } });
const allTagged = Index.create({ key: [], components: { has: [tagged] } });

const raise = System.create({ resources: { write: [level] } }, ({ resources }) => { resources[level] += 1; });
const nothing = System.create({}, () => {});
const spawn = System.create({}, ({ commands }, input: { readonly at: number }) => {
    commands.spawn([amount, cell, tagged])({ [amount]: input.at, [cell]: input.at });
});
const spawnLabelled = System.create({}, ({ commands }) => { commands.spawn([amount, label])({ [amount]: 4, [label]: blank }); });
const grow = System.create({ components: { write: [amount] } }, row => { row[amount] += 1; });
const move = System.create({ components: { write: [cell] } }, row => { row[cell] += 10; });

/** What the joined thread's observer bodies saw, reset by each test. */
const seen: { levels: number[]; amounts: number[][]; looked: (number | boolean)[][]; tagged: number[]; labels: string[]; calls: number } = { levels: [], amounts: [], looked: [], tagged: [], labels: [], calls: 0 };
const reset = (): void => {
    seen.levels.length = seen.amounts.length = seen.looked.length = seen.tagged.length = seen.labels.length = 0;
    seen.calls = 0;
};

/** The entities the tests look up, by the joined thread's systems. */
const watched: Entity[] = [];

const watchLevel = System.create({ observer: true, resources: { read: [level], changed: [level] } }, ({ resources }) => {
    seen.calls++;
    seen.levels.push(resources[level]);
});
const watchAmounts = System.create({ observer: true, components: { read: [amount], changed: [amount] } }, row => {
    (seen.amounts[seen.amounts.length - 1] ??= []).push(row[amount]);
});
const startAmounts = System.create({ observer: true }, () => { seen.amounts.push([]); });
const amountsPass = System.create([startAmounts, watchAmounts]);
const lookChanged = System.create({ observer: true, lookup: { found: { read: [amount], changed: [amount] } } }, ({ lookup }) => {
    seen.looked.push(watched.flatMap(entity => {
        const row = lookup.found(entity);
        return row === null ? [] : [row[amount], row.changed];
    }));
});
const countTagged = System.create({ observer: true, lookup: { all: { index: allTagged } } }, ({ lookup }) => {
    seen.tagged.push(lookup.all().length);
});
const inCell = System.create({ observer: true, lookup: { found: { index: byCell, read: [amount] } } }, ({ lookup }) => {
    const found = lookup.found(11);
    seen.tagged.push(found.length === 0 ? 0 : found.length * 100 + (found.at(0)?.[amount] ?? -1));
});
const failing = System.create({ observer: true, resources: { read: [level] } }, ({ resources }) => {
    if (resources[level] > 1) throw new Error("observer joined failure");
});
const readLabels = System.create({ observer: true, components: { read: [label, amount] } }, row => {
    seen.labels.push(`${row[label].text}${row[amount]}`);
});

/** Resolves once `done` holds, between turns of the event loop, which the joined thread's work needs. */
const settled = async (done: () => boolean): Promise<void> => {
    for (let turn = 0; turn < 2000 && !done(); turn++) await new Promise(resolve => setTimeout(resolve, 0));
};
/** A few turns of the event loop, for work that should not happen to show it didn't. */
const turns = async (count = 20): Promise<void> => {
    for (let turn = 0; turn < count; turn++) await new Promise(resolve => setTimeout(resolve, 0));
};

const joined = async (threads: readonly "observerJoinedTest"[] = []): Promise<{ readonly world: CreatedWorld; readonly remote: World; readonly close: () => Promise<void> }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads });
    for (let turn = 0; turn < 2000; turn++) {
        let status = "";
        world.threads(progress => { status = progress.at(-1)?.status ?? ""; })();
        if (status === "joined") break;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    // A run's round trip: the thread's claims are made, and it's set up.
    await remote.run(nothing);
    return {
        world, remote,
        close: async () => {
            await remote.dispose();
            await world.dispose();
        },
    };
};

describe("observer systems on a joined thread", () => {
    it("run there after each sync point, reading resources as of it, only when a filter may pass", async () => {
        reset();
        const { world, remote, close } = await joined();
        remote.add(watchLevel);
        await turns();
        await world.run(raise);
        await settled(() => seen.levels.length === 1);
        await world.run(raise);
        await settled(() => seen.levels.length === 2);
        // Nothing it filters on changed: the thread isn't woken for it.
        await world.run(nothing);
        await turns();
        expect(seen.levels).toEqual([1, 2]);
        await close();
    });

    it("run once, for the newest sync point, after falling behind", async () => {
        reset();
        const { world, remote, close } = await joined();
        remote.add(watchLevel);
        await turns();
        await Promise.all([world.run(raise), world.run(raise), world.run(raise)]);
        await settled(() => seen.levels.length >= 1);
        await turns();
        expect(seen.levels).toEqual([3]);
        await close();
    });

    it("read rows with change filters, and composites of observer systems", async () => {
        reset();
        const { world, remote, close } = await joined();
        remote.add(amountsPass);
        await turns();
        await world.run(spawn, { at: 1 });
        await settled(() => seen.amounts.length === 1);
        await world.run(spawn, { at: 5 });
        await settled(() => seen.amounts.length === 2);
        await world.run(grow);
        await settled(() => seen.amounts.length === 3);
        expect(seen.amounts).toEqual([[1], [5], [2, 6]]);
        await close();
    });

    it("look up by entity with changed, and through keyless and keyed indexes, in shared memory", async () => {
        reset();
        const { world, remote, close } = await joined();
        await world.run(spawn, { at: 1 });
        await world.run(spawn, { at: 2 });
        const [first, second] = await new Promise<readonly Entity[]>(resolve => {
            const stop = Observe.select(world, { required: [amount], order: { [amount]: true } })(entities => {
                if (entities.length < 2) return;
                queueMicrotask(() => stop());
                resolve(entities);
            });
        });
        watched.length = 0;
        watched.push(first, second);
        remote.add(lookChanged);
        remote.add(countTagged);
        await turns();
        await world.run(nothing);
        await settled(() => seen.looked.length === 1 && seen.tagged.length === 1);
        await world.run(grow);
        await settled(() => seen.looked.length === 2);
        await world.run(spawn, { at: 3 });
        await settled(() => seen.tagged.at(-1) === 3);
        expect(seen.looked.slice(0, 2)).toEqual([[1, true, 2, true], [2, true, 3, true]]);
        // Nothing they read changed since they last ran.
        expect(seen.looked.at(-1)).toEqual([2, false, 3, false]);
        expect([seen.tagged[0], seen.tagged.at(-1)]).toEqual([2, 3]);
        remote.remove(lookChanged);
        remote.remove(countTagged);
        seen.tagged.length = 0;
        remote.add(inCell);
        await turns();
        await world.run(move);
        await settled(() => seen.tagged.length === 1);
        // Cells 1, 2 and 3 moved to 11, 12 and 13; the first's amount grew to 2.
        expect(seen.tagged).toEqual([102]);
        await close();
    });

    it("look up through indexes without ids, which the world makes from their declarations", async () => {
        reset();
        const { world, remote, close } = await joined();
        await world.run(spawn, { at: 1 });
        await world.run(spawn, { at: 11 });
        // Made in a function, so the build gives them no id.
        const made = (): readonly [Index<{ readonly key: readonly []; readonly components: { readonly has: readonly [typeof tagged, typeof cell] } }>, Index<{ readonly key: readonly [typeof cell]; readonly sorted: true; readonly components: { readonly has: readonly [typeof amount] } }>] => [
            Index.create({ key: [], components: { has: [tagged, cell] } }),
            Index.create({ key: [cell], sorted: true, components: { has: [amount] } }),
        ];
        const [madeTagged, madeByCell] = made();
        const sizes = System.create({ observer: true, lookup: { all: { index: madeTagged, changed: [cell] }, cells: { index: madeByCell, read: [amount] } } }, ({ lookup }) => {
            const all = lookup.all();
            seen.looked.push([all.changed]);
            const high = lookup.cells({ ">=": 5 });
            seen.tagged.push(all.length * 1000 + high.length * 100 + (high.at(0)?.[amount] ?? 0));
        });
        expect(await reportOf(world, await remote.run(sizes))).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        await world.run(move);
        expect(await reportOf(world, await remote.run(sizes))).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        // Two tagged; then one cell at 11 or more, holding 11, then both, the first holding 1.
        expect(seen.tagged).toEqual([2111, 2201]);
        expect(seen.looked).toEqual([[true], [true]]);
        await close();
    });

    it("run from the joined thread, resolving once its body ran there, with its failure in a later run's report", async () => {
        reset();
        const { world, remote, close } = await joined();
        await world.run(raise);
        expect(await reportOf(world, await remote.run(watchLevel))).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(seen.levels).toEqual([1]);
        await world.run(raise);
        await remote.run(failing);
        // Its failure reaches the world by message, in time for a later run.
        let report = await runReported(world, nothing);
        for (let k = 0; k < 100 && report.failures.length === 0; k++) {
            await new Promise(resolve => setTimeout(resolve, 1));
            report = await runReported(world, nothing);
        }
        expect(report.failures.map(failure => [failure.kind, failure.message])).toEqual([["system", "observer joined failure"]]);
        await close();
    });

    it("report what added ones throw in a later run's report", async () => {
        reset();
        const { world, remote, close } = await joined();
        remote.add(failing);
        await turns();
        await world.run(raise);
        await world.run(raise);
        await turns();
        const report = await runReported(world, nothing);
        expect(report.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["system", "failing", "observer joined failure"]]);
        await close();
    });

    it("never run once removed, and free what both threads held", async () => {
        reset();
        const { world, remote, close } = await joined();
        const cycle = async (): Promise<readonly number[]> => {
            remote.add(watchLevel);
            await turns();
            const from = seen.levels.length;
            await world.run(raise);
            await settled(() => seen.levels.length === from + 1);
            remote.remove(watchLevel);
            await world.run(raise);
            await turns();
            expect(seen.levels.length).toBe(from + 1);
            await world.run(nothing);
            await turns();
            await world.run(nothing);
            const tables = await world.tables();
            return [tables.arena, tables.runners, tablesOf.get(remote)?.().observer ?? -1];
        };
        const first = await cycle();
        expect(first[2]).toBe(0);
        expect(await cycle()).toEqual(first);
        await close();
    });

    it("refuse only systems that aren't observer", async () => {
        const { remote, close } = await joined();
        expect(() => remote.add(raise)).toThrow("A joined thread adds only observer systems");
        expect(() => remote.remove(raise)).toThrow("A joined thread removes only observer systems");
        await close();
    });

    it("are placed on the joined thread filling their objects, reading them there", async () => {
        reset();
        const { world, close } = await joined(["observerJoinedTest"]);
        await world.run(spawnLabelled);
        world.add(readLabels);
        await turns();
        await world.run(nothing);
        await settled(() => seen.labels.length === 1);
        expect(seen.labels).toEqual(["4"]);
        world.remove(readLabels);
        await close();
    });

    it("fail to register when placed on the joined thread filling their objects without an id, which it can't name", async () => {
        reset();
        const { world, close } = await joined(["observerJoinedTest"]);
        await world.run(spawnLabelled);
        // Made in a function, so the build gives it no id.
        const made = () => System.create({ observer: true, components: { read: [label, amount] } }, row => {
            seen.labels.push(`${row[label].text}${row[amount]}`);
        });
        const madeLabels = made();
        await expect(world.run(madeLabels)).rejects.toThrow(`runs on thread "observerJoinedTest", which a joined thread fills, and has no id, so that thread can't name it`);
        // Another made there, labeled the same.
        const added = made();
        world.add(added);
        await turns();
        const report = await runReported(world, nothing);
        expect(report.failures.map(failure => [failure.kind, failure.name])).toEqual([["system", "made"]]);
        world.remove(added);
        await turns();
        expect(seen.labels).toEqual([]);
        await close();
    });

    it("run on the joined thread filling their objects when the world runs them, then here once it's gone", async () => {
        reset();
        const { world, remote } = await joined(["observerJoinedTest"]);
        await world.run(spawnLabelled);
        expect(await runReported(world, readLabels)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        await settled(() => seen.labels.length === 1);
        expect(seen.labels).toEqual(["4"]);
        remote.add(watchLevel);
        await turns();
        await remote.dispose();
        await turns();
        // The thread's own are forgotten with it; those on the threads it filled run here again.
        await world.run(raise);
        await world.run(readLabels);
        await turns();
        expect([seen.labels, seen.levels]).toEqual([["4", "4"], []]);
        expect((await world.tables()).joined).toEqual([]);
        await world.dispose();
    });
});
