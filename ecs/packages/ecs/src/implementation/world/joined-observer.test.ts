// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { definitionOf, idOfItem } from "../../interface/registry/index.js";
import { isLeaf } from "../../interface/registry/schedule.js";
import { System } from "../../interface/system/system.js";
import { createBuffer } from "./buffer.js";
import { createCommands } from "./commands.js";
import { cancelled, createJoinedObserverRunner, createObserverTarget, postObserver, settleObserverKeys, settlePosts } from "./joined-observer.js";
import { createState, idOf } from "./state.js";
import { synchronize } from "./synchronize.js";
import { doneWord, progressWord, snapshotted, tailChunk } from "./tail-blocks.js";

// The world's side of an observer system on a joined thread, with this test standing for the thread: its claims and
// done word, in the order a loaded machine may give them.

const amount = Symbol("joinedObserverTest/amount");
declare module "@adobe/ecs" {
    export interface Components {
        [amount]: { type: number };
    }
}

/** What the observer system read, were it run: this test stands for the thread, so it never runs. */
const seen: number[] = [];
const watch = System.create({ observer: true, components: { with: [amount] } }, row => { seen.push(row[amount]); });

describe("an observer system on a joined thread", () => {
    it("is waited for, not cancelled, by a sync point after a writer copied the rest of a post the thread claimed partway", async () => {
        const state = createState(true);
        const target = { buffer: createBuffer() };
        const commands = createCommands(state, target);
        for (let k = 0; k < 200; k++) commands.spawn([amount])({ [amount]: k });
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        const leaf = definitionOf(watch);
        if (leaf === undefined || !isLeaf(leaf)) throw new Error("The observer system has no leaf.");
        // The thread imported it, as one it runs must be.
        const imported = new Set([idOfItem(leaf) ?? ""]);
        const observer = createJoinedObserverRunner(state, leaf, createObserverTarget(1, "joinedObserverTest", () => {}, () => {}, imported)).joined;
        if (observer === null) throw new Error("The runner stands for no observer system on a joined thread.");
        expect(postObserver(state, [], [observer], 0, null)).toBeNull();
        const { control } = observer;
        // The thread claims the head and first rows, and reads them.
        expect(Atomics.add(control, progressWord, tailChunk)).toBe(0);
        Atomics.store(control, doneWord, tailChunk);
        // A writer of what it reads copies the rest; the thread hasn't claimed again yet.
        expect(settleObserverKeys(state, [idOf(state, amount)], [])).toBeNull();
        const settled = settlePosts(state);
        expect(settled).not.toBeNull();
        // The thread's next claim reads the rest from the copy, and it finishes.
        const claimed = Atomics.add(control, progressWord, tailChunk);
        expect(claimed >= snapshotted && claimed < cancelled).toBe(true);
        Atomics.store(control, doneWord, observer.end);
        Atomics.notify(control, doneWord);
        await settled;
        expect(state.observer.posts).toEqual([]);
    });
});
