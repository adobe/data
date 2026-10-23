// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component, System } from "../../index.js";
import { requireDefinition, type Composite } from "../../interface/registry/index.js";
import type { Cadence } from "../../interface/resources/cadence.js";
import { backToBack, createLoop, type Clock, type LoopSettings } from "./loop.js";
import { createWorld } from "./create.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { Observe } from "../../observe/index.js";

const count = Symbol("loopTest/count");
declare module "@adobe/ecs" {
    interface Components {
        [count]: { type: number };
    }
}
Component.register(count, { type: { type: "number" } });

const increment = requireDefinition(System.create({ name: "loopTest/increment", components: { write: [count] } }, row => { row[count] += 1; }));
const reader = requireDefinition(System.create({ name: "loopTest/reader", components: { read: [count] } }, row => { void row[count]; }));
const ordered = requireDefinition(System.create({ name: "loopTest/ordered", components: { read: [count] }, after: [System.create({ name: "loopTest/phase" }, () => {})] }, row => { void row[count]; }));
const takesInput = requireDefinition(System.create({ name: "loopTest/input" }, (_context, input: { readonly by: number }) => {}));

/** A host whose frames and timers run only when the test says, at the times it gives. */
const createHost = (settings: { cadence: Cadence; always: boolean; wake: number }) => {
    let time = 0;
    let frames: ((time: number) => void)[] = [];
    const timers: { at: number; callback: () => void; live: boolean }[] = [];
    const ticks: Clock[] = [];
    const host = {
        settings: (): LoopSettings => settings,
        tick: async (_: Composite, clock: Clock): Promise<void> => { ticks.push({ ...clock }); },
        now: () => time,
        frame: (callback: (time: number) => void) => {
            frames.push(callback);
            return () => { frames = frames.filter(other => other !== callback); };
        },
        timer: (callback: () => void, milliseconds: number) => {
            const timer = { at: time + milliseconds, callback, live: true };
            timers.push(timer);
            return () => { timer.live = false; };
        },
    };
    /** Advances time, firing due timers, then gives a frame at the new time to whatever asked for one. */
    const advance = async (milliseconds: number, frame = true): Promise<void> => {
        time += milliseconds;
        for (const timer of timers) {
            if (timer.live && timer.at <= time) {
                timer.live = false;
                timer.callback();
            }
        }
        if (frame) {
            const due = frames;
            frames = [];
            for (const callback of due) callback(time);
        }
        // Ticks resolve through promises.
        for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    return { host, ticks, advance, pending: () => frames.length + timers.filter(timer => timer.live).length };
};

describe("the loop", () => {
    it("runs no tick while quiet, and one on the beat after a run arrives", async () => {
        const { host, ticks, advance, pending } = createHost({ cadence: { kind: "frame" }, always: false, wake: Infinity });
        const loop = createLoop(host);
        loop.add(increment);
        await advance(16);
        expect(ticks).toEqual([]);
        expect(pending()).toBe(0);
        loop.arrived();
        loop.arrived();
        await advance(16);
        expect(ticks).toEqual([{ now: 32, delta: 0, tick: 0 }]);
        await advance(16);
        expect(ticks).toHaveLength(1);
        loop.arrived();
        await advance(16);
        expect(ticks[1]).toEqual({ now: 64, delta: 32, tick: 1 });
    });

    it("runs nothing while no system is added, even when runs arrive", async () => {
        const { host, ticks, advance, pending } = createHost({ cadence: { kind: "frame" }, always: true, wake: Infinity });
        const loop = createLoop(host);
        loop.arrived();
        await advance(16);
        expect([ticks.length, pending()]).toEqual([0, 0]);
    });

    it("ticks every frame while always is set", async () => {
        const settings = { cadence: { kind: "frame" } as Cadence, always: true, wake: Infinity };
        const { host, ticks, advance } = createHost(settings);
        createLoop(host).add(increment);
        for (let i = 0; i < 3; i++) await advance(10);
        expect(ticks.map(clock => clock.delta)).toEqual([0, 10, 10]);
        settings.always = false;
        await advance(10);
        await advance(10);
        expect(ticks).toHaveLength(3);
    });

    it("ticks once when a wake time comes, and not again for the same wake", async () => {
        const settings = { cadence: { kind: "frame" } as Cadence, always: false, wake: 50 };
        const { host, ticks, advance } = createHost(settings);
        createLoop(host).add(increment);
        await advance(40);
        expect(ticks).toEqual([]);
        await advance(20);
        expect(ticks.map(clock => clock.now)).toEqual([60]);
        await advance(100);
        expect(ticks).toHaveLength(1);
    });

    it("under a fixed cadence ticks by step, at most maxSteps per beat, and builds no debt while quiet", async () => {
        const settings = { cadence: { kind: "fixed", step: 10, maxSteps: 2 } as Cadence, always: true, wake: Infinity };
        const { host, ticks, advance } = createHost(settings);
        createLoop(host).add(increment);
        await advance(0, false);
        expect(ticks).toEqual([{ now: 0, delta: 10, tick: 0 }]);
        await advance(10, false);
        expect(ticks.map(clock => clock.now)).toEqual([0, 10]);
        // Behind by 5 steps: 2 run and the rest of the debt is dropped.
        await advance(50, false);
        expect(ticks.map(clock => clock.now)).toEqual([0, 10, 20, 30]);
        await advance(10, false);
        expect(ticks.map(clock => clock.now)).toEqual([0, 10, 20, 30, 70]);
        expect(ticks.every(clock => clock.delta === 10)).toBe(true);
        settings.always = false;
        await advance(1000, false);
        expect(ticks).toHaveLength(5);
    });

    it("runs a fixed cadence's default of 4 steps per beat when behind", async () => {
        const { host, ticks, advance } = createHost({ cadence: { kind: "fixed", step: 1 }, always: true, wake: Infinity });
        createLoop(host).add(increment);
        await advance(0, false);
        await advance(100, false);
        expect(ticks).toHaveLength(5);
    });

    it("rejects a system that conflicts with one added and has no order to it, or takes input", () => {
        const { host } = createHost({ cadence: { kind: "frame" }, always: false, wake: Infinity });
        const loop = createLoop(host);
        loop.add(increment);
        expect(() => loop.add(reader)).toThrow('Systems "loopTest/increment" and "loopTest/reader" both access "loopTest/count" and one writes it');
        expect(() => loop.add(takesInput)).toThrow("takes input, which ticks don't pass");
        loop.add(increment);
        expect(() => loop.add(ordered)).toThrow("both access");
    });

    it("schedules nothing more once stopped", async () => {
        const { host, ticks, advance, pending } = createHost({ cadence: { kind: "frame" }, always: true, wake: Infinity });
        const loop = createLoop(host);
        loop.add(increment);
        loop.stop();
        await advance(16);
        expect([ticks.length, pending()]).toEqual([0, 0]);
        expect(() => loop.add(reader)).toThrow("disposed");
    });
});

describe("a world's loop platform", () => {
    it("can be given, so a back-to-back driver ticks as fast as tasks run", async () => {
        const driver = backToBack();
        const world = createWorld({ [always]: true }, { loop: driver });
        world.add(System.create({ name: "loopTest/idle", components: { has: [count] } }, () => {}));
        const start = performance.now();
        // At 60 frames a second, a timer's frames would take 1.6 s.
        await new Promise<void>(resolve => {
            let ticks = 0;
            const unobserve = Observe.resource(world, clock)(() => {
                if (++ticks < 100) return;
                unobserve();
                resolve();
            });
        });
        expect(performance.now() - start).toBeLessThan(800);
        await world.dispose();
        driver.close();
    });
});
