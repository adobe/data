import { describe, expect, it, vi } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { Observe } from "../../observe/index.js";

// The observer factories of `src/observe` on a joined thread's world, with the world and the thread on this one,
// joined through a MessageChannel. Each case waits for the value it expects, so it holds whenever values come.

const point = Symbol("observeJoinedTest/point");
const label = Symbol("observeJoinedTest/label");
const marked = Symbol("observeJoinedTest/marked");
const total = Symbol("observeJoinedTest/total");
const names = Symbol("observeJoinedTest/names");
const place = Symbol("observeJoinedTest/place");
const caption = Symbol("observeJoinedTest/caption");
const widget = Symbol("observeJoinedTest/widget");
const kept = Symbol("observeJoinedTest/kept");
declare module "@adobe/data-ecs" {
    export interface Threads {
        observeJoinedTest: true;
    }
    export interface Components {
        [point]: { type: readonly [number, number] };
        [label]: { type: string };
        [marked]: { type: true };
        [place]: { type: number };
        [caption]: { type: string | null; thread: "observeJoinedTest" };
        [widget]: { type: { readonly draw: () => string } | null; thread: "observeJoinedTest" };
        [kept]: { type: string };
    }
    export interface Resources {
        [total]: { type: number };
        [names]: { type: readonly string[] };
    }
}
Component.register(point, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
Component.register(label, { type: { type: "string" } });
Component.register(marked, { type: { const: true } });
Component.register(place, { type: { type: "number" } });
Component.register(caption, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: "none" }, thread: "observeJoinedTest" });
Component.register(widget, { thread: "observeJoinedTest" });
Component.register(kept, { type: { type: "string" } });
Resource.register(total, { type: { type: "number", default: 0 } });
Resource.register(names, { type: { type: "array", items: { type: "string" }, default: [] } });

const add = System.create({ name: "observeJoinedTest/add", input: { type: "object", properties: { amount: { type: "number" } } }, resources: { write: [total] } }, ({ input, resources }) => {
    resources[total] = resources[total] * 10 + input.amount;
});
const spawn = System.create({ name: "observeJoinedTest/spawn", input: { type: "object", properties: { x: { type: "number" } } } }, ({ input, commands }) => {
    commands.spawn([point, label, marked])({ [point]: [input.x, -input.x], [label]: `p${input.x}` });
});
const spawnPlaced = System.create({ name: "observeJoinedTest/spawnPlaced", input: { type: "object", properties: { x: { type: "number" } } } }, ({ input, commands }) => {
    commands.spawn([place, caption, widget, kept])({ [place]: input.x, [widget]: null, [kept]: `k${input.x}` });
});
const nullCaptions = System.create({ name: "observeJoinedTest/nullCaptions", components: { has: [caption, place] } }, (row, { commands }) => { commands.add(row.entity, caption, null); });
const restartCaptions = System.create({ name: "observeJoinedTest/restartCaptions", components: { has: [caption, place] } }, (row, { commands }) => { commands.add(row.entity, caption, "none"); });
const dropCaptions = System.create({ name: "observeJoinedTest/dropCaptions", components: { has: [caption] } }, (row, { commands }) => { commands.remove(row.entity, caption); });

/** A world shared with a thread joined through a channel claiming `threads`, and the joined world. */
const joined = (threads: readonly "observeJoinedTest"[] = []): { readonly world: CreatedWorld; readonly remote: World } => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads });
    return { world, remote };
};

/** The next value an observer gives that `accept` takes. */
const until = <T>(observe: (notify: (value: T) => void) => () => void, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let stop: (() => void) | null = null;
    let done = false;
    stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop?.());
        resolve(value);
    });
    if (done) stop();
});

/** Errors thrown out of band while `run` runs, as uncaught errors would be, caught instead. */
const catching = async (run: () => Promise<void>): Promise<unknown[]> => {
    const caught: unknown[] = [];
    const original = globalThis.queueMicrotask;
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => original(() => {
        try {
            callback();
        }
        catch (error) {
            caught.push(error);
        }
    }));
    try {
        await run();
    }
    finally {
        vi.restoreAllMocks();
    }
    return caught;
};

/** Once the thread shared last is joined, its claims made. */
const joinedStatus = (world: CreatedWorld) => until(world.threads, threads => threads.at(-1)?.status === "joined");

/** The entity a run of `spawnPlaced` spawned. */
const spawnOne = async (world: World, x: number): Promise<Entity> => {
    await world.run(spawnPlaced, { x });
    const [entity] = await until(Observe.select(world, { required: [place], where: { [place]: x } }), entities => entities.length === 1);
    return entity;
};

describe("observer factories on a joined thread", () => {
    it("give values of resources, entities, select and count, then each newer one", async () => {
        const { world, remote } = joined();
        const first: unknown[] = [];
        const stop = Observe.resource(remote, total)(value => first.push(value));
        // Never during the subscribing call: the thread holds nothing yet.
        expect(first).toEqual([]);
        expect(await until(Observe.resource(remote, total), value => value === 0)).toBe(0);
        stop();
        await world.run(add, { amount: 7 });
        expect(await until(Observe.resource(remote, total), value => value === 7)).toBe(7);
        await remote.run(spawn, { x: 1 });
        await remote.run(spawn, { x: 2 });
        const selected = await until(Observe.select(remote, { required: [point], order: { [point]: false } }), entities => entities.length === 2);
        expect(await until(Observe.count(remote, { required: [point], where: { [point]: [2, -2] } }), count => count === 1)).toBe(1);
        const listed = await until(Observe.entity(remote, selected[0], { required: [point], optional: [marked] }), value => value !== null);
        expect(listed).toEqual({ [point]: [2, -2], [marked]: true });
        await remote.dispose();
        await world.dispose();
    });

    it("stop notifying once stopped", async () => {
        const { world, remote } = joined();
        const seen: number[] = [];
        const stop = Observe.resource(remote, total)(value => seen.push(value));
        await until(Observe.resource(remote, total), value => value === 0);
        stop();
        await world.run(add, { amount: 1 });
        await until(Observe.resource(remote, total), value => value === 1);
        expect(seen).toEqual([0]);
        await remote.dispose();
        await world.dispose();
    });

    it("give one that fell behind the newest value", async () => {
        const { world, remote } = joined();
        const seen: number[] = [];
        Observe.resource(remote, total)(value => seen.push(value));
        await until(Observe.resource(remote, total), value => value === 0);
        for (let k = 1; k <= 5; k++) await world.run(add, { amount: k });
        await until(Observe.resource(remote, total), value => value === 12345);
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(seen.at(-1)).toBe(12345);
        expect(seen.length).toBeLessThanOrEqual(6);
        await remote.dispose();
        await world.dispose();
    });

    it("throw for one that reads objects of the world's thread", async () => {
        const { world, remote } = joined();
        const ignore = (): void => {};
        // The factories make nothing until subscribed, so they throw when subscribed.
        const made = <T>(make: () => (notify: (value: T) => void) => () => void) => () => make()(ignore);
        expect(made(() => Observe.resource(remote, names))).toThrow('reads "observeJoinedTest/names", an object, which lives on another thread');
        expect(made(() => Observe.entity(remote, Entity.none, { required: [label] }))).toThrow('reads "observeJoinedTest/label", an object');
        expect(made(() => Observe.select(remote, { required: [label], where: { [label]: "a" } }))).toThrow(/"observeJoinedTest\/label"[^.]*an object/);
        // What threw holds nothing: observers it could make still work.
        expect(await until(Observe.resource(remote, total), value => value === 0)).toBe(0);
        await remote.dispose();
        await world.dispose();
    });

    it("read the objects of the threads the thread fills, at their starts or null as the world's commands give them", async () => {
        const { world, remote } = joined(["observeJoinedTest"]);
        await joinedStatus(world);
        const entity = await spawnOne(world, 1);
        const listed = Observe.entity(remote, entity, { required: [place, caption], optional: [widget] });
        expect(await until(listed, value => value !== null)).toEqual({ [place]: 1, [caption]: "none", [widget]: null });
        await world.run(nullCaptions);
        expect(await until(listed, value => value?.[caption] === null)).toEqual({ [place]: 1, [caption]: null, [widget]: null });
        await world.run(restartCaptions);
        expect(await until(listed, value => value?.[caption] === "none")).toEqual({ [place]: 1, [caption]: "none", [widget]: null });
        await world.run(dropCaptions);
        expect(await until(listed, value => value === null)).toBeNull();
        expect(await until(Observe.entity(remote, entity, { required: [place], optional: [caption] }), value => value !== null)).toEqual({ [place]: 1 });
        await remote.dispose();
        await world.dispose();
    });

    it("fail on the world's thread for one that reads objects a joined thread fills", async () => {
        const { world, remote } = joined(["observeJoinedTest"]);
        await joinedStatus(world);
        const entity = await spawnOne(world, 3);
        const values: unknown[] = [];
        const observe = (): void => {
            Observe.entity(world, entity, { required: [caption] })(value => values.push(value));
            Observe.select(world, { required: [place, caption], where: { [caption]: "none" } })(() => {});
        };
        const reported: string[] = [];
        const caught = await catching(async () => {
            observe();
            for (let k = 4; k < 6; k++) for (const failure of (await world.run(spawnPlaced, { x: k })).failures) reported.push(failure.message);
            await new Promise(resolve => setTimeout(resolve, 10));
        });
        // The entity observer's system, added, fails in a run's report; the selection's scan, run, rejects, rethrown.
        expect([...reported, ...caught.map(String)]).toEqual([
            expect.stringMatching(/^System "Observe\.entity\(observeJoinedTest\/caption\).*runs on thread "observeJoinedTest", which a joined thread fills, and has no id/),
            expect.stringMatching(/System "Observe\.select\(observeJoinedTest\/place, observeJoinedTest\/caption\).*runs on thread "observeJoinedTest", which a joined thread fills, and has no id/),
        ]);
        expect(values).toEqual([]);
        await remote.dispose();
        await world.dispose();
    });
});
