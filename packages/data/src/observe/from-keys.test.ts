// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, expect, vi } from "vitest";
import { Notify, Observe } from "./index.js";
import { fromKeys } from "./from-keys.js";

/**
 * A manually-driven observe function: emits its current value synchronously on
 * subscribe once seeded, re-emits on `emit`, and tracks live subscriber count so
 * tests can assert per-key value subscription reuse / disposal.
 */
function manual<T>(initial?: { value: T }) {
    const observers = new Set<Notify<T>>();
    let seeded = initial !== undefined;
    let current = initial?.value as T;
    const observe: Observe<T> = (notify) => {
        observers.add(notify);
        if (seeded) {
            notify(current);
        }
        return () => {
            observers.delete(notify);
        };
    };
    return {
        observe,
        emit(value: T) {
            seeded = true;
            current = value;
            for (const notify of [...observers]) {
                notify(value);
            }
        },
        subscriberCount: () => observers.size,
    };
}

describe("fromKeys", () => {
    test("emits per-key values in key order, synchronously when the values are synchronous", () => {
        const keys = manual<readonly string[]>({ value: ["a", "b", "c"] });
        const values: Record<string, ReturnType<typeof manual<number>>> = {
            a: manual({ value: 1 }),
            b: manual({ value: 2 }),
            c: manual({ value: 3 }),
        };
        const results: (readonly number[])[] = [];
        const unsubscribe = fromKeys(keys.observe, (k: string) => values[k].observe)((v) => results.push(v));

        expect(results).toEqual([[1, 2, 3]]);
        unsubscribe();
    });

    test("re-emits only the changed key's slot; the other keys keep their value and are not re-subscribed", () => {
        const keys = manual<readonly string[]>({ value: ["a", "b"] });
        const a = manual({ value: 1 });
        const b = manual({ value: 2 });
        const observeValue = vi.fn((k: string) => (k === "a" ? a.observe : b.observe));

        const results: (readonly number[])[] = [];
        const unsubscribe = fromKeys(keys.observe, observeValue)((v) => results.push(v));

        expect(results).toEqual([[1, 2]]);
        // one value subscription per key, created once
        expect(observeValue).toHaveBeenCalledTimes(2);
        expect(a.subscriberCount()).toBe(1);
        expect(b.subscriberCount()).toBe(1);

        a.emit(10);
        expect(results).toEqual([[1, 2], [10, 2]]);
        // b was untouched: no extra observeValue call, still one subscription
        expect(observeValue).toHaveBeenCalledTimes(2);
        expect(b.subscriberCount()).toBe(1);

        unsubscribe();
    });

    test("adding a key subscribes a new value and re-emits with it appended", () => {
        const keys = manual<readonly string[]>({ value: ["a"] });
        const a = manual({ value: 1 });
        const b = manual({ value: 2 });
        const map: Record<string, Observe<number>> = { a: a.observe, b: b.observe };

        const results: (readonly number[])[] = [];
        fromKeys(keys.observe, (k: string) => map[k])((v) => results.push(v));

        expect(results).toEqual([[1]]);
        keys.emit(["a", "b"]);
        expect(results[results.length - 1]).toEqual([1, 2]);
        expect(b.subscriberCount()).toBe(1);
    });

    test("removing a key unsubscribes its value and re-emits without it", () => {
        const keys = manual<readonly string[]>({ value: ["a", "b"] });
        const a = manual({ value: 1 });
        const b = manual({ value: 2 });
        const map: Record<string, Observe<number>> = { a: a.observe, b: b.observe };

        const results: (readonly number[])[] = [];
        fromKeys(keys.observe, (k: string) => map[k])((v) => results.push(v));

        expect(b.subscriberCount()).toBe(1);
        keys.emit(["a"]);
        expect(results[results.length - 1]).toEqual([1]);
        // b's value subscription was disposed
        expect(b.subscriberCount()).toBe(0);
        // a survived — still one subscription
        expect(a.subscriberCount()).toBe(1);
    });

    test("reordering the keys re-emits the values in the new order without re-subscribing", () => {
        const keys = manual<readonly string[]>({ value: ["a", "b"] });
        const a = manual({ value: 1 });
        const b = manual({ value: 2 });
        const map: Record<string, Observe<number>> = { a: a.observe, b: b.observe };
        const observeValue = vi.fn((k: string) => map[k]);

        const results: (readonly number[])[] = [];
        fromKeys(keys.observe, observeValue)((v) => results.push(v));

        expect(results[results.length - 1]).toEqual([1, 2]);
        keys.emit(["b", "a"]);
        expect(results[results.length - 1]).toEqual([2, 1]);
        // no new subscriptions for a reorder
        expect(observeValue).toHaveBeenCalledTimes(2);
    });

    test("waits for every key to yield a value before the first emission", () => {
        const keys = manual<readonly string[]>({ value: ["a", "b"] });
        const a = manual({ value: 1 });
        const b = manual<number>(); // not seeded — never yields synchronously
        const map: Record<string, Observe<number>> = { a: a.observe, b: b.observe };

        const results: (readonly number[])[] = [];
        fromKeys(keys.observe, (k: string) => map[k])((v) => results.push(v));

        // b has not produced a value, so nothing is emitted yet
        expect(results).toEqual([]);
        b.emit(2);
        expect(results).toEqual([[1, 2]]);
    });

    test("emits an empty array for an empty key list", () => {
        const keys = manual<readonly string[]>({ value: [] });
        const results: (readonly number[])[] = [];
        fromKeys(keys.observe, () => manual({ value: 0 }).observe)((v) => results.push(v));
        expect(results).toEqual([[]]);
    });

    test("disposing unsubscribes the key list and every value", () => {
        const keys = manual<readonly string[]>({ value: ["a", "b"] });
        const a = manual({ value: 1 });
        const b = manual({ value: 2 });
        const map: Record<string, Observe<number>> = { a: a.observe, b: b.observe };

        const unsubscribe = fromKeys(keys.observe, (k: string) => map[k])(() => {});
        expect(keys.subscriberCount()).toBe(1);
        expect(a.subscriberCount()).toBe(1);
        expect(b.subscriberCount()).toBe(1);

        unsubscribe();
        expect(keys.subscriberCount()).toBe(0);
        expect(a.subscriberCount()).toBe(0);
        expect(b.subscriberCount()).toBe(0);
    });
});
