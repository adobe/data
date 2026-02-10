// © 2026 Adobe. MIT License. See /LICENSE for details.

export function memoizeFactory<K, V>(fn: (key: K) => V): (key: K) => V {
    const cache = new Map<K, V>();
    return (key: K): V => {
        if (cache.has(key)) {
            return cache.get(key)!;
        }
        const value = fn(key);
        cache.set(key, value);
        return value;
    }
}
