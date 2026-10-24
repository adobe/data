// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { runReported } from "./reports.test-helper.js";

// Objects a joined thread fills, with the world and the thread on this one, joined through a MessageChannel.

const point = Symbol("remoteTest/point");
const caption = Symbol("remoteTest/caption");
const widget = Symbol("remoteTest/widget");
const kept = Symbol("remoteTest/kept");
const guarded = Symbol("remoteTest/guarded");
const handle = Symbol("remoteTest/handle");
declare module "@adobe/ecs" {
    export interface Threads {
        remoteTest: true;
        remoteTestFinalized: true;
    }
    export interface Components {
        [point]: { type: number };
        [caption]: { type: { readonly text: string } | null; thread: "remoteTest"; default: typeof none };
        [widget]: { type: Widget | null; thread: "remoteTest" };
        [kept]: { type: string };
        [guarded]: { type: Widget | null; thread: "remoteTestFinalized" };
        [handle]: { type: Widget | number | null; thread: "remoteTest" };
    }
}
/** A value that isn't data. */
type Widget = { readonly draw: () => string };
/** The caption's start, which a command here gives it by this value. */
const none = { text: "none" };
/** A widget, or the number a kernel gives one, which only the world's thread could hold. */

const spawn = System.create({}, ({ commands }, input: { readonly x: number }) => {
    commands.spawn([point, caption, widget, kept])({ [point]: input.x, [kept]: `k${input.x}`, [widget]: null });
});
const nullCaptions = System.create({ components: { has: [caption, point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, null);
});
const restartCaptions = System.create({ components: { has: [caption, point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, none);
});
const dropCaptions = System.create({ components: { has: [caption] } }, (row, { commands }) => {
    commands.remove(row.entity, caption);
});
const giveCaption = System.create({ components: { has: [point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, { text: "a caption only the thread gives" });
});
const spawnCaptioned = System.create({}, ({ commands }) => {
    commands.spawn([point, caption])({ [point]: 1, [caption]: { text: "a caption only the thread gives" } });
});
/** A kernel giving the thread's objects null, which they take, and a number, which they don't. */
const nullCaptionsKernel = System.create({ kernel: "cpu", components: { has: [caption], read: [point] } }, (row, { commands }) => {
    if (row[point] > 0) commands.add(row.entity, caption, null);
});
const numberHandlesKernel = System.create({ kernel: "cpu", components: { read: [point] } }, (row, { commands }) => {
    commands.add(row.entity, handle, row[point]);
});
/** Reaches its commands, so it isn't terminal: its tier blocks rather than running as a tail. */
const readCaptions = System.create({ components: { read: [caption] } }, (row, { commands }) => {
    if (row[caption]?.text === "never") commands.despawn(row.entity);
});
const idle = System.create({}, () => {});
const after = System.create({}, () => {});
Finalizer.create({ components: { read: [guarded] } }, () => {});

/** A world shared with a thread on this one, which claims `threads`. */
const joined = (threads: readonly ("remoteTest" | "remoteTestFinalized")[] = ["remoteTest"]): { readonly world: CreatedWorld; readonly remote: World } => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads });
    return { world, remote };
};

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

/** The entity a run of `spawn` spawned. */
const spawnOne = async (world: World, x: number): Promise<Entity> => {
    await world.run(spawn, { x });
    const [entity] = await Observe.toPromise(Observe.select(world, { required: [point], where: { [point]: x } }));
    return entity;
};

describe("objects a joined thread fills", () => {
    // The cases of observers reading them are in `observe-joined-cases.test.ts`.
    it("take from the world's thread only their start or null, in commands and spawns", async () => {
        const { world, remote } = joined();
        await statusOf(world, "joined");
        await spawnOne(world, 2);
        const message = '"remoteTest/caption" lives on thread "remoteTest", which a joined thread fills, so a command here gives it only its start or null.';
        expect((await runReported(world, giveCaption)).failures.map(failure => failure.message)).toEqual([message]);
        expect((await runReported(world, spawnCaptioned)).failures.map(failure => failure.message)).toEqual([message]);
        expect(await Observe.toPromise(Observe.count(world, { required: [caption] }))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("take from a kernel only their start or null, its command giving another dropping and its system failing", async () => {
        const { world, remote } = joined();
        await statusOf(world, "joined");
        const entity = await spawnOne(world, 6);
        const listed = Observe.entity(remote, entity, { required: [caption, widget] });
        expect(await until(listed, value => value !== null)).toEqual({ [caption]: none, [widget]: null });
        expect((await runReported(world, nullCaptionsKernel)).failures).toEqual([]);
        expect(await until(listed, value => value?.[caption] === null)).toEqual({ [caption]: null, [widget]: null });
        const report = await runReported(world, numberHandlesKernel);
        expect(report.failures.map(failure => [failure.name, failure.message])).toEqual([["numberHandlesKernel", '"remoteTest/handle" lives on thread "remoteTest", which a joined thread fills, so a command here gives it only its start or null.']]);
        expect(report.dropped).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("are read by systems that run on the thread, their tiers warned of", async () => {
        const { world, remote } = joined();
        await statusOf(world, "joined");
        await spawnOne(world, 3);
        expect(await runReported(world, readCaptions)).toEqual({
            failures: [], skipped: [], dropped: 0,
            warnings: [{ kind: "blocking", name: "readCaptions", id: "@adobe/ecs@0.1.1/src/implementation/world/remote.test.ts#readCaptions", message: 'System "readCaptions" runs on thread "remoteTest", which a joined thread fills, so its tier waits for that thread.' }],
        });
        await remote.dispose();
        await world.dispose();
    });
    it("come back to the world's thread when the thread that filled them is gone, as the start or null each held", async () => {
        const { world, remote } = joined();
        await statusOf(world, "joined");
        const first = await spawnOne(world, 4);
        await world.run(nullCaptions);
        const second = await spawnOne(world, 5);
        await remote.dispose();
        await statusOf(world, "gone");
        await world.run(after);
        expect(await Observe.toPromise(Observe.entity(world, first, { required: [caption, widget] }))).toEqual({ [caption]: null, [widget]: null });
        expect(await Observe.toPromise(Observe.entity(world, second, { required: [caption] }))).toEqual({ [caption]: none });
        expect((await runReported(world, readCaptions)).failures).toEqual([]);
        await world.dispose();
    });
    it("refuse a claim of a thread whose finalizers or systems the joined thread can't run, and take one whose systems it imported", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(readCaptions);
        const taken = joined();
        await statusOf(taken.world, "joined");
        expect((await runReported(taken.world, readCaptions)).warnings.map(warning => warning.name)).toEqual(["readCaptions"]);
        await taken.remote.dispose();
        await taken.world.dispose();
        // Declared in a function, so the build gives it no id, and another thread can't name it.
        const unnamed = System.create({ components: { read: [caption] } }, row => { void row[caption]; });
        await world.run(unnamed);
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["remoteTest"] });
        await expect(remote.run(idle)).rejects.toThrow('System "unnamed" runs on thread "remoteTest" and has no id, so a joined thread can\'t run it');
        await statusOf(world, "gone");
        await remote.dispose();
        const other = joined(["remoteTestFinalized"]);
        // Declared without a binding, so the build gives it no id.
        await expect(other.remote.run(idle)).rejects.toThrow(/Finalizer "finalizer #\d+" runs on thread "remoteTestFinalized" and has no id, so a joined thread can't run it/);
        await other.remote.dispose();
        await other.world.dispose();
        await world.dispose();
    });
});
