// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, recorderOf, type CreatedWorld } from "./create.js";
import { pageBytes } from "./memory.js";
import { Observe } from "../../observe/index.js";
import { caption, changes, countWritten, crowd, flagCrowd, giveKept, kept, objectsThere, paintLengthThere, paintReader, paintThere, paintsTogether, scenario, spawnKept, uid, unflagCrowd, write } from "./thread-systems.test-helper.js";
import { catchOutOfBand, followTicks, reportOf, runOutcome, runReported } from "./outcomes.test-helper.js";

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

/** A world shared with a thread on this one, which claims the systems' thread. */
const joined = async (): Promise<{ readonly world: CreatedWorld; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const shared = world.share(channel.port1);
    const remote = await join(channel.port2, { threads: ["threadSystemsTest"] });
    await shared;
    return { world, remote };
};

describe("systems on a joined thread", () => {
    it("give an inline world's results: rows, commands, spawns, reductions, resources, lookups, filters, conditions and failures", async () => {
        const inline = createWorld({ [workers]: 0 });
        const expected = await scenario(inline);
        await inline.dispose();
        const { world, remote } = await joined();
        const actual = await scenario(world, objectsThere(remote));
        expect(actual.snapshots).toEqual(expected.snapshots);
        expect(actual.reports).toEqual(expected.reports);
        expect(expected.warnings.every(names => names.length === 0)).toBe(true);
        // Every tick waits for the joined thread's tiers.
        expect(actual.warnings[1]).toEqual(["describe", "relabel", "breed", "tally", "watchCaptions", "repaint", "peek"]);
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
        expect(await Observe.toPromise(Observe.resource(world, changes))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("give the world's strings only their start: a command giving another drops and fails its system, a spawn throws", async () => {
        const { world, remote } = await joined();
        await world.run(crowd, { count: 1 });
        const given = await runReported(world, giveKept);
        expect(given.failures.map(failure => [failure.name, failure.message])).toEqual([["giveKept", '"threadSystemsTest/kept" is a string, which only the world\'s thread writes, so a command on another thread gives it only its start.']]);
        expect(given.dropped).toBe(1);
        const spawned = await runReported(world, spawnKept);
        expect(spawned.failures.map(failure => [failure.name, failure.message])).toEqual([["spawnKept", '"threadSystemsTest/kept" is a string, which only the world\'s thread writes, so a command on another thread gives it only its start.']]);
        expect(await Observe.toPromise(Observe.count(world, { required: [kept] }))).toBe(0);
        await remote.dispose();
        await world.dispose();
    });
    it("resolve a run to what a body there returned, as a tail and in a task, and reject one whose value can't be posted", async () => {
        const { world, remote } = await joined();
        const tail = await runOutcome(world, paintThere);
        expect([tail.value, tail.outcome.warnings]).toEqual(["plain", []]);
        const blocking = await runOutcome(world, paintLengthThere);
        expect([blocking.value, blocking.outcome.warnings.map(warning => warning.name)]).toEqual([5, ["paintLengthThere"]]);
        await expect(world.run(paintReader)).rejects.toThrow(/^System "paintReader" .*failed: Its value can't be posted to the world's thread/);
        expect(await world.run(paintThere)).toBe("plain");
        await remote.dispose();
        await world.dispose();
    });
    it("never post the values of composites' and ticks' members, which nothing resolves to", async () => {
        using reported = catchOutOfBand();
        const { world, remote } = await joined();
        expect(await world.run(paintsTogether)).toBeUndefined();
        const ticks = followTicks(world);
        world.add(paintReader);
        // Each run makes the next beat tick.
        for (let k = 0; k < 3; k++) {
            await world.run(paintThere);
            await ticks.until(() => ticks.seen.length > k);
        }
        world.remove(paintReader);
        ticks.stop();
        expect(ticks.seen.flatMap(report => report.failures.map(failure => failure.message))).toEqual([]);
        expect(reported.errors).toEqual([]);
        await world.dispose();
        await remote.dispose();
    });
    it("are skipped with a \"thread\" failure once their thread is gone, and run here once its claims are released", async () => {
        const { world, remote } = await joined();
        await world.run(crowd, { count: 1 });
        await world.run(write);
        const leaving = remote.dispose();
        const report = await runReported(world, write);
        await leaving;
        expect(report.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["thread", "write", 'Thread "threadSystemsTest" is gone, so its systems don\'t run.']]);
        expect(report.skipped).toEqual(["write"]);
        const [entity] = await Observe.toPromise(Observe.select(world, { required: [uid] }));
        expect(await runReported(world, write)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(await Observe.toPromise(Observe.entity(world, entity, { required: [caption] }))).toEqual({ [caption]: { text: "written" } });
        await world.dispose();
    });
    it("fail every system of a task the thread can't view the memory for, its first and a later one, rather than report they ran", async () => {
        const world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        // The memory the thread is given, whose header's first word is the length in pages the world stored.
        const given = new Promise<WebAssembly.Memory>(resolve => {
            channel.port2.addEventListener("message", (event: MessageEvent<unknown>) => {
                const memory: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "memory") : undefined;
                if (memory instanceof WebAssembly.Memory) resolve(memory);
            });
        });
        const shared = world.share(channel.port1);
        const remote = await join(channel.port2, { threads: ["threadSystemsTest"] });
        await shared;
        await world.run(crowd, { count: 1 });
        const header = new Uint32Array((await given).buffer, 0, 1);
        const pages = Atomics.load(header, 0);
        recorderOf(world);
        const failuresOf = async (running: Promise<unknown>) => (await reportOf(world, running)).failures.map(failure => [failure.kind, failure.name, failure.message]);
        /** A run of `write` while the world says the memory is a page longer than it is: its failures, or null once it never settles. */
        const short = async () => {
            Atomics.store(header, 0, pages + 1);
            const failures = await Promise.race([failuresOf(world.run(write)), new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))]);
            Atomics.store(header, 0, pages);
            return failures;
        };
        const failed = [["system", "write", `This thread's memory is ${pages * pageBytes} bytes, short of the ${(pages + 1) * pageBytes} the world stored.`]];
        expect([await short(), await failuresOf(world.run(write)), await short(), await failuresOf(world.run(write))]).toEqual([failed, [], failed, []]);
        await remote.dispose();
        await world.dispose();
    });
});