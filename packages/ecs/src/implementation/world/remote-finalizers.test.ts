// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Observe } from "../../observe/index.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { indexOf } from "./entities.js";
import { attach, despawn, eventually, finalized, marked, place, released, retone, scenario, serial, sorted, spawn, throwing, tone, widget } from "./remote-finalizers.test-helper.js";
import { runReported } from "./reports.test-helper.js";

/** Resources of the world's thread, each added once the thread joined, so the resource entity moves to another archetype. */
const later = Symbol("remoteFinalizersTest/later");
const second = Symbol("remoteFinalizersTest/second");
const third = Symbol("remoteFinalizersTest/third");
declare module "@adobe/ecs" {
    export interface Resources {
        [later]: { type: number };
        [second]: { type: number };
        [third]: { type: number };
    }
}
const bump = System.create({  }, ({ resources }) => {
    resources[later] += 1;
});
const bumpSecond = System.create({  }, ({ resources }) => {
    resources[second] += 1;
});
const bumpThird = System.create({  }, ({ resources }) => {
    resources[third] += 1;
});

// Finalizers on a joined thread, with the world and the thread on this one, joined through a MessageChannel.

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

/** A world shared with a thread on this one, which claims the finalizers' thread. */
const joined = async (): Promise<{ readonly world: CreatedWorld; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["remoteFinalizersTest"] });
    await statusOf(world, "joined");
    return { world, remote };
};

const reset = (): void => {
    released.length = 0;
    finalized.length = 0;
    throwing.clear();
};

describe("finalizers on a joined thread", () => {
    it("leave a joined thread's objects out of a changes finalizer watching everything here, as whole-entity observers do", async () => {
        reset();
        const seen: (readonly symbol[] | null)[][] = [];
        let watching = false;
        Finalizer.changes({}, changes => {
            if (watching) for (const group of changes.groups) seen.push([group.to, group.added]);
        });
        const { world, remote } = await joined();
        watching = true;
        await world.run(spawn, { from: 0, count: 1 });
        watching = false;
        expect(seen).toEqual([[[serial, place, marked], [serial, place, marked]]]);
        await remote.dispose();
        await world.dispose();
    });
    it("run once per stop there, as an inline world's do: structs before the sync point applies, the thread's objects at their starts, null, written or staged, after its log lapped too", async () => {
        reset();
        const inline = createWorld({ [workers]: 0 });
        const expected = await scenario(inline, () => released.length);
        await inline.dispose();
        const inlineStops = sorted(released);
        reset();
        const { world, remote } = await joined();
        const seen = await scenario(world, () => released.length, expected);
        expect(seen).toEqual(expected);
        await world.dispose();
        expect(await eventually(() => released.length === inlineStops.length)).toBe(true);
        expect(sorted(released)).toEqual(inlineStops);
        expect(released.find(stop => stop.serial === 1)).toEqual({ serial: 1, place: [101, -1], marked: true, widget: "w1", label: "l1", tone: "quiet" });
        expect(released.find(stop => stop.serial === 2)).toEqual({ serial: 2, place: [102, -2], marked: true, widget: "w2", label: "none", tone: "quiet" });
        // Removing a widget stops it there, which a despawn later doesn't again.
        expect(released.filter(stop => stop.serial === 3)).toEqual([{ serial: 3, place: [103, -3], marked: true, widget: "w3", label: "l3", tone: "quiet" }]);
        expect(released.find(stop => stop.serial === 299)).toEqual({ serial: 299, place: [299, -299], marked: true, widget: "w299", label: "l299", tone: "loud" });
        await remote.dispose();
    });
    it("run before the index of an entity they stopped is reused", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 20 });
        const stopped = new Map<number, Entity>();
        let reusedEarly = 0;
        let reused = 0;
        // Spawns check each entity they reserve: an index whose last entity stopped is reused only once it was finalized.
        const check = System.create(identify({}, "remoteFinalizersTest#check"), ({ commands }, input: { readonly serial: number }) => {
            const entity = commands.spawn([serial, place, marked, widget])({ [serial]: input.serial, [place]: [0, 0], [widget]: null });
            const before = stopped.get(indexOf(entity));
            if (before === undefined) return;
            reused++;
            if (!finalized.includes(before)) reusedEarly++;
        });
        const entities = await Observe.toPromise(Observe.select(world, { required: [serial] }));
        for (const entity of entities) stopped.set(indexOf(entity), entity);
        const runs: Promise<unknown>[] = [];
        for (let k = 0; k < 20; k++) {
            // Not awaited: the next run starts before the thread had a turn to finalize.
            runs.push(world.run(despawn, { serials: [k] }), world.run(check, { serial: 1000 + k }));
        }
        await Promise.all(runs);
        expect(await eventually(() => finalized.length === 20)).toBe(true);
        for (let k = 0; k < 20; k++) await world.run(check, { serial: 2000 + k });
        expect(reusedEarly).toBe(0);
        expect(reused).toBeGreaterThan(0);
        await remote.dispose();
        await world.dispose();
    });
    it("that throw are in a later run's report", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 3 });
        throwing.add(1);
        await world.run(despawn, { serials: [0, 1, 2] });
        expect(await eventually(() => released.length === 3)).toBe(true);
        // Its failure reaches the world by message, in time for a later run.
        let report = await runReported(world, despawn, { serials: [] });
        for (let k = 0; k < 100 && report.failures.length === 0; k++) {
            await new Promise(resolve => setTimeout(resolve, 1));
            report = await runReported(world, despawn, { serials: [] });
        }
        expect(report.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["finalizer", "release", "remoteFinalizersTest: 1 throws"]]);
        expect((await runReported(world, despawn, { serials: [] })).failures).toEqual([]);
        await remote.dispose();
        await world.dispose();
    });
    it("run there for every entity they match once the world is disposed, after the stops published", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 5 });
        await world.run(attach);
        await world.run(despawn, { serials: [4] });
        await world.dispose();
        expect(await eventually(() => released.length === 5)).toBe(true);
        expect(released.map(stop => [stop.serial, stop.widget])).toEqual([[4, "w4"], [0, "w0"], [1, "w1"], [2, "w2"], [3, "w3"]]);
        await remote.dispose();
    });
    it("finalize what was published when their thread leaves, and run on the world's thread once it's gone", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 3 });
        await world.run(attach);
        await world.run(despawn, { serials: [0] });
        await remote.dispose();
        await statusOf(world, "gone");
        expect(released.map(stop => [stop.serial, stop.widget])).toEqual([[0, "w0"]]);
        // Its objects came back as their starts, with the thread's values its own.
        const report = await runReported(world, despawn, { serials: [1] });
        expect(report.failures).toEqual([]);
        expect(released.map(stop => [stop.serial, stop.widget])).toEqual([[0, "w0"], [1, null]]);
        await world.dispose();
        expect(released.map(stop => stop.serial)).toEqual([0, 1, 2]);
    });
    it("read their thread's object resource as the thread holds it, from the first sync point after joining and once the resource entity moved before they ran", async () => {
        reset();
        const { world, remote } = await joined();
        // Stops the thread runs as it first rebuilds, before it holds any row.
        await world.run(spawn, { from: 0, count: 3 });
        await world.run(despawn, { serials: [0] });
        expect(await eventually(() => released.length === 1)).toBe(true);
        await world.run(retone, { tone: "soft" });
        // Not awaited: the resource entity moves to another archetype before the thread replays the stop's sync.
        await Promise.all([world.run(despawn, { serials: [1] }), world.run(bump)]);
        expect(await eventually(() => released.length === 2)).toBe(true);
        expect(released.map(stop => [stop.serial, stop.tone])).toEqual([[0, "quiet"], [1, "soft"]]);
        await remote.dispose();
        await world.dispose();
    });
    it("read their thread's object resource where the resource entity moved since it was last found, before a later write applies", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 3 });
        await world.run(despawn, { serials: [0] });
        expect(await eventually(() => released.length === 1)).toBe(true);
        // Replayed, not rebuilt: the resource entity is found in the mirror.
        await world.run(despawn, { serials: [1] });
        expect(await eventually(() => released.length === 2)).toBe(true);
        await world.run(bump);
        await world.run(retone, { tone: "soft" });
        // The write after the stop's sync is a task the thread runs once it replayed that sync.
        await Promise.all([world.run(despawn, { serials: [2] }), world.run(retone, { tone: "loud" })]);
        expect(await eventually(() => released.length === 3)).toBe(true);
        expect(released.map(stop => [stop.serial, stop.tone])).toEqual([[0, "quiet"], [1, "quiet"], [2, "soft"]]);
        await remote.dispose();
        await world.dispose();
    });
    it("read their thread's object resource once the resource entity moved twice before the thread replayed", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 2 });
        await world.run(despawn, { serials: [0] });
        expect(await eventually(() => released.length === 1)).toBe(true);
        await world.run(retone, { tone: "soft" });
        await Promise.all([world.run(despawn, { serials: [1] }), world.run(bumpSecond), world.run(bumpThird)]);
        expect(await eventually(() => released.length === 2)).toBe(true);
        expect(released.map(stop => [stop.serial, stop.tone])).toEqual([[0, "quiet"], [1, "soft"]]);
        await remote.dispose();
        await world.dispose();
    });
    // Last: the finalizers it creates stay in the program.
    it("created after the claim run there; one the thread can't name doesn't activate, reported once", async () => {
        reset();
        const { world, remote } = await joined();
        await world.run(spawn, { from: 0, count: 2 });
        const late: string[] = [];
        Finalizer.create(identify({ components: { with: [widget, serial] } }, "remoteFinalizersTest#late"), row => { late.push(`${row[serial]}:${String(row[widget])}`); });
        // Declared in a function, so the build gives it no id.
        Finalizer.create({ components: { with: [widget] } }, row => { void row[widget]; });
        const first = await runReported(world, despawn, { serials: [0] });
        expect(first.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["finalizer", expect.stringMatching(/^finalizer #\d+$/), expect.stringMatching(/^Finalizer "finalizer #\d+" runs on thread "remoteFinalizersTest", which a joined thread fills, and has no id, so that thread can't name it; the build gives top-level finalizers one\.$/)]]);
        expect(await eventually(() => late.length === 1)).toBe(true);
        expect((await runReported(world, despawn, { serials: [1] })).failures).toEqual([]);
        expect(await eventually(() => late.length === 2)).toBe(true);
        expect(late).toEqual(["0:null", "1:null"]);
        // Placed there by the thread's object resource alone: stops of rows holding none of its objects, which its log
        // has no entries for, run there too.
        const heard: string[] = [];
        Finalizer.create(identify({ components: { with: [serial], not: [widget] } }, "remoteFinalizersTest#heard"), (row, { resources }) => { heard.push(`${row[serial]}:${resources[tone].text}`); });
        const plain = System.create({}, ({ commands }) => {
            for (let k = 0; k < 3; k++) commands.spawn([serial, place])({ [serial]: 50 + k, [place]: [0, 0] });
        });
        await world.run(plain);
        await world.run(retone, { tone: "soft" });
        expect((await runReported(world, despawn, { serials: [50, 52] })).failures).toEqual([]);
        expect(await eventually(() => heard.length === 2)).toBe(true);
        expect(heard).toEqual(["50:soft", "52:soft"]);
        await remote.dispose();
        await world.dispose();
    });
});
