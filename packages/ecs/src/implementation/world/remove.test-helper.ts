// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import type { Schema } from "../../interface/schema/schema.js";

// Keys and systems both threads of the removal tests import: systems on thread "removeTest", which a joined thread
// fills, the first of each pair removing the second from the task they run in.

export const mark = Symbol("removeTest/mark");
export const pause = Symbol("removeTest/pause");
export const secondRuns = Symbol("removeTest/secondRuns");
declare module "@adobe/ecs" {
    export interface Threads {
        removeTest: true;
    }
    export interface Resources {
        [mark]: { type: { readonly text: string }; thread: "removeTest"; default: { text: "m" } };
        [pause]: { type: number; default: 0 };
        [secondRuns]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
    }
}
/** An object resource of the thread, which places the systems reading it there. */
/** How long, in milliseconds, `first` and `firstTail` spin before they return. */
/** How many times `second` ran, wherever it ran. */

/** How many times each system's body was called on this thread. */
export const calls = { first: 0, second: 0, firstTail: 0, secondTail: 0 };

/**
 * Where systems on this thread remove others: a world on this thread, for tests on one thread; and what `removerTail`
 * removes next.
 */
export const removal: { world: World | null; armed: boolean; target: System | null } = { world: null, armed: false, target: null };

const spin = (milliseconds: number): void => {
    const end = performance.now() + milliseconds;
    while (performance.now() < end);
};

/** Blocking, since its body reaches `commands`: a tier on the thread, and with `second`, one task. */
export const first = System.create({ resources: { read: [mark, pause] } }, ({ resources, commands }) => {
    void commands;
    calls.first += resources[mark].text.length;
    spin(resources[pause]);
    if (removal.armed) removal.world?.remove(second);
});

export const second = System.create({ resources: { read: [mark], write: [secondRuns] }, after: [first] }, ({ resources, commands }) => {
    void commands;
    calls.second += resources[mark].text.length;
    resources[secondRuns] += 1;
});

/** Terminal, so a tail, run with `secondTail` as one task after the tick's sync point. */
export const firstTail = System.create({ resources: { read: [mark, pause] } }, ({ resources }) => {
    calls.firstTail += resources[mark].text.length;
    spin(resources[pause]);
    if (removal.armed) removal.world?.remove(secondTail);
});

/** Terminal, so a tail: removes `removal.target`, once, when it's set. */
export const removerTail = System.create({ resources: { read: [mark] } }, ({ resources }) => {
    void resources[mark];
    const { target } = removal;
    removal.target = null;
    if (target !== null) removal.world?.remove(target);
});

export const secondTail = System.create({ resources: { read: [mark] }, after: [firstTail] }, ({ resources }) => {
    calls.secondTail += resources[mark].text.length;
});

/**
 * On the world's thread, added while the others come and go, so ticks go on; after `second`, so the tiers of `first` and
 * `second` are one task there.
 */
export const ticking = System.create({ after: [second] }, () => {});

/** Sets how long `first` and `firstTail` spin. */
export const setPause = System.create({ resources: { write: [pause] } }, ({ resources }, input: { readonly milliseconds: number }) => {
    resources[pause] = input.milliseconds;
});
