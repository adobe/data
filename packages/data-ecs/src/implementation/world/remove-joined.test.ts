import { describe, expect, it } from "vitest";
import { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import type { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { tablesOf } from "./join.js";
import type { LoopPlatform } from "./loop.js";
import { calls, first, firstTail, removal, removerTail, second, secondTail, ticking } from "./remove.test-helper.js";

// Removing systems placed on a joined thread, with the world and the thread on this one, joined through a MessageChannel.

const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

/**
 * Frames a millisecond apart, on timers, so messages between the threads, on ports of this one, are handled between
 * ticks: back to back, through a port, ticks would hold every other port's messages until they pause.
 */
const timerFrames = { frame: (callback: (time: number) => void) => {
    const handle = setTimeout(() => callback(performance.now()), 1);
    return () => clearTimeout(handle);
} };

/**
 * Timer frames until `immediate` is set, then each frame as soon as the last tick ends, before the thread on this one
 * runs that tick's tails: the next tick waits for them, and their bodies run while it does.
 */
const switchableFrames = (): { immediate: boolean; readonly frame: LoopPlatform["frame"] } => {
    const frames = {
        immediate: false,
        frame: (callback: (time: number) => void): (() => void) => {
            if (!frames.immediate) return timerFrames.frame(callback);
            let cancelled = false;
            queueMicrotask(() => {
                if (!cancelled) callback(performance.now());
            });
            return () => { cancelled = true; };
        },
    };
    return frames;
};

/** A world ticking on `frames`, a millisecond apart by default, shared with a thread on this one claiming "removeTest". */
const joined = async (frames: Pick<LoopPlatform, "frame"> = timerFrames): Promise<{ readonly world: CreatedWorld; readonly remote: World; readonly ticks: (count: number) => Promise<void>; readonly close: () => Promise<void> }> => {
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: frames });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["removeTest"] });
    await until(world.threads, threads => threads.at(-1)?.status === "joined");
    removal.world = world;
    world.add(ticking);
    const ticks = async (count: number): Promise<void> => {
        const from = (await Observe.toPromise(world.observe.resource(clock))).tick;
        await until(world.observe.resource(clock), ({ tick }) => tick >= from + count);
    };
    const close = async (): Promise<void> => {
        removal.world = null;
        removal.armed = false;
        removal.target = null;
        await remote.dispose();
        await world.dispose();
    };
    return { world, remote, ticks, close };
};

/** What both threads hold of systems placed on the joined one: the world's indexes there, and the thread's systems. */
const held = async (world: CreatedWorld, remote: World): Promise<readonly [number, number]> =>
    [(await world.tables()).joined[0] ?? 0, tablesOf.get(remote)?.().systems ?? -1];

/**
 * What both threads hold once they agree on `expected`, or after 200 ticks: the thread drops a removed system as its
 * message arrives, and the world places its index again once the thread's answer does.
 */
const settled = async (world: CreatedWorld, remote: World, ticks: (count: number) => Promise<void>, expected: readonly [number, number]): Promise<readonly [number, number]> => {
    for (let tick = 0; tick < 200; tick++) {
        const now = await held(world, remote);
        if (now[0] === expected[0] && now[1] === expected[1]) return now;
        await ticks(1);
    }
    return held(world, remote);
};

describe("removing systems on a joined thread", () => {
    for (const [kind, one, two, ran] of [
        ["a blocking tier's", first, second, () => [calls.first, calls.second]],
        ["a tail's", firstTail, secondTail, () => [calls.firstTail, calls.secondTail]],
    ] as const satisfies readonly (readonly [string, System, System, () => readonly number[]])[]) {
        it(`never runs ${kind} body once removed, a task already posted with it included, and both threads drop what they held`, async () => {
            const { world, remote, ticks, close } = await joined();
            world.add(one);
            world.add(two);
            await ticks(3);
            expect(await held(world, remote)).toEqual([2, 2]);
            const [ranOne, ranTwo] = ran();
            expect(ranTwo).toBeGreaterThan(0);
            // The first removes the second from the task both are in, which the thread then runs no more of.
            removal.armed = true;
            await ticks(4);
            removal.armed = false;
            const [laterOne, laterTwo] = ran();
            expect(laterOne).toBeGreaterThan(ranOne);
            expect(laterTwo).toBe(ranTwo);
            expect(await settled(world, remote, ticks, [1, 1])).toEqual([1, 1]);
            world.remove(one);
            expect(await settled(world, remote, ticks, [0, 0])).toEqual([0, 0]);
            await close();
        });
    }

    it("posts no task naming a tail removed while the next tick waited for its thread to finish the last", async () => {
        const frames = switchableFrames();
        const { world, remote, ticks, close } = await joined(frames);
        world.add(firstTail);
        world.add(secondTail);
        await ticks(3);
        expect(await held(world, remote)).toEqual([2, 2]);
        // From the next tick on, each starts as the last ends and waits for the last's tails, which run meanwhile: the
        // tails of the tick `ticks` sees now are still posted, and the first of them removes the second.
        frames.immediate = true;
        await ticks(1);
        const ran = calls.secondTail;
        removal.armed = true;
        await ticks(3);
        removal.armed = false;
        frames.immediate = false;
        expect(calls.secondTail).toBe(ran);
        expect(await settled(world, remote, ticks, [1, 1])).toEqual([1, 1]);
        world.remove(firstTail);
        expect(await settled(world, remote, ticks, [0, 0])).toEqual([0, 0]);
        await close();
    });

    it("posts no task naming a blocking tier's system removed while the next tick waited for its thread to finish the last", async () => {
        const frames = switchableFrames();
        const { world, remote, ticks, close } = await joined(frames);
        world.add(first);
        world.add(second);
        world.add(removerTail);
        await ticks(3);
        expect(await held(world, remote)).toEqual([3, 3]);
        // As above: the next tick waits for the tail of the tick seen now, which removes `second`, before it posts the
        // task its tiers are one of.
        frames.immediate = true;
        await ticks(1);
        const ran = calls.second;
        removal.target = second;
        await ticks(3);
        frames.immediate = false;
        expect(removal.target).toBe(null);
        expect(calls.second).toBe(ran);
        expect(await settled(world, remote, ticks, [2, 2])).toEqual([2, 2]);
        world.remove(first);
        world.remove(removerTail);
        expect(await settled(world, remote, ticks, [0, 0])).toEqual([0, 0]);
        await close();
    });

    it("places an index again only once the thread dropped what it held for it", async () => {
        const { world, remote, ticks, close } = await joined();
        world.add(first);
        for (let k = 0; k < 20; k++) {
            world.add(second);
            await ticks(1);
            world.remove(second);
            await ticks(1);
        }
        expect(await settled(world, remote, ticks, [1, 1])).toEqual([1, 1]);
        expect(() => remote.remove(first)).toThrow("on the world's thread");
        await close();
    });
});
