// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Store } from "../../store/index.js";

// A version resource is a singleton component; a reconstructed document store has
// no resource accessor, so its value is reached via the raw singleton archetype.
function versionSingleton(store: Store<any, any, any>, name: string) {
    return store.queryArchetypes([name] as never[]).find((a) => a.rowCount > 0);
}

/** Read the numeric version stamp `name` off a store (absent ⇒ 0, a legacy document). */
export function readVersionResource(store: Store<any, any, any>, name: string): number {
    const archetype = versionSingleton(store, name);
    return archetype ? Number((archetype.columns as Record<string, { get(i: number): unknown }>)[name]!.get(0)) : 0;
}

/** Stamp a store's version resource `name` to `value` (no-op if it carries none). */
export function writeVersionResource(store: Store<any, any, any>, name: string, value: number): void {
    const archetype = versionSingleton(store, name);
    if (!archetype) return;
    const id = (archetype.columns as Record<string, { get(i: number): number }>)["id"]!.get(0);
    store.update(id, { [name]: value } as never);
}
