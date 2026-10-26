// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";

// A world and a thread joining it through a MessageChannel, both on this thread: the protocol without workers.

const point = Symbol("joinTest/point");
const label = Symbol("joinTest/label");
const marked = Symbol("joinTest/marked");
const total = Symbol("joinTest/total");
const names = Symbol("joinTest/names");
const words = Symbol("joinTest/words");
const counts = Symbol("joinTest/counts");
const levels = Symbol("joinTest/levels");
declare module "@adobe/ecs" {
    export interface Threads {
        joinTestAudio: true;
    }
    export interface Components {
        [point]: { type: readonly [number, number] };
        [label]: { type: string };
        [marked]: { type: true };
        [words]: { type: ReadonlySet<string> };
    }
    export interface Resources {
        [total]: { type: number };
        [names]: { type: readonly string[]; default: [] };
        [counts]: { type: ReadonlyMap<string, number> };
        [levels]: { type: readonly number[]; default: []; thread: "joinTestAudio" };
    }
}

/** Adds its struct input to `total`, and its object input's names to `names`. */
const add = System.create({}, ({ resources }, input: { readonly amount: number }) => {
    resources[total] = resources[total] * 10 + input.amount;
});
const append = System.create({}, ({ resources }, input: { readonly name: string }) => {
    resources[names] = [...resources[names], input.name];
});
const spawn = System.create({}, ({ commands }, input: { readonly x: number }) => {
    commands.spawn([point, label, marked])({ [point]: [input.x, -input.x], [label]: `p${input.x}` });
});
/** Counts each word of its input's set in `counts`, and spawns an entity holding the set. */
const tally = System.create({}, ({ resources, commands }, input: { readonly words: ReadonlySet<string> }) => {
    const next = new Map(resources[counts]);
    for (const word of input.words) next.set(word, (next.get(word) ?? 0) + 1);
    resources[counts] = next;
    commands.spawn([words])({ [words]: input.words });
});
const fail = System.create({}, () => { throw new Error("joinTest failure"); });
const idle = System.create({}, () => {});
/** What runs of systems without components resolve to, given back to the thread that ran them. */
const totalPlus = System.create({}, ({ resources }, input: { readonly plus: number }) => resources[total] + input.plus);
const described = System.create(({ resources }) => ({ total: resources[total], names: resources[names] }));
const unpostable = System.create(() => () => "a function");
const readTotal = System.create({ observer: true }, ({ resources }) => resources[total]);
/** Writes levels, an object of joinTestAudio, so it runs on the thread claiming it. */
const mix = System.create({}, ({ resources }, input: { readonly level: number }) => {
    resources[levels] = [...resources[levels], input.level];
});
/** An observer system recording each total it reads into `into`. */
const totalsInto = (into: number[]) => System.create({ observer: true }, ({ resources }) => { into.push(resources[total]); });
/** An observer system recording how many levels it reads into `into`. */
const levelsInto = (into: number[]) => System.create({ observer: true }, ({ resources }) => { into.push(resources[levels].length); });
const failingRead = System.create({ observer: true }, () => { throw new Error("joinTest read failure"); });

/** A world shared with a thread joined through a channel, and the joined world, once both say it joined. */
const joined = async (threads: readonly ("main")[] = []): Promise<{ readonly world: CreatedWorld; readonly remote: World; readonly channel: MessageChannel }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const shared = world.share(channel.port1);
    const remote = await join(channel.port2, { threads });
    await shared;
    return { world, remote, channel };
};

/** Settles `promise`, or gives "pending" once `milliseconds` pass. */
const within = <T>(promise: Promise<T>, milliseconds: number): Promise<T | "pending"> =>
    Promise.race([promise, new Promise<"pending">(resolve => setTimeout(() => resolve("pending"), milliseconds))]);

/** Whether `done` holds within `milliseconds`, checked a turn of the event loop at a time. */
const eventually = async (done: () => boolean, milliseconds = 2000): Promise<boolean> => {
    const end = performance.now() + milliseconds;
    while (!done() && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 1));
    return done();
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
        const { world, remote } = await joined(["main"]);
        expect(await statusOf(world, 0, "joined")).toEqual({ status: "joined", claims: ["main"] });
        await remote.dispose();
        expect(await statusOf(world, 0, "gone")).toEqual({ status: "gone", claims: ["main"] });
        await world.dispose();
    });
    it("lands runs from a joined thread in call order, with struct and object input, each its own sync point", async () => {
        const { world, remote } = await joined();
        const runs = [remote.run(add, { amount: 1 }), remote.run(append, { name: "a" }), remote.run(add, { amount: 2 }), remote.run(append, { name: "b" }), remote.run(add, { amount: 3 })];
        expect(await Promise.all(runs)).toEqual(runs.map(() => undefined));
        expect(await Observe.toPromise(Observe.resource(world, total))).toBe(123);
        expect(await Observe.toPromise(Observe.resource(world, names))).toEqual(["a", "b"]);
        await remote.run(spawn, { x: 4 });
        expect(await Observe.toPromise(Observe.count(world, { required: [point] }))).toBe(1);
        await remote.dispose();
        await world.dispose();
    });
    it("posts a run's set input to the world as a set, which a map resource and a set component hold", async () => {
        const { world, remote } = await joined();
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
        const { world, remote } = await joined();
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
    it("rejects a run that failed, naming its system, and a run of a system without an id", async () => {
        const { world, remote } = await joined();
        await expect(remote.run(fail)).rejects.toThrow(/^System "fail" \(.*join\.test\.ts#fail\) failed: joinTest failure$/);
        const local = System.create(() => {});
        await expect(remote.run(local)).rejects.toThrow(`has no id, so it can't run from another thread`);
        expect(await remote.run(idle)).toBeUndefined();
        await remote.dispose();
        await world.dispose();
    });
    it("resolves a joined thread's runs to what their bodies returned: posted from the world's thread, or read there itself", async () => {
        const { world, remote } = await joined();
        await remote.run(add, { amount: 4 });
        expect(await remote.run(totalPlus, { plus: 1 })).toBe(5);
        await remote.run(append, { name: "a" });
        expect(await remote.run(described)).toEqual({ total: 4, names: ["a"] });
        // A value that can't be posted rejects the run, which still applied.
        await expect(remote.run(unpostable)).rejects.toThrow("Its value can't be posted to the joined thread");
        // Its own observer systems run on it, giving what they read, or rejecting with what they threw.
        expect(await remote.run(readTotal)).toBe(4);
        await expect(remote.run(failingRead)).rejects.toThrow("joinTest read failure");
        expect(await remote.run(readTotal)).toBe(4);
        await remote.dispose();
        await world.dispose();
    });
    it("refuses a thread claimed twice: its share and its join reject, saying why, and its status is gone", async () => {
        const world = createWorld({ [workers]: 0 });
        const first = new MessageChannel();
        const second = new MessageChannel();
        const sharedFirst = world.share(first.port1);
        const sharedSecond = expect(world.share(second.port1)).rejects.toThrow('Thread "main" is claimed twice.');
        const one = await join(first.port2, { threads: ["main"] });
        await expect(join(second.port2, { threads: ["main"] })).rejects.toThrow('Thread "main" is claimed twice.');
        await sharedSecond;
        await sharedFirst;
        expect(await statusOf(world, 1, "gone")).toEqual({ status: "gone", claims: [] });
        expect(await one.run(idle)).toBeUndefined();
        await one.dispose();
        await world.dispose();
    });
    it("rejects a joined thread's runs once the world is disposed", async () => {
        const { world, remote } = await joined();
        await remote.run(idle);
        await world.dispose();
        await expect(remote.run(idle)).rejects.toThrow("The world is disposed.");
        await remote.dispose();
    });
});

describe("the join signal", () => {
    it("resolves share once the thread joined: a run started then runs on the threads it claims and reaches the observer systems it added as it joined", async () => {
        await using world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        const shared = world.share(channel.port1);
        await using remote = await join(channel.port2, { threads: ["joinTestAudio"] });
        const heard: number[] = [];
        remote.add(levelsInto(heard));
        await shared;
        expect(await statusOf(world, 0, "joined")).toEqual({ status: "joined", claims: ["joinTestAudio"] });
        await world.run(mix, { level: 1 });
        expect(await eventually(() => heard.includes(1))).toBe(true);
    });
    it("resolves several joins at once, each with its own claims, and each of their observer systems sees the world's next run", async () => {
        await using world = createWorld({ [workers]: 0 });
        const claims: readonly (readonly ("main" | "joinTestAudio")[])[] = [[], ["main"], ["joinTestAudio"]];
        const channels = claims.map(() => new MessageChannel());
        const shared = channels.map(channel => world.share(channel.port1));
        const remotes = await Promise.all(channels.map((channel, k) => join(channel.port2, { threads: claims[k] })));
        // Added once every join resolved, later on the turn the first did.
        const seen = remotes.map(() => [] as number[]);
        remotes.forEach((remote, k) => remote.add(totalsInto(seen[k])));
        await Promise.all(shared);
        await world.run(add, { amount: 7 });
        expect(await eventually(() => seen.every(values => values.includes(7)))).toBe(true);
        for (const remote of remotes) await remote.dispose();
    });
    it("rejects both sides of a claim the world refuses, saying why", async () => {
        await using world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        const shared = expect(world.share(channel.port1)).rejects.toThrow('Thread "main" is claimed twice.');
        await expect(join(channel.port2, { threads: ["main", "main"] })).rejects.toThrow('Thread "main" is claimed twice.');
        await shared;
        expect(await statusOf(world, 0, "gone")).toEqual({ status: "gone", claims: [] });
    });
    it("rejects both sides of a join pending when the world is disposed", async () => {
        const world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        const shared = expect(world.share(channel.port1)).rejects.toThrow("The world is disposed.");
        const joining = expect(join(channel.port2, { threads: ["main"] })).rejects.toThrow("The world is disposed.");
        await world.dispose();
        await shared;
        await joining;
    });
    it("rejects share when the other end is gone before it joined", async () => {
        await using world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        const shared = world.share(channel.port1);
        channel.port2.close();
        await expect(shared).rejects.toThrow("The thread was gone before it joined.");
        await world.run(idle);
    });
    it("rejects a join when the world's end is gone before it answered, and a joined thread's runs once it's gone", async () => {
        const channel = new MessageChannel();
        const joining = join(channel.port2);
        channel.port1.close();
        await expect(joining).rejects.toThrow("The world's thread is gone.");
        const { world, remote, channel: joinedThrough } = await joined();
        await remote.run(idle);
        joinedThrough.port1.close();
        await expect(remote.run(idle)).rejects.toThrow("The world's thread is gone.");
        await remote.dispose();
        await world.dispose();
    });
    it("rejects a second share of a port already shared, saying so, and the thread joins through the first", async () => {
        await using world = createWorld({ [workers]: 0 });
        for (const threads of [[], ["main"]] as const) {
            const channel = new MessageChannel();
            const first = world.share(channel.port1);
            const second = world.share(channel.port1).then(() => "joined", (error: Error) => error.message);
            const remote = await join(channel.port2, { threads });
            expect(await within(remote.run(idle).then(() => "ran"), 2000)).toBe("ran");
            expect(await within(first.then(() => "joined"), 2000)).toBe("joined");
            expect(await second).toBe("The port is shared already, with a thread that hasn't left.");
            await remote.dispose();
        }
    });
    it("rejects a share and a join through a port whose other end closed before", async () => {
        await using world = createWorld({ [workers]: 0 });
        const sharedThrough = new MessageChannel();
        sharedThrough.port2.close();
        const joinedThrough = new MessageChannel();
        joinedThrough.port1.close();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(await within(world.share(sharedThrough.port1).then(() => "joined", (error: Error) => error.message), 2000)).toBe("The thread was gone before it joined.");
        expect(await within(join(joinedThrough.port2).then(() => "joined", (error: Error) => error.message), 2000)).toBe("The world's thread is gone.");
    });
    it("rejects share for a thread that leaves on the turn it joined, before its join finished", async () => {
        await using world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        const shared = expect(world.share(channel.port1)).rejects.toThrow("The thread was gone before it joined.");
        const remote = await join(channel.port2, { threads: ["main"] });
        await remote.dispose();
        await shared;
        expect(await statusOf(world, 0, "gone")).toEqual({ status: "gone", claims: ["main"] });
    });
    it("rejects a share on a joined thread, and on a disposed world", async () => {
        const { world, remote } = await joined();
        await expect(remote.share(new MessageChannel().port1)).rejects.toThrow("Only the world's thread shares it.");
        await remote.dispose();
        await world.dispose();
        await expect(world.share(new MessageChannel().port1)).rejects.toThrow("The world is disposed.");
    });
});
