import { describe, expect, it } from "vitest";
import type { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { asEntity } from "./entities.js";
import { peersOf } from "./join.js";
import { attachHere, attachThere, greetThere, kept, mark, marks, spawnHere, storeHere, storeThere, stored, unregistered } from "./transfers.test-helper.js";

// Transfers, with the world, the thread filling "transfersTest" and a thread filling none on this one, joined through
// MessageChannels: a run's Transferable input moves to the thread its system runs on.

const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

const later = (milliseconds = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Resolves once `remote` has a channel to another joined thread. */
const peered = async (remote: World): Promise<void> => {
    while ((peersOf.get(remote)?.() ?? 0) === 0) await later();
};

const sharedWith = (world: CreatedWorld, threads: readonly "transfersTest"[]): World => {
    const channel = new MessageChannel();
    world.share(channel.port1);
    return join(channel.port2, { threads });
};

/** A world here, `filler` claiming "transfersTest", and `loader` claiming nothing, each with a channel to the other. */
const joined = async (): Promise<{ readonly world: CreatedWorld; readonly filler: World; readonly loader: World }> => {
    stored.length = marks.length = kept.length = 0;
    const world = createWorld({ [workers]: 0 });
    const loader = sharedWith(world, []);
    const filler = sharedWith(world, ["transfersTest"]);
    await until(world.threads, threads => threads.length === 2 && threads.every(thread => thread.status === "joined"));
    await peered(loader);
    await peered(filler);
    return { world, filler, loader };
};

const bufferOf = (first: number, bytes = 1024): ArrayBuffer => {
    const buffer = new ArrayBuffer(bytes);
    new Uint8Array(buffer)[0] = first;
    return buffer;
};

/** Resolves once a port's other end closed, or with false after `milliseconds`. */
const closed = (port: MessagePort, milliseconds = 1000): Promise<boolean> => new Promise(resolve => {
    port.addEventListener("close", () => resolve(true));
    port.start();
    setTimeout(() => resolve(false), milliseconds);
});

const clean = { failures: [], skipped: [], dropped: 0, warnings: [] };

describe("transfers", () => {
    it("move a run's Transferable input straight to the joined thread its system runs on, in call order with that thread's other runs", async () => {
        const { world, filler, loader } = await joined();
        const buffers = [bufferOf(1), bufferOf(2)];
        const runs = [loader.run(storeThere, { buffer: buffers[0] }), loader.run(mark, { value: 1 }), loader.run(storeThere, { buffer: buffers[1] }), loader.run(mark, { value: 2 })];
        // Moved, not copied: the loader's are detached as soon as it runs them.
        expect(buffers.map(buffer => buffer.byteLength)).toEqual([0, 0]);
        expect((await Promise.all(runs)).map(report => report.warnings.map(warning => warning.kind))).toEqual([["blocking"], [], ["blocking"], []]);
        expect(stored.map(({ bytes, first, order }) => [bytes, first, order])).toEqual([[1024, 1, 0], [1024, 2, 2]]);
        expect(marks).toEqual([{ value: 1, order: 1 }, { value: 2, order: 3 }]);
        await loader.dispose();
        await filler.dispose();
        await world.dispose();
    });
    it("move a MessagePort, which can't be copied, to the joined thread its system runs on, where it works", async () => {
        const { world, filler, loader } = await joined();
        const channel = new MessageChannel();
        const greeted = new Promise<unknown>(resolve => {
            channel.port2.onmessage = event => resolve(event.data);
        });
        expect((await loader.run(greetThere, { port: channel.port1 })).failures).toEqual([]);
        expect(await greeted).toBe("anchor");
        channel.port2.close();
        await loader.dispose();
        await filler.dispose();
        await world.dispose();
    });
    it("move one to the world's thread where its system runs there", async () => {
        const { world, filler, loader } = await joined();
        const buffer = bufferOf(3);
        const ran = loader.run(storeHere, { buffer });
        expect(buffer.byteLength).toBe(0);
        expect(await ran).toEqual(clean);
        expect(stored.map(({ bytes, first }) => [bytes, first])).toEqual([[1024, 3]]);
        await loader.dispose();
        await filler.dispose();
        await world.dispose();
    });
    it("keep one on the joined thread its system runs on, when it runs it", async () => {
        const { world, filler, loader } = await joined();
        const buffer = bufferOf(4);
        await filler.run(storeThere, { buffer });
        expect(stored.map(({ bytes, first, value }) => [bytes, first, value === buffer])).toEqual([[1024, 4, true]]);
        await loader.dispose();
        await filler.dispose();
        await world.dispose();
    });
    it("reject a run whose input moved to a thread that left, the thread's later runs going on", async () => {
        const { world, filler, loader } = await joined();
        await filler.dispose();
        const moved = loader.run(storeThere, { buffer: bufferOf(5) });
        await expect(moved).rejects.toThrow("moved to a joined thread that's gone");
        // Once the world has told it, its runs go to the world's thread, which runs the system now.
        await later(10);
        await loader.run(storeThere, { buffer: bufferOf(6) });
        expect(stored.map(({ bytes, first }) => [bytes, first])).toEqual([[1024, 6]]);
        await loader.dispose();
        await world.dispose();
    });
    it("release a value whose command drops, on its thread", async () => {
        const { world, filler, loader } = await joined();
        const there = new MessageChannel();
        const here = new MessageChannel();
        const closes = [closed(there.port2), closed(here.port2)];
        const dead = asEntity(123456);
        expect((await loader.run(attachThere, { entity: dead, value: there.port1 })).dropped).toBe(1);
        expect((await loader.run(attachHere, { entity: dead, value: here.port1 })).dropped).toBe(1);
        expect(await Promise.all(closes)).toEqual([true, true]);
        await loader.dispose();
        await filler.dispose();
        await world.dispose();
    });
    it("release what moved for a run that never ran there", async () => {
        const { world, filler, loader } = await joined();
        const channel = new MessageChannel();
        const closing = closed(channel.port2);
        await expect(loader.run(unregistered, { value: channel.port1 })).rejects.toThrow("declares up");
        expect(await closing).toBe(true);
        await loader.dispose();
        await filler.dispose();
        await world.dispose();
    });
    it("release a value whose command drops in a world no thread joined, and keep one whose command lands", async () => {
        const world = createWorld({ [workers]: 0 });
        const dropped = new MessageChannel();
        const landed = new MessageChannel();
        const closes = [closed(dropped.port2, 200), closed(landed.port2, 200)];
        expect((await world.run(attachHere, { entity: asEntity(123456), value: dropped.port1 })).dropped).toBe(1);
        expect((await world.run(spawnHere, { value: landed.port1 })).dropped).toBe(0);
        expect(await Promise.all(closes)).toEqual([true, false]);
        await world.dispose();
    });
});
