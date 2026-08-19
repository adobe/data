// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../../store/index.js";
import { foldSchemas } from "./fold-schemas.js";
import { conformStoreToSchemas } from "./conform-store-to-schemas.js";
import type { VersionEntry } from "./version-entry.js";

/**
 * A bare store whose schema is the folded schema at `version`. Use it to set up a
 * co-located per-upgrader test: build the store a major expects as input, populate
 * it, run the step, and assert the output.
 */
export function createStoreAtVersion(entries: readonly VersionEntry[], version: number): Store<any, any, any> {
    const { components, resources } = foldSchemas(entries, version);
    return Store.create({ components, resources, archetypes: {} } as any);
}

/**
 * Run a single major upgrade step in isolation: stage `store` to version `index`
 * (so the handler sees a known input for every component) then run its handler,
 * taking the store from version `index` to `index + 1`. The building block for a
 * per-upgrader unit test — construct a store at `index`, populate, `await` this,
 * then assert against the version `index + 1` schema.
 */
export async function runUpgradeStep(
    entries: readonly VersionEntry[],
    index: number,
    store: Store<any, any, any>,
): Promise<void> {
    conformStoreToSchemas(store, foldSchemas(entries, index));
    await entries[index]!.handler?.(store);
}
