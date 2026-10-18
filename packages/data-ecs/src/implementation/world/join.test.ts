import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { threadClaims, threadStatus } from "../../interface/components/index.js";
import { Entity } from "../../interface/entity/entity.js";
import { labelOfItem } from "../../interface/registry/index.js";
import { Observe } from "../../interface/observe/observe.js";
import { Resource } from "../../interface/resource/resource.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";

// A world and a thread joining it through a MessageChannel, both on this thread: the protocol without workers.

const point = Symbol("joinTest/point");
const label = Symbol("joinTest/label");
const marked = Symbol("joinTest/marked");
const total = Symbol("joinTest/total");
const names = Symbol("joinTest/names");
declare module "@adobe/data-ecs" {
    export interface Components {
        [point]: typeof pointTraits;
        [label]: typeof labelTraits;
        [marked]: typeof markedTraits;
    }
    export interface Resources {
        [total]: typeof totalTraits;
        [names]: typeof namesTraits;
    }
}
const pointTraits = Component.register(point, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
const labelTraits = Component.register(label, { type: { type: "string" } });
const markedTraits = Component.register(marked, { type: { const: true } });
const totalTraits = Resource.register(total, { type: { type: "number", default: 0 } });
const namesTraits = Resource.register(names, { type: { type: "array", items: { type: "string" }, default: [] } });

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
const fail = System.create({ name: "joinTest/fail" }, () => { throw new Error("joinTest failure"); });
const idle = System.create({ name: "joinTest/idle" }, () => {});

/** A world shared with a thread joined through a channel, its entity, and the joined world. */
const joined = (threads: readonly ("main")[] = []): { readonly world: World; readonly thread: Entity; readonly remote: World; readonly channel: MessageChannel } => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const thread = world.share(channel.port1);
    const remote = join(channel.port2, { threads });
    return { world, thread, remote, channel };
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

const statusOf = (world: World, thread: Entity, status: "joining" | "joined" | "gone") =>
    until(world.observe.entity(thread, { required: [threadStatus], optional: [threadClaims] }), value => value?.[threadStatus] === status);

describe("joining", () => {
    it("shows a joined thread's progress and claims on its entity", async () => {
        const { world, thread, remote } = joined(["main"]);
        const value = await statusOf(world, thread, "joined");
        expect(value?.[threadClaims]).toEqual(["main"]);
        await remote.dispose();
        expect((await statusOf(world, thread, "gone"))?.[threadStatus]).toBe("gone");
        await world.dispose();
    });
    it("lands runs from a joined thread in call order, with struct and object input, each its own sync point", async () => {
        const { world, remote } = joined();
        const runs = [remote.run(add, { amount: 1 }), remote.run(append, { name: "a" }), remote.run(add, { amount: 2 }), remote.run(append, { name: "b" }), remote.run(add, { amount: 3 })];
        const reports = await Promise.all(runs);
        expect(reports).toEqual(runs.map(() => ({ failures: [], skipped: [], dropped: 0 })));
        expect(await Observe.toPromise(world.observe.resource(total))).toBe(123);
        expect(await Observe.toPromise(world.observe.resource(names))).toEqual(["a", "b"]);
        await remote.run(spawn, { x: 4 });
        expect(await Observe.toPromise(world.observe.count({ required: [point] }))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("resolves a run that failed with its report, and rejects a run of a system without an id", async () => {
        const { world, remote } = joined();
        const report = await remote.run(fail);
        expect(report.failures.map(failure => failure.message)).toEqual(["joinTest failure"]);
        const local = System.create(() => {});
        await expect(remote.run(local)).rejects.toThrow(`System "${labelOfItem(local)}" has no id, so it can't run from another thread`);
        expect(await remote.run(idle)).toEqual({ failures: [], skipped: [], dropped: 0 });
        await remote.dispose();
        await world.dispose();
    });
    it("refuses a thread claimed twice: its runs reject, and its status is gone", async () => {
        const world = createWorld({ [workers]: 0 });
        const first = new MessageChannel();
        const second = new MessageChannel();
        world.share(first.port1);
        const refused = world.share(second.port1);
        const one = join(first.port2, { threads: ["main"] });
        const two = join(second.port2, { threads: ["main"] });
        await expect(two.run(idle)).rejects.toThrow('Thread "main" is claimed twice.');
        expect((await statusOf(world, refused, "gone"))?.[threadStatus]).toBe("gone");
        expect(await one.run(idle)).toEqual({ failures: [], skipped: [], dropped: 0 });
        await one.dispose();
        await two.dispose();
        await world.dispose();
    });
    it("gives a joined thread's observers of resources, entities, select and count their values later, then each newer one", async () => {
        const { world, remote } = joined();
        const first: unknown[] = [];
        const stop = remote.observe.resource(total)(value => first.push(value));
        // Never during the subscribing call.
        expect(first).toEqual([]);
        expect(await until(remote.observe.resource(total), value => value === 0)).toBe(0);
        stop();
        await world.run(add, { amount: 7 });
        expect(await until(remote.observe.resource(total), value => value === 7)).toBe(7);
        await remote.run(spawn, { x: 1 });
        await remote.run(spawn, { x: 2 });
        const selected = await until(remote.observe.select({ required: [point], order: { [point]: false } }), entities => entities.length === 2);
        expect(await until(remote.observe.count({ required: [point], where: { [point]: [2, -2] } }), count => count === 1)).toBe(1);
        const listed = await until(remote.observe.entity(selected[0], { required: [point], optional: [marked] }), value => value !== null);
        expect(listed).toEqual({ [point]: [2, -2], [marked]: true });
        const whole = await until(remote.observe.entity(selected[1]), value => value !== null);
        // Its struct components; its label is an object, on the world's thread.
        expect(whole).toEqual({ [point]: [1, -1], [marked]: true });
        await remote.dispose();
        await world.dispose();
    });
    it("gives an observer that fell behind the newest value", async () => {
        const { world, remote } = joined();
        const seen: number[] = [];
        remote.observe.resource(total)(value => seen.push(value));
        await until(remote.observe.resource(total), value => value === 0);
        for (let k = 1; k <= 5; k++) await world.run(add, { amount: k });
        await until(remote.observe.resource(total), value => value === 12345);
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(seen.at(-1)).toBe(12345);
        expect(seen.length).toBeLessThanOrEqual(6);
        await remote.dispose();
        await world.dispose();
    });
    it("throws for an observer on a joined thread that reads objects", async () => {
        const { world, remote } = joined();
        expect(() => remote.observe.resource(names)).toThrow('reads "joinTest/names", an object, which lives on another thread');
        expect(() => remote.observe.entity(Entity.none, { required: [label] })).toThrow('reads "joinTest/label", an object');
        expect(() => remote.observe.select({ required: [label], where: { [label]: "a" } })).toThrow('reads "joinTest/label", an object');
        await remote.dispose();
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
