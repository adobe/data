// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, workers } from "../../index.js";
import { createWorld, join } from "./create.js";

// Observer systems reading only resources on a joined thread, whose posts hold copies of what they read, with the world
// and the thread on this one, joined through a MessageChannel.

const wide = Symbol("observerContainedTest/wide");
const paused = Symbol("observerContainedTest/paused");
const steps = Symbol("observerContainedTest/steps");
declare module "@adobe/ecs" {
    interface Resources {
        [wide]: { type: readonly [number, number, number, number, number, number, number, number, number, number, number, number]; default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
        [paused]: { type: boolean };
        [steps]: { type: number };
    }
}
/** Twelve f64s: more than a post's block holds, so its posts copy them into a snapshot of their own. */

const widen = System.create({}, ({ resources }) => {
    const first = resources[wide][0] + 1;
    const base = first * 100;
    resources[wide] = [base, base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, base + 7, base + 8, base + 9, base + 10, base + 11];
});
const step = System.create({}, ({ resources }) => { resources[steps] += 1; });
const pause = System.create({}, ({ resources }, input: { readonly paused: boolean }) => {
    resources[paused] = input.paused;
});

const seen: { wide: number[][]; steps: number[] } = { wide: [], steps: [] };
const watchWide = System.create({ observer: true, resources: { changed: [wide] } }, ({ resources }) => {
    seen.wide.push([...resources[wide]]);
});
const watchSteps = System.create({ observer: true, resources: { not: [paused], changed: [steps] } }, ({ resources }) => {
    seen.steps.push(resources[steps]);
});

const settled = async (done: () => boolean): Promise<void> => {
    for (let turn = 0; turn < 2000 && !done(); turn++) await new Promise(resolve => setTimeout(resolve, 0));
};
const turns = async (count = 20): Promise<void> => {
    for (let turn = 0; turn < count; turn++) await new Promise(resolve => setTimeout(resolve, 0));
};

const joined = async () => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const shared = world.share(channel.port1);
    const remote = await join(channel.port2, {});
    await shared;
    return { world, remote, close: async () => { await remote.dispose(); await world.dispose(); } };
};

describe("observer systems reading only resources on a joined thread", () => {
    it("read resources larger than their block holds from a snapshot of their own", async () => {
        seen.wide.length = 0;
        const { world, remote, close } = await joined();
        remote.add(watchWide);
        await turns();
        await world.run(widen);
        await settled(() => seen.wide.at(-1)?.[0] === 100);
        await world.run(widen);
        await settled(() => seen.wide.at(-1)?.[0] === 10100);
        expect(seen.wide.at(-2)).toEqual(Array.from({ length: 12 }, (_, k) => 100 + k));
        expect(seen.wide.at(-1)).toEqual(Array.from({ length: 12 }, (_, k) => 10100 + k));
        await close();
    });

    it("run for the newest sync point only, which its conditions may not hold at", async () => {
        seen.steps.length = 0;
        const { world, remote, close } = await joined();
        remote.add(watchSteps);
        await turns();
        await world.run(step);
        await settled(() => seen.steps.length === 1);
        // Behind, the thread runs nothing for the step: paused at the newest.
        await Promise.all([world.run(step), world.run(pause, { paused: true })]);
        await turns();
        expect(seen.steps).toEqual([1]);
        // Unpaused, the step it hasn't run passes its filter.
        await world.run(pause, { paused: false });
        await settled(() => seen.steps.length === 2);
        await turns();
        expect(seen.steps).toEqual([1, 2]);
        await close();
    });
});
