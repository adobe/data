import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { threadStatus } from "../../interface/components/index.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Observe } from "../../interface/observe/observe.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";

// Objects a joined thread fills, with the world and the thread on this one, joined through a MessageChannel.

const point = Symbol("remoteTest/point");
const caption = Symbol("remoteTest/caption");
const widget = Symbol("remoteTest/widget");
const kept = Symbol("remoteTest/kept");
const guarded = Symbol("remoteTest/guarded");
const handle = Symbol("remoteTest/handle");
declare module "@adobe/data-ecs" {
    export interface Threads {
        remoteTest: true;
        remoteTestFinalized: true;
    }
    export interface Components {
        [point]: typeof pointTraits;
        [caption]: typeof captionTraits;
        [widget]: typeof widgetTraits;
        [kept]: typeof keptTraits;
        [guarded]: typeof guardedTraits;
        [handle]: typeof handleTraits;
    }
}
/** A value that isn't data. */
type Widget = { readonly draw: () => string };
const pointTraits = Component.register(point, { type: { type: "number" } });
const captionTraits = Component.register(caption, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: "none" }, thread: "remoteTest" });
const widgetTraits = Component.register(widget, { type: Component.object<Widget | null>(), thread: "remoteTest" });
const keptTraits = Component.register(kept, { type: { type: "string" } });
/** A widget, or the number a kernel gives one, which only the world's thread could hold. */
const handleTraits = Component.register(handle, { type: Component.object<Widget | number | null>(), thread: "remoteTest" });
const guardedTraits = Component.register(guarded, { type: Component.object<Widget | null>(), thread: "remoteTestFinalized" });

const spawn = System.create({ name: "remoteTest/spawn", input: { type: "object", properties: { x: { type: "number" } } } }, ({ input, commands }) => {
    commands.spawn([point, caption, widget, kept])({ [point]: input.x, [kept]: `k${input.x}`, [widget]: null });
});
const nullCaptions = System.create({ name: "remoteTest/nullCaptions", components: { has: [caption, point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, null);
});
const restartCaptions = System.create({ name: "remoteTest/restartCaptions", components: { has: [caption, point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, "none");
});
const dropCaptions = System.create({ name: "remoteTest/dropCaptions", components: { has: [caption] } }, (row, { commands }) => {
    commands.remove(row.entity, caption);
});
const giveCaption = System.create({ name: "remoteTest/giveCaption", components: { has: [point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, "a caption only the thread gives");
});
const spawnCaptioned = System.create({ name: "remoteTest/spawnCaptioned" }, ({ commands }) => {
    commands.spawn([point, caption])({ [point]: 1, [caption]: "a caption only the thread gives" });
});
/** A kernel giving the thread's objects null, which they take, and a number, which they don't. */
const nullCaptionsKernel = System.create({ name: "remoteTest/nullCaptionsKernel", kernel: "cpu", components: { has: [caption], read: [point] } }, (row, { commands }) => {
    if (row[point] > 0) commands.add(row.entity, caption, null);
});
const numberHandlesKernel = System.create({ name: "remoteTest/numberHandlesKernel", kernel: "cpu", components: { read: [point] } }, (row, { commands }) => {
    commands.add(row.entity, handle, row[point]);
});
const readCaptions = System.create({ name: "remoteTest/readCaptions", components: { read: [caption] } }, row => {
    void row[caption];
});
const idle = System.create({ name: "remoteTest/idle" }, () => {});
const after = System.create({ name: "remoteTest/after" }, () => {});
Finalizer.create({ name: "remoteTest/releaseGuarded", components: { read: [guarded] } }, () => {});

/** A world shared with a thread on this one, which claims `threads`. */
const joined = (threads: readonly ("remoteTest" | "remoteTestFinalized")[] = ["remoteTest"]): { readonly world: World; readonly thread: Entity; readonly remote: World } => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const thread = world.share(channel.port1);
    const remote = join(channel.port2, { threads });
    return { world, thread, remote };
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

const statusOf = (world: World, thread: Entity, status: "joined" | "gone") =>
    until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === status);

/** The entity a run of `spawn` spawned. */
const spawnOne = async (world: World, x: number): Promise<Entity> => {
    await world.run(spawn, { x });
    const [entity] = await Observe.toPromise(world.observe.select({ required: [point], where: { [point]: x } }));
    return entity;
};

describe("objects a joined thread fills", () => {
    it("are the thread's own, at their starts or null as the world's commands give them, which its observers read", async () => {
        const { world, thread, remote } = joined();
        await statusOf(world, thread, "joined");
        const entity = await spawnOne(world, 1);
        const listed = remote.observe.entity(entity, { required: [point, caption], optional: [widget] });
        expect(await until(listed, value => value !== null)).toEqual({ [point]: 1, [caption]: "none", [widget]: null });
        await world.run(nullCaptions);
        expect(await until(listed, value => value?.[caption] === null)).toEqual({ [point]: 1, [caption]: null, [widget]: null });
        await world.run(restartCaptions);
        expect(await until(listed, value => value?.[caption] === "none")).toEqual({ [point]: 1, [caption]: "none", [widget]: null });
        // The whole entity: its structs and this thread's objects, not the world's.
        expect(await until(remote.observe.entity(entity), value => value !== null)).toEqual({ [point]: 1, [caption]: "none", [widget]: null });
        await world.run(dropCaptions);
        expect(await until(listed, value => value === null)).toBeNull();
        expect(await until(remote.observe.entity(entity, { required: [point], optional: [caption] }), value => value !== null)).toEqual({ [point]: 1 });
        await remote.dispose();
        await world.dispose();
    });
    it("take from the world's thread only their start or null, in commands and spawns", async () => {
        const { world, thread, remote } = joined();
        await statusOf(world, thread, "joined");
        await spawnOne(world, 2);
        const message = '"remoteTest/caption" lives on thread "remoteTest", which a joined thread fills, so a command here gives it only its start or null.';
        expect((await world.run(giveCaption)).failures.map(failure => failure.message)).toEqual([message]);
        expect((await world.run(spawnCaptioned)).failures.map(failure => failure.message)).toEqual([message]);
        expect(await Observe.toPromise(world.observe.count({ required: [caption] }))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("take from a kernel only their start or null, its command giving another dropping and its system failing", async () => {
        const { world, thread, remote } = joined();
        await statusOf(world, thread, "joined");
        const entity = await spawnOne(world, 6);
        const listed = remote.observe.entity(entity, { required: [caption, widget] });
        expect(await until(listed, value => value !== null)).toEqual({ [caption]: "none", [widget]: null });
        expect((await world.run(nullCaptionsKernel)).failures).toEqual([]);
        expect(await until(listed, value => value?.[caption] === null)).toEqual({ [caption]: null, [widget]: null });
        const report = await world.run(numberHandlesKernel);
        expect(report.failures.map(failure => [failure.name, failure.message])).toEqual([["remoteTest/numberHandlesKernel", '"remoteTest/handle" lives on thread "remoteTest", which a joined thread fills, so a command here gives it only its start or null.']]);
        expect(report.dropped).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("can't be read by observers on the world's thread; systems reading them run on the thread, their tiers warned of", async () => {
        const { world, thread, remote } = joined();
        await statusOf(world, thread, "joined");
        const entity = await spawnOne(world, 3);
        expect(() => world.observe.entity(entity, { required: [caption] })(() => {})).toThrow('An observer reads "remoteTest/caption", an object a joined thread fills, which only an observer there reads.');
        expect(() => world.observe.select({ required: [point, caption], where: { [caption]: "none" } })(() => {})).toThrow('An observer reads "remoteTest/caption"');
        // Its whole value is the world's own.
        expect(await Observe.toPromise(world.observe.entity(entity))).toEqual({ [point]: 3, [kept]: "k3" });
        expect(await world.run(readCaptions)).toEqual({
            failures: [], skipped: [], dropped: 0,
            warnings: [{ kind: "blocking", name: "remoteTest/readCaptions", message: 'System "remoteTest/readCaptions" runs on thread "remoteTest", which a joined thread fills, so its tier waits for that thread.' }],
        });
        await remote.dispose();
        await world.dispose();
    });
    it("come back to the world's thread when the thread that filled them is gone, as the start or null each held", async () => {
        const { world, thread, remote } = joined();
        await statusOf(world, thread, "joined");
        const first = await spawnOne(world, 4);
        await world.run(nullCaptions);
        const second = await spawnOne(world, 5);
        await remote.dispose();
        await statusOf(world, thread, "gone");
        await world.run(after);
        expect(await Observe.toPromise(world.observe.entity(first, { required: [caption, widget] }))).toEqual({ [caption]: null, [widget]: null });
        expect(await Observe.toPromise(world.observe.entity(second, { required: [caption] }))).toEqual({ [caption]: "none" });
        expect((await world.run(readCaptions)).failures).toEqual([]);
        await world.dispose();
    });
    it("refuse a claim of a thread whose finalizers or systems the joined thread can't run, and take one whose systems it imported", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(readCaptions);
        const taken = joined();
        await statusOf(taken.world, taken.thread, "joined");
        expect((await taken.world.run(readCaptions)).warnings.map(warning => warning.name)).toEqual(["remoteTest/readCaptions"]);
        await taken.remote.dispose();
        await taken.world.dispose();
        // Declared in a function, so the build gives it no id, and another thread can't name it.
        const unnamed = System.create({ name: "remoteTest/unnamed", components: { read: [caption] } }, row => { void row[caption]; });
        await world.run(unnamed);
        const channel = new MessageChannel();
        const thread = world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["remoteTest"] });
        await expect(remote.run(idle)).rejects.toThrow('System "remoteTest/unnamed" runs on thread "remoteTest" and has no id, so a joined thread can\'t run it');
        await statusOf(world, thread, "gone");
        await remote.dispose();
        const other = joined(["remoteTestFinalized"]);
        // Declared without a binding, so the build gives it no id.
        await expect(other.remote.run(idle)).rejects.toThrow('Finalizer "remoteTest/releaseGuarded" runs on thread "remoteTestFinalized" and has no id, so a joined thread can\'t run it');
        await other.remote.dispose();
        await other.world.dispose();
        await world.dispose();
    });
});
