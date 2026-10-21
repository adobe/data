import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";

// Keys and systems both threads of the removal tests import: systems on thread "removeTest", which a joined thread
// fills, the first of each pair removing the second from the task they run in.

export const mark = Symbol("removeTest/mark");
export const pause = Symbol("removeTest/pause");
export const secondRuns = Symbol("removeTest/secondRuns");
declare module "@adobe/data-ecs" {
    export interface Threads {
        removeTest: true;
    }
    export interface Resources {
        [mark]: { type: { readonly text: string }; thread: "removeTest" };
        [pause]: { type: number };
        [secondRuns]: { type: number };
    }
}
/** An object resource of the thread, which places the systems reading it there. */
Resource.register(mark, { type: { type: "object", properties: { text: { type: "string" } }, default: { text: "m" } }, thread: "removeTest" });
/** How long, in milliseconds, `first` and `firstTail` spin before they return. */
Resource.register(pause, { type: { type: "number", default: 0 } });
/** How many times `second` ran, wherever it ran. */
Resource.register(secondRuns, { type: { type: "integer", default: 0 } });

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
export const first = System.create({ name: "removeTest/first", resources: { read: [mark, pause] } }, ({ resources, commands }) => {
    void commands;
    calls.first += resources[mark].text.length;
    spin(resources[pause]);
    if (removal.armed) removal.world?.remove(second);
});

export const second = System.create({ name: "removeTest/second", resources: { read: [mark], write: [secondRuns] }, after: [first] }, ({ resources, commands }) => {
    void commands;
    calls.second += resources[mark].text.length;
    resources[secondRuns] += 1;
});

/** Terminal, so a tail, run with `secondTail` as one task after the tick's sync point. */
export const firstTail = System.create({ name: "removeTest/firstTail", resources: { read: [mark, pause] } }, ({ resources }) => {
    calls.firstTail += resources[mark].text.length;
    spin(resources[pause]);
    if (removal.armed) removal.world?.remove(secondTail);
});

/** Terminal, so a tail: removes `removal.target`, once, when it's set. */
export const removerTail = System.create({ name: "removeTest/removerTail", resources: { read: [mark] } }, ({ resources }) => {
    void resources[mark];
    const { target } = removal;
    removal.target = null;
    if (target !== null) removal.world?.remove(target);
});

export const secondTail = System.create({ name: "removeTest/secondTail", resources: { read: [mark] }, after: [firstTail] }, ({ resources }) => {
    calls.secondTail += resources[mark].text.length;
});

/**
 * On the world's thread, added while the others come and go, so ticks go on; after `second`, so the tiers of `first` and
 * `second` are one task there.
 */
export const ticking = System.create({ name: "removeTest/ticking", after: [second] }, () => {});

/** Sets how long `first` and `firstTail` spin. */
export const setPause = System.create({ name: "removeTest/setPause", input: { type: "object", properties: { milliseconds: { type: "number" } } }, resources: { write: [pause] } }, ({ input, resources }) => {
    resources[pause] = input.milliseconds;
});
