// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { labelOfItem } from "../../interface/registry/index.js";
import { Observe } from "../../observe/index.js";
import { Resource } from "../../interface/resource/resource.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { reportOf, runReported } from "./reports.test-helper.js";

// A world and a thread joining it through a MessageChannel, both on this thread: the protocol without workers.

const point = Symbol("joinTest/point");
const label = Symbol("joinTest/label");
const marked = Symbol("joinTest/marked");
const total = Symbol("joinTest/total");
const names = Symbol("joinTest/names");
const words = Symbol("joinTest/words");
const counts = Symbol("joinTest/counts");
declare module "@adobe/ecs" {
    export interface Components {
        [point]: { type: readonly [number, number] };
        [label]: { type: string };
        [marked]: { type: true };
        [words]: { type: ReadonlySet<string> };
    }
    export interface Resources {
        [total]: { type: number };
        [names]: { type: readonly string[] };
        [counts]: { type: ReadonlyMap<string, number> };
    }
}
Component.register(point, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
Component.register(label, { type: { type: "string" } });
Component.register(marked, { type: { const: true } });
Resource.register(total, { type: { type: "number", default: 0 } });
Resource.register(names, { type: { type: "array", items: { type: "string" }, default: [] } });
Component.register(words, { type: { type: "set", items: { type: "string" } } });
Resource.register(counts, { type: { type: "map", keys: { type: "string" }, values: { type: "number" } }, default: new Map() });

/** Adds its struct input to `total`, and its object input's names to `names`. */
const add = System.create({ name: "joinTest/add", input: { type: "object", properties: { amount: { type: "number" } } }, resources: { write: [total] } }, ({ input, resources }) => {
    resources[total] = resources[total] * 10 + input.amount;
});
const append = System.create({ name: "joinTest/append", input: { type: "object", properties: { name: { type: "string" } } }, resources: { write: [names] } }, ({ input, resources }) => {
    resources[names] = [...resources[names], input.name];
});
const spawn = System.create({ name: "joinTest/spawn", input: { type: "object", properties: { x: { type: "number" } } } }, ({ input, commands }) => {
    commands.spawn([point, label, marked])({ [point]: [input.x, -input.x], [label]: `p${input.x}` });
});
/** Counts each word of its input's set in `counts`, and spawns an entity holding the set. */
const tally = System.create({ name: "joinTest/tally", input: { type: "object", properties: { words: { type: "set", items: { type: "string" } } } }, resources: { write: [counts] } }, ({ input, resources, commands }) => {
    const next = new Map(resources[counts]);
    for (const word of input.words) next.set(word, (next.get(word) ?? 0) + 1);
    resources[counts] = next;
    commands.spawn([words])({ [words]: input.words });
});
const fail = System.create({ name: "joinTest/fail" }, () => { throw new Error("joinTest failure"); });
const idle = System.create({ name: "joinTest/idle" }, () => {});

/** A world shared with a thread joined through a channel, and the joined world. */
const joined = (threads: readonly ("main")[] = []): { readonly world: CreatedWorld; readonly remote: World; readonly channel: MessageChannel } => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads });
    return { world, remote, channel };
};

/** The next value an observer gives that `accept` takes. */
const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
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

/** The progress of a thread, by the order it was shared in, once its status is `status`. */
const statusOf = (world: CreatedWorld, shared: number, status: "joining" | "joined" | "gone") =>
    until(world.threads, threads => threads[shared]?.status === status).then(threads => threads[shared]);

describe("joining", () => {
    it("keeps a joined thread's progress and claims", async () => {
        const { world, remote } = joined(["main"]);
        expect(await statusOf(world, 0, "joined")).toEqual({ status: "joined", claims: ["main"] });
        await remote.dispose();
        expect(await statusOf(world, 0, "gone")).toEqual({ status: "gone", claims: ["main"] });
        await world.dispose();
    });
    it("lands runs from a joined thread in call order, with struct and object input, each its own sync point", async () => {
        const { world, remote } = joined();
        const runs = [remote.run(add, { amount: 1 }), remote.run(append, { name: "a" }), remote.run(add, { amount: 2 }), remote.run(append, { name: "b" }), remote.run(add, { amount: 3 })];
        const reports = await Promise.all((await Promise.all(runs)).map(run => reportOf(world, run)));
        expect(reports).toEqual(runs.map(() => ({ failures: [], skipped: [], dropped: 0, warnings: [] })));
        expect(await Observe.toPromise(Observe.resource(world, total))).toBe(123);
        expect(await Observe.toPromise(Observe.resource(world, names))).toEqual(["a", "b"]);
        await remote.run(spawn, { x: 4 });
        expect(await Observe.toPromise(Observe.count(world, { required: [point] }))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("posts a run's set input to the world as a set, which a map resource and a set component hold", async () => {
        const { world, remote } = joined();
        expect(await Observe.toPromise(Observe.resource(world, counts))).toEqual(new Map());
        await remote.run(tally, { words: new Set(["a", "b"]) });
        await remote.run(tally, { words: new Set(["b"]) });
        expect(await Observe.toPromise(Observe.resource(world, counts))).toEqual(new Map([["a", 1], ["b", 2]]));
        const held = await Observe.toPromise(Observe.select(world, { required: [words] }));
        const values = await Promise.all(held.map(async entity => (await Observe.toPromise(Observe.entity(world, entity, { required: [words] })))?.[words]));
        expect(values).toEqual([new Set(["a", "b"]), new Set(["b"])]);
        expect(values.every(value => value instanceof Set)).toBe(true);
        await remote.dispose();
        await world.dispose();
        await using started = createWorld({ [workers]: 0, [counts]: new Map([["z", 1]]) });
        expect(await Observe.toPromise(Observe.resource(started, counts))).toEqual(new Map([["z", 1]]));
    });
    it("keeps runs in call order past the slots it holds room for, and rejects one whose input can't be posted", async () => {
        const { world, remote } = joined();
        const runs = Array.from({ length: 200 }, (_, k) => k % 3 === 0 ? remote.run(append, { name: String(k) }) : remote.run(add, { amount: k % 10 }));
        // Behind the runs filling its slots, so it's posted once they complete.
        const unposted: { name: unknown } = { name: () => "a function" };
        const failed = Reflect.apply(remote.run, remote, [append, unposted]);
        const after = remote.run(append, { name: "after" });
        await Promise.all(runs);
        await expect(failed).rejects.toThrow();
        await after;
        const expected = Array.from({ length: 200 }, (_, k) => k).filter(k => k % 3 === 0).map(String);
        expect(await Observe.toPromise(Observe.resource(world, names))).toEqual([...expected, "after"]);
        await remote.dispose();
        await world.dispose();
    });
    it("resolves a run that failed with its number, its report the world's, and rejects a run of a system without an id", async () => {
        const { world, remote } = joined();
        const report = await reportOf(world, await remote.run(fail));
        expect(report.failures.map(failure => failure.message)).toEqual(["joinTest failure"]);
        const local = System.create(() => {});
        await expect(remote.run(local)).rejects.toThrow(`System "${labelOfItem(local)}" has no id, so it can't run from another thread`);
        expect(await reportOf(world, await remote.run(idle))).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        await remote.dispose();
        await world.dispose();
    });
    it("refuses a thread claimed twice: its runs reject, and its status is gone", async () => {
        const world = createWorld({ [workers]: 0 });
        const first = new MessageChannel();
        const second = new MessageChannel();
        world.share(first.port1);
        world.share(second.port1);
        const one = join(first.port2, { threads: ["main"] });
        const two = join(second.port2, { threads: ["main"] });
        await expect(two.run(idle)).rejects.toThrow('Thread "main" is claimed twice.');
        expect(await statusOf(world, 1, "gone")).toEqual({ status: "gone", claims: [] });
        expect(await reportOf(world, await one.run(idle))).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        await one.dispose();
        await two.dispose();
        await world.dispose();
    });
    it("rejects a joined thread's runs once the world is disposed", async () => {
        const { world, remote } = joined();
        await remote.run(idle);
        await world.dispose();
        await expect(remote.run(idle)).rejects.toThrow("The world is disposed.");
        await remote.dispose();
    });
});
