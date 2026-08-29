// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Signal } from "signal-polyfill";
import type { Observe } from "../observe/index.js";

/**
 * Bridges a TC39 Signal (State or Computed) to an @adobe/data `Observe`.
 *
 * The signal's current value is delivered synchronously on subscribe (matching
 * `createState`), then again after every change. Changes are delivered on a
 * microtask, so a burst of synchronous writes collapses into a single emission —
 * inheriting the glitch-free batching the Signals graph guarantees.
 *
 * `signal-polyfill` is an optional peer dependency, loaded only when you import
 * from `@adobe/data/signals`.
 */
export function fromSignal<T>(
  signal: Signal.State<T> | Signal.Computed<T>
): Observe<T> {
  return (notify) => {
    let scheduled = false;
    let disposed = false;
    const watcher = new Signal.subtle.Watcher(() => {
      if (scheduled || disposed) {
        return;
      }
      scheduled = true;
      // The notify callback may not read signals, so defer to a microtask.
      queueMicrotask(() => {
        scheduled = false;
        if (disposed) {
          return;
        }
        notify(signal.get());
        watcher.watch(); // re-arm for the next change
      });
    });
    // Watch before the initial read so a lazily-subscribed source (e.g. a
    // `toSignal` state) has materialized its current value by the time we read.
    watcher.watch(signal);
    notify(signal.get());
    return () => {
      disposed = true;
      watcher.unwatch(signal);
    };
  };
}
