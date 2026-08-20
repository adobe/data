// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../../store/index.js";
import { foldSchemas, stagingSchemas } from "./fold-schemas.js";
import { conformStoreToSchemas } from "./conform-store-to-schemas.js";
import type { VersionEntry } from "./version-entry.js";

/**
 * A bare store whose schema is the folded schema at `version`. Use it to set up a
 * co-located per-upgrader test: build the store a major expects as INPUT (version
 * `index - 1`), populate it, run the step, and assert the output.
 */
export function createStoreAtVersion(entries: readonly VersionEntry[], version: number): Store<any, any, any> {
    const { components, resources } = foldSchemas(entries, version);
    return Store.create({ components, resources, archetypes: {} } as any);
}

/**
 * Run a single upgrade step in isolation: stage `store` to version `index - 1`
 * (so the handler sees a known input for every component) then run `entries[index]`'s
 * handler, taking the store from version `index - 1` to `index`. The building block
 * for a per-upgrader test — construct a store at version `index - 1`, populate,
 * `await` this, then assert against the version `index` schema.
 */
export async function runUpgradeStep(
    entries: readonly VersionEntry[],
    index: number,
    store: Store<any, any, any>,
): Promise<void> {
    conformStoreToSchemas(store, stagingSchemas(entries, index));
    await entries[index]!.handler?.(store);
}
