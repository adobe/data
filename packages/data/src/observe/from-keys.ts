// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Reactive keyed collection. Given an observable list of keys and a function
 * that maps each key to an observe function for that key's value, yields an
 * observe function of the per-key values in key order.
 *
 * Per-key value subscriptions are keyed by `===` identity and REUSED across
 * list changes: when the key list changes, only added keys subscribe a value
 * and only removed keys unsubscribe one — keys that remain are untouched. So a
 * change in one key's value re-emits only that key's slot (every other key
 * keeps its current value), without re-running or re-subscribing the rest.
 *
 * A result is only produced once every current key has yielded a value; if every
 * value observe function yields synchronously on subscribe, the first result is
 * produced synchronously. Re-emits whenever the key list changes or any live
 * value yields.
 *
 * This is the dynamic, keyed counterpart to {@link fromArray} / {@link
 * fromProperties} (which combine a fixed set of observe functions): here the set
 * of value observe functions is itself driven by an observe function of keys.
 *
 * @param keys an observe function of the current key list (duplicate keys collapse)
 * @param observeValue maps a key to the observe function for that key's value
 */
export function fromKeys<K, V>(
  keys: Observe<readonly K[]>,
  observeValue: (key: K) => Observe<V>
): Observe<readonly V[]> {
  return (notify) => {
    const entries = new Map<K, { unsubscribe: () => void; value: V; ready: boolean }>();
    let currentKeys: readonly K[] = [];
    let keysReady = false;

    const emitIfReady = () => {
      if (!keysReady) {
        return;
      }
      const values: V[] = [];
      for (const key of currentKeys) {
        const entry = entries.get(key);
        // A newly-added key has not yielded its first value yet — wait for it.
        if (entry === undefined || !entry.ready) {
          return;
        }
        values.push(entry.value);
      }
      notify(values);
    };

    const ensureEntry = (key: K) => {
      if (entries.has(key)) {
        return;
      }
      const entry = { unsubscribe: () => {}, value: undefined as unknown as V, ready: false };
      entries.set(key, entry);
      entry.unsubscribe = observeValue(key)((value) => {
        entry.value = value;
        entry.ready = true;
        emitIfReady();
      });
    };

    const unsubscribeKeys = keys((nextKeys) => {
      currentKeys = nextKeys;
      const keep = new Set(nextKeys);
      for (const [key, entry] of entries) {
        if (!keep.has(key)) {
          entry.unsubscribe();
          entries.delete(key);
        }
      }
      for (const key of nextKeys) {
        ensureEntry(key);
      }
      keysReady = true;
      emitIfReady();
    });

    return () => {
      unsubscribeKeys();
      for (const entry of entries.values()) {
        entry.unsubscribe();
      }
      entries.clear();
    };
  };
}
