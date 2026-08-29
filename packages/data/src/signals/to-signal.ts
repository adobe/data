// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Signal } from "signal-polyfill";
import type { Observe, Unobserve } from "../observe/index.js";

/**
 * Bridges an @adobe/data `Observe` to a TC39 `Signal.State`.
 *
 * The Observe subscription is live only while the returned signal is being
 * watched (by a Computed or a Watcher): the `watched`/`unwatched` lifecycle
 * hooks subscribe and unsubscribe, so an unread signal holds no subscription and
 * there is nothing to dispose manually. This mirrors `Observe`'s own laziness —
 * an Observe does no work until it is called.
 *
 * The signal reads `undefined` until the Observe emits its first value.
 *
 * `signal-polyfill` is an optional peer dependency, loaded only when you import
 * from `@adobe/data/signals`.
 */
export function toSignal<T>(observe: Observe<T>): Signal.State<T | undefined> {
  let unobserve: Unobserve | undefined;
  const state = new Signal.State<T | undefined>(undefined, {
    [Signal.subtle.watched]: () => {
      // The Observe may replay its current value synchronously here. A signal
      // write is rejected while the graph is attaching a watcher, so subscribe
      // inside `untrack` to permit that initial synchronous set.
      unobserve = Signal.subtle.untrack(() =>
        observe((value) => state.set(value))
      );
    },
    [Signal.subtle.unwatched]: () => {
      unobserve?.();
      unobserve = undefined;
    },
  });
  return state;
}
