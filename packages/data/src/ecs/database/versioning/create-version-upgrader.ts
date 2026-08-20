// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { DatabaseVersioning } from "../public/database-versioning.js";
import { foldSchemas } from "./fold-schemas.js";
import { conformStoreToSchemas } from "./conform-store-to-schemas.js";
import type { VersionEntry } from "./version-entry.js";

/**
 * Build a {@link DatabaseVersioning} from an ordered version history, for
 * `Database.create(plugin, { versioning: createVersionUpgrader(entries, …) })`.
 *
 * `currentVersion = entries.length` and the current schema is `foldSchemas(entries)`.
 * On load of a version-`d` document the handler:
 *   1. rejects a document newer than this app (`d > currentVersion`);
 *   2. walks `d → currentVersion`, and for each entry with a `handler` stages the
 *      whole store to that version's folded schema (so the handler sees a known
 *      input) then runs it — additive/minor steps carry no handler and are skipped.
 *
 * The database's commit path then auto-normalizes every remaining additive/minor
 * change to the current schema, so a purely additive/minor upgrade needs the
 * handler to do nothing at all.
 */
export function createVersionUpgrader(
    entries: readonly VersionEntry[],
    options: { readonly resource: string },
): DatabaseVersioning {
    const currentVersion = entries.length;
    return {
        resource: options.resource,
        handle: async ({ documentStore, documentVersion }) => {
            if (documentVersion > currentVersion) return null; // document newer than this app → reject
            for (let v = documentVersion; v < currentVersion; v++) {
                const entry = entries[v]!;
                if (entry.handler) {
                    conformStoreToSchemas(documentStore, foldSchemas(entries, v)); // stage to version v
                    await entry.handler(documentStore);
                }
            }
            return documentStore; // the commit path normalizes to current
        },
    };
}
