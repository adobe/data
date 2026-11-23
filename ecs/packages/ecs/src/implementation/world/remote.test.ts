// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { ownId } from "./package-id.test-helper.js";
import { runReported } from "./outcomes.test-helper.js";

// Objects a joined thread fills, with the world and the thread on this one, joined through a MessageChannel.

const point = Symbol("remoteTest/point");
const caption = Symbol("remoteTest/caption");
const widget = Symbol("remoteTest/widget");
const kept = Symbol("remoteTest/kept");
const guarded = Symbol("remoteTest/guarded");
const handle = Symbol("remoteTest/handle");
const filter = Symbol("remoteTest/filter");
const owner = Symbol("remoteTest/owner");
const painter = Symbol("remoteTest/painter");
declare module "@adobe/ecs" {
    export interface Threads {
        remoteTest: true;
        remoteTestRemoved: true;
    }
    export interface Components {
        [point]: { type: number };
        [caption]: { type: Caption; thread: "remoteTest" };
        [widget]: { type: Widget | null; thread: "remoteTest" };
        [kept]: { type: string };
        [guarded]: { type: Widget | null; thread: "remoteTestRemoved" };
        [handle]: { type: Widget | number | null; thread: "remoteTest" };
    }
    export interface Resources {
        [filter]: { type: { readonly text: string; readonly owner: Entity } | null; thread: "remoteTest"; default: null };
        [owner]: { type: Entity };
        [painter]: { type: Widget | null; thread: "remoteTest"; default: null };
    }
}
/** A value that isn't data. */
type Widget = { readonly draw: () => string };
/** The caption's start, which a command here gives it by this value. */
const none = { text: "none" } as const;
/** A caption, which starts as `none`, the value commands on other threads give it by identity. */
type Caption = { readonly text: string } | null;
const Caption = { default: none };
/** A widget, or the number a kernel gives one, which only the world's thread could hold. */

const spawn = System.create({}, ({ commands }, input: { readonly x: number }) => {
    commands.spawn([point, caption, widget, kept])({ [point]: input.x, [kept]: `k${input.x}`, [widget]: null });
});
const nullCaptions = System.create({ components: { with: [caption, point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, null);
});
const restartCaptions = System.create({ components: { with: [caption, point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, none);
});
const dropCaptions = System.create({ components: { with: [caption] } }, (row, { commands }) => {
    commands.remove(row.entity, caption);
});
const giveCaption = System.create({ components: { with: [point] } }, (row, { commands }) => {
    commands.add(row.entity, caption, { text: "a caption only the thread gives" });
});
const giveWidget = System.create({ components: { with: [point] } }, (row, { commands }) => {
    commands.add(row.entity, widget, { draw: () => "drawn" });
});
const spawnCaptioned = System.create({}, ({ commands }) => {
    commands.spawn([point, caption])({ [point]: 1, [caption]: { text: "a caption only the thread gives" } });
});
/** A kernel giving the thread's objects null, which they take, and a number, which they don't. */
const nullCaptionsKernel = System.create({ kernel: true, components: { with: [point, caption] } }, (row, { commands }) => {
    if (row[point] > 0) commands.add(row.entity, caption, null);
});
const numberHandlesKernel = System.create({ kernel: true, components: { with: [point] } }, (row, { commands }) => {
    commands.add(row.entity, handle, row[point]);
});
/** Reaches its commands, so it isn't terminal: its tier blocks rather than running as a tail. */
const readCaptions = System.create({ components: { with: [caption] } }, (row, { commands }) => {
    if (row[caption]?.text === "never") commands.despawn(row.entity);
});
const idle = System.create({}, () => {});
const after = System.create({}, () => {});
/** Declared without a binding, so the build gives it no id. */
const [guard] = [System.removed({ components: { with: [guarded] } }, row => { void row[guarded]; })];

const spawnTablesGiven: { resources: { readonly [key: symbol]: unknown } } = { resources: {} };
const setResources = System.create(({ commands }) => { commands.spawnTables([], { resources: spawnTablesGiven.resources }); });
/** Spawns one entity by a table, setting resources naming it. */
const spawnNamed = System.create(({ commands }) => {
    const { entities } = commands.spawnTables([{ count: 1, entities: new Float64Array([7]), columns: { [point]: { kind: "bytes", bytes: new Uint8Array(new Float64Array([9]).buffer), stride: 8 } } }], { resources: spawnTablesGiven.resources });
    return entities[0][0];
});

const captionTables = System.create({ readonly: true, tables: { components: [caption, point], resources: [filter] } }, ({ tables }) => tables);
const widgetTables = System.create({ readonly: true, tables: { components: [widget] } }, ({ tables }) => tables);

/** A world shared with a thread on this one, which claims `threads`. */
const joined = async (): Promise<{ readonly world: CreatedWorld; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const shared = world.share(channel.port1);
    const remote = await join(channel.port2, { threads: ["remoteTest"] });
    await shared;
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
const statusOf = (world: CreatedWorld, status: "gone") =>
    until(world.threads, threads => threads.at(-1)?.status === status);

/** The entity a run of `spawn` spawned. */
const spawnOne = async (world: World, x: number): Promise<Entity> => {
    await world.run(spawn, { x });
    const [entity] = await Observe.toPromise(Observe.select(world, { required: [point], where: { [point]: x } }));
    return entity;
};

describe("objects a joined thread fills", () => {
    // The cases of observers reading them are in `observe-joined-cases.test.ts`.
    it("take data from the world's thread's commands and spawns, delivered at the sync point, and values that aren't only their start or null", async () => {
        const { world, remote } = await joined();
        const entity = await spawnOne(world, 2);
        expect((await runReported(world, giveCaption)).failures).toEqual([]);
        const listed = Observe.entity(remote, entity, { required: [caption] });
        expect(await until(listed, value => value?.[caption]?.text === "a caption only the thread gives")).toEqual({ [caption]: { text: "a caption only the thread gives" } });
        expect((await runReported(world, spawnCaptioned)).failures).toEqual([]);
        expect(await Observe.toPromise(Observe.count(world, { required: [caption] }))).toBe(2);
        const message = '"remoteTest/widget" lives on thread "remoteTest", which a joined thread fills, and isn\'t data, so a command here gives it only its start or null.';
        expect((await runReported(world, giveWidget)).failures.map(failure => failure.message)).toEqual([message]);
        expect(await Observe.toPromise(Observe.entity(remote, entity, { required: [widget] }))).toEqual({ [widget]: null });
        await remote.dispose();
        await world.dispose();
    });
    it("take resources a joined thread fills from commands.spawnTables, delivered with their entities rewritten, and not those that aren't data", async () => {
        const { world, remote } = await joined();
        spawnTablesGiven.resources = { [filter]: { text: "found", owner: 7 }, [owner]: 7 };
        const entity = await world.run(spawnNamed);
        expect(entity).not.toBe(7);
        expect(await until(Observe.resource(remote, filter), value => value !== null)).toEqual({ text: "found", owner: entity });
        expect(await Observe.toPromise(Observe.resource(world, owner))).toBe(entity);
        spawnTablesGiven.resources = { [painter]: { draw: () => "drawn" } };
        await expect(world.run(setResources)).rejects.toThrow('commands.spawnTables: "remoteTest/painter" lives on thread "remoteTest", which a joined thread fills, and isn\'t data.');
        await remote.dispose();
        await world.dispose();
    });
    it("give tables their values on the thread, gathered by entity, and fail those that aren't data", async () => {
        const { world, remote } = await joined();
        const first = await spawnOne(world, 1);
        const second = await spawnOne(world, 2);
        await world.run(giveCaption);
        spawnTablesGiven.resources = { [filter]: { text: "gathered", owner: 0 } };
        await world.run(setResources);
        const { archetypes, resources } = await world.run(captionTables);
        const byEntity = new Map<number, unknown>();
        for (const table of archetypes) {
            const column = table.columns[caption];
            table.entities.forEach((entity, row) => byEntity.set(entity, column?.kind === "values" ? column.values[row] : undefined));
        }
        expect(byEntity.get(first)).toEqual({ text: "a caption only the thread gives" });
        expect(byEntity.get(second)).toEqual({ text: "a caption only the thread gives" });
        expect(resources[filter]).toEqual({ text: "gathered", owner: 0 });
        await expect(world.run(widgetTables)).rejects.toThrow(/Tables can't read "remoteTest\/widget": a joined thread fills its objects, and gave none: it isn't data, which a copy carries/);
        await remote.dispose();
        await world.dispose();
    });
    it("take resources of another thread from commands.spawnTables while no joined thread fills it", async () => {
        await using world = createWorld({ [workers]: 0 });
        spawnTablesGiven.resources = { [filter]: { text: "here", owner: 0 } };
        await world.run(setResources);
        expect(await Observe.toPromise(Observe.resource(world, filter))).toEqual({ text: "here", owner: 0 });
    });
    it("take from a kernel only their start or null, its command giving another dropping and its system failing", async () => {
        const { world, remote } = await joined();
        const entity = await spawnOne(world, 6);
        const listed = Observe.entity(remote, entity, { required: [caption, widget] });
        expect(await until(listed, value => value !== null)).toEqual({ [caption]: none, [widget]: null });
        expect((await runReported(world, nullCaptionsKernel)).failures).toEqual([]);
        expect(await until(listed, value => value?.[caption] === null)).toEqual({ [caption]: null, [widget]: null });
        const report = await runReported(world, numberHandlesKernel);
        expect(report.failures.map(failure => [failure.name, failure.message])).toEqual([["numberHandlesKernel", '"remoteTest/handle" lives on thread "remoteTest", which a joined thread fills, and isn\'t data, so a command here gives it only its start or null.']]);
        expect(report.dropped).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("are read by systems that run on the thread, their tiers warned of", async () => {
        const { world, remote } = await joined();
        await spawnOne(world, 3);
        expect(await runReported(world, readCaptions)).toEqual({
            failures: [], skipped: [], dropped: 0,
            warnings: [{ kind: "blocking", name: "readCaptions", id: ownId("src/implementation/world/remote.test.ts", "readCaptions"), message: 'System "readCaptions" runs on thread "remoteTest", which a joined thread fills, so its tier waits for that thread.' }],
        });
        await remote.dispose();
        await world.dispose();
    });
    it("come back to the world's thread when the thread that filled them is gone, as the start or null each held", async () => {
        const { world, remote } = await joined();
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
    it("refuse a claim of a thread whose sync systems or systems the joined thread can't run, and take one whose systems it imported", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(readCaptions);
        const taken = await joined();
        expect((await runReported(taken.world, readCaptions)).warnings.map(warning => warning.name)).toEqual(["readCaptions"]);
        await taken.remote.dispose();
        await taken.world.dispose();
        // Declared in a function, so the build gives it no id, and another thread can't name it.
        const unnamed = System.create({ components: { with: [caption] } }, row => { void row[caption]; });
        await world.run(unnamed);
        // Both sides of a refused claim say why.
        const refusedSystem = 'System "unnamed" runs on thread "remoteTest" and has no id, so a joined thread can\'t run it';
        const channel = new MessageChannel();
        const shared = expect(world.share(channel.port1)).rejects.toThrow(refusedSystem);
        await expect(join(channel.port2, { threads: ["remoteTest"] })).rejects.toThrow(refusedSystem);
        await shared;
        await statusOf(world, "gone");
        const refusedRemoved = /Removed system "system #\d+" runs on thread "remoteTestRemoved" and has no id, so a joined thread can't run it/;
        const other = createWorld({ [workers]: 0 });
        other.add(guard);
        const otherChannel = new MessageChannel();
        const otherShared = expect(other.share(otherChannel.port1)).rejects.toThrow(refusedRemoved);
        await expect(join(otherChannel.port2, { threads: ["remoteTestRemoved"] })).rejects.toThrow(refusedRemoved);
        await otherShared;
        await other.dispose();
        await world.dispose();
    });
});
