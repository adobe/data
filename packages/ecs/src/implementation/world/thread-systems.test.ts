// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { pageBytes } from "./memory.js";
import { Observe } from "../../observe/index.js";
import { caption, changes, countWritten, crowd, flagCrowd, giveKept, kept, objectsThere, scenario, spawnKept, uid, unflagCrowd, write } from "./thread-systems.test-helper.js";
import { reportOf, runReported } from "./reports.test-helper.js";

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

/** Once the thread shared last has status `status`. */
const statusOf = (world: CreatedWorld, status: "joined" | "gone") =>
    until(world.threads, threads => threads.at(-1)?.status === status);

/** A world shared with a thread on this one, which claims the systems' thread. */
const joined = async (): Promise<{ readonly world: CreatedWorld; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["threadSystemsTest"] });
    await statusOf(world, "joined");
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
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["threadSystemsTest"] });
        await statusOf(world, "joined");
        await world.run(crowd, { count: 1 });
        const header = new Uint32Array((await given).buffer, 0, 1);
        const pages = Atomics.load(header, 0);
        /** A run of `write` while the world says the memory is a page longer than it is: its number, or null once it never settles. */
        const short = async () => {
            Atomics.store(header, 0, pages + 1);
            const ran = await Promise.race([world.run(write), new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))]);
            Atomics.store(header, 0, pages);
            return ran;
        };
        const failuresOf = async (ran: number | null) => ran === null ? null : (await reportOf(world, ran)).failures.map(failure => [failure.kind, failure.name, failure.message]);
        const failed = [["system", "write", `This thread's memory is ${pages * pageBytes} bytes, short of the ${(pages + 1) * pageBytes} the world stored.`]];
        // Read once every run ran, as the thread saw them.
        const runs = [await short(), await world.run(write), await short(), await world.run(write)];
        expect(await Promise.all(runs.map(failuresOf))).toEqual([failed, [], failed, []]);
        await remote.dispose();
        await world.dispose();
    });
});