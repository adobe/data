// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Signal } from "signal-polyfill";
import { createState } from "../observe/create-state.js";
import type { Observe, Unobserve } from "../observe/index.js";
import { fromSignal } from "./from-signal.js";
import { toSignal } from "./to-signal.js";

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("fromSignal", () => {
  it("emits the current value synchronously on subscribe", () => {
    const source = new Signal.State(1);
    const seen: number[] = [];
    const unobserve = fromSignal(source)((value) => seen.push(value));
    expect(seen).toEqual([1]);
    unobserve();
  });

  it("batches multiple synchronous writes into a single emission", async () => {
    const source = new Signal.State(1);
    const seen: number[] = [];
    const unobserve = fromSignal(source)((value) => seen.push(value));

    source.set(2);
    source.set(3);
    expect(seen).toEqual([1]); // still within the same microtask

    await flushMicrotasks();
    expect(seen).toEqual([1, 3]); // only the last value forwarded
    unobserve();
  });

  it("keeps emitting across subsequent changes", async () => {
    const source = new Signal.State(1);
    const seen: number[] = [];
    const unobserve = fromSignal(source)((value) => seen.push(value));

    source.set(2);
    await flushMicrotasks();
    source.set(3);
    await flushMicrotasks();

    expect(seen).toEqual([1, 2, 3]);
    unobserve();
  });

  it("tracks a Computed", async () => {
    const base = new Signal.State(2);
    const doubled = new Signal.Computed(() => base.get() * 2);
    const seen: number[] = [];
    const unobserve = fromSignal(doubled)((value) => seen.push(value));

    expect(seen).toEqual([4]);
    base.set(5);
    await flushMicrotasks();
    expect(seen).toEqual([4, 10]);
    unobserve();
  });

  it("stops emitting after unsubscribe", async () => {
    const source = new Signal.State(1);
    const seen: number[] = [];
    const unobserve = fromSignal(source)((value) => seen.push(value));

    source.set(2);
    unobserve();
    await flushMicrotasks();

    expect(seen).toEqual([1]);
  });
});

describe("toSignal", () => {
  it("reads undefined until the Observe emits and until it is watched", () => {
    const [source] = createState<number>(5);
    const signal = toSignal(source);
    // Not watched yet -> not subscribed -> no value replayed.
    expect(signal.get()).toBeUndefined();
  });

  it("reflects the Observe value once watched", () => {
    const [source, setSource] = createState<number>(5);
    const signal = toSignal(source);

    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(signal);

    expect(signal.get()).toBe(5); // replayed synchronously on watch

    setSource(6);
    expect(signal.get()).toBe(6); // live update

    watcher.unwatch(signal);
  });

  it("subscribes lazily and releases on unwatch", () => {
    let subscriptions = 0;
    let live = 0;
    const source: Observe<number> = (notify): Unobserve => {
      subscriptions++;
      live++;
      notify(1);
      return () => {
        live--;
      };
    };

    const signal = toSignal(source);
    expect(subscriptions).toBe(0); // lazy: nothing subscribed yet

    const watcher = new Signal.subtle.Watcher(() => {});
    watcher.watch(signal);
    expect(subscriptions).toBe(1);
    expect(live).toBe(1);
    expect(signal.get()).toBe(1);

    watcher.unwatch(signal);
    expect(live).toBe(0); // unobserve called on unwatch
  });

  it("round-trips through fromSignal", async () => {
    const [source, setSource] = createState<number>(1);
    const signal = toSignal(source);
    const seen: (number | undefined)[] = [];
    const unobserve = fromSignal(signal)((value) => seen.push(value));

    expect(seen).toEqual([1]); // fromSignal watches -> toSignal subscribes -> 1

    setSource(2);
    await flushMicrotasks();
    expect(seen).toEqual([1, 2]);

    unobserve();
  });
});
