import { describe, expect, it } from "vitest";
import { threadStatus } from "../../interface/components/index.js";
import type { Entity } from "../../interface/entity/entity.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";
import { Observe } from "../../interface/observe/observe.js";
import { caption, changes, countWritten, crowd, flagCrowd, giveKept, kept, scenario, spawnKept, uid, unflagCrowd, write } from "./thread-systems.test-helper.js";

// Systems on a joined thread, with the world and the thread on this one, joined through a MessageChannel.

/** The first value an observer gives that `accept` takes. */
const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

const statusOf = (world: World, thread: Entity, status: "joined" | "gone") =>
    until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === status);

/** A world shared with a thread on this one, which claims the systems' thread. */
const joined = async (): Promise<{ readonly world: World; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const thread = world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["threadSystemsTest"] });
    await statusOf(world, thread, "joined");
    return { world, remote };
};

describe("systems on a joined thread", () => {
    it("give an inline world's results: rows, commands, spawns, reductions, resources, lookups, filters, conditions and failures", async () => {
        const inline = createWorld({ [workers]: 0 });
        const expected = await scenario(inline, inline);
        await inline.dispose();
        const { world, remote } = await joined();
        const actual = await scenario(world, remote);
        expect(actual.snapshots).toEqual(expected.snapshots);
        expect(actual.reports).toEqual(expected.reports);
        expect(expected.warnings.every(names => names.length === 0)).toBe(true);
        // Every tick waits for the joined thread's tiers.
        expect(actual.warnings[1]).toEqual(["threadSystemsTest/describe", "threadSystemsTest/relabel", "threadSystemsTest/breed", "threadSystemsTest/tally", "threadSystemsTest/watchCaptions", "threadSystemsTest/repaint", "threadSystemsTest/peek"]);
        await remote.dispose();
        await world.dispose();
    });
    it("keep a value the thread's systems wrote, once its log lapped and it rebuilt", async () => {
        const { world, remote } = await joined();
        await world.run(crowd, { count: 200 });
        await world.run(write);
        // Moves past what the log holds, while the thread runs nothing and so replays nothing.
        for (let k = 0; k < 30; k++) await world.run(k % 2 === 0 ? flagCrowd : unflagCrowd);
        await world.run(countWritten);
        expect(await Observe.toPromise(world.observe.resource(changes))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("give the world's objects only their start or null: a command giving another drops and fails its system, a spawn throws", async () => {
        const { world, remote } = await joined();
        await world.run(crowd, { count: 1 });
        const given = await world.run(giveKept);
        expect(given.failures.map(failure => [failure.name, failure.message])).toEqual([["threadSystemsTest/giveKept", '"threadSystemsTest/kept" lives on thread "world", so a command on another thread gives it only its start or null.']]);
        expect(given.dropped).toBe(1);
        const spawned = await world.run(spawnKept);
        expect(spawned.failures.map(failure => [failure.name, failure.message])).toEqual([["threadSystemsTest/spawnKept", '"threadSystemsTest/kept" lives on thread "world", so a command on another thread gives it only its start or null.']]);
        expect(await Observe.toPromise(world.observe.count({ required: [kept] }))).toBe(0);
        await remote.dispose();
        await world.dispose();
    });
    it("are skipped with a \"thread\" failure once their thread is gone, and run here once its claims are released", async () => {
        const { world, remote } = await joined();
        await world.run(crowd, { count: 1 });
        await world.run(write);
        const leaving = remote.dispose();
        const report = await world.run(write);
        await leaving;
        expect(report.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["thread", "threadSystemsTest/write", 'Thread "threadSystemsTest" is gone, so its systems don\'t run.']]);
        expect(report.skipped).toEqual(["threadSystemsTest/write"]);
        const [entity] = await Observe.toPromise(world.observe.select({ required: [uid] }));
        expect(await world.run(write)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(await Observe.toPromise(world.observe.entity(entity, { required: [caption] }))).toEqual({ [caption]: "written" });
        await world.dispose();
    });
});
