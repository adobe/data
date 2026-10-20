import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";

// Keys and systems both threads of the synced-contained fixtures import: a counter the world bumps, and a synced
// system reading only resources that a joined thread adds, which can hold its run until the world's thread releases it.

export const tally = Symbol("syncedContainedTest/tally");
export const holding = Symbol("syncedContainedTest/holding");
declare module "@adobe/data-ecs" {
    export interface Resources {
        [tally]: { type: number };
        [holding]: { type: number };
    }
}
Resource.register(tally, { type: { type: "integer", default: 0 } });
/** While negative, each run of the watcher says it reached its value and waits until the world's thread releases it. */
Resource.register(holding, { type: { type: "number", default: 0 } });

/** Shared words: the value a held run reached, and the value the world's thread released runs through. */
export const reachedWord = 0;
export const releasedWord = 1;
export const gateWords = 2;
/** The joined thread's view of the gate, once the world's thread sent it. */
export const gate: { words: Int32Array | null } = { words: null };

/** What the watcher's runs saw, in order. */
export const tallies: number[] = [];

export const bump = System.create({ name: "syncedContainedTest/bump", resources: { write: [tally] } }, ({ resources }) => { resources[tally] += 1; });
export const nothing = System.create({ name: "syncedContainedTest/nothing" }, () => {});
export const setHolding = System.create({ name: "syncedContainedTest/setHolding", input: { type: "object", properties: { holding: { type: "number" } } }, resources: { write: [holding] } }, ({ input, resources }) => {
    resources[holding] = input.holding;
});

/** After each sync point that changed the tally: notes it, and, while `holding` says so, waits there to be released. */
export const watchTally = System.create({ name: "syncedContainedTest/watchTally", synced: true, resources: { read: [tally, holding], changed: [tally] } }, ({ resources }) => {
    const value = resources[tally];
    tallies.push(value);
    const { words } = gate;
    if (resources[holding] >= 0 || words === null) return;
    Atomics.store(words, reachedWord, value);
    for (let released = Atomics.load(words, releasedWord); released < value; released = Atomics.load(words, releasedWord)) Atomics.wait(words, releasedWord, released);
});
