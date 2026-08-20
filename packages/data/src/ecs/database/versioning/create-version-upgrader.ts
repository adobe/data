// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { DatabaseVersioning } from "../public/database-versioning.js";
import { stagingSchemas } from "./fold-schemas.js";
import { conformStoreToSchemas } from "./conform-store-to-schemas.js";
import type { VersionEntry } from "./version-entry.js";

/**
 * Build a {@link DatabaseVersioning} from an ordered version history, for
 * `Database.create(plugin, { versioning: createVersionUpgrader(entries, …) })`.
 *
 * `currentVersion = entries.length - 1` and the current schema is `foldSchemas(entries)`.
 * On load of a version-`d` document the handler:
 *   1. rejects a document newer than this app (`d > currentVersion`);
 *   2. applies `entries[d+1 … currentVersion]`, and for each with a `handler` stages
 *      the whole store to the PREVIOUS version's folded schema (so the handler sees
 *      a known input) then runs it — additive/minor steps carry no handler and are
 *      skipped.
 *
 * The database's commit path then auto-normalizes every remaining additive/minor
 * change to the current schema, so a purely additive/minor upgrade needs the
 * handler to do nothing at all.
 *
 * A document NEWER than this app (`documentVersion > currentVersion`) is rejected
 * non-destructively (the live db is left untouched). Rejection is not a throw —
 * `db.fromData` resolves with `{ loaded: false, documentVersion, currentVersion }`
 * so the caller can react (e.g. prompt the user to update).
 *
 * You MUST also add the {@link assertVersionsMatchSchema} guard test — nothing at
 * runtime ties `entries` to the plugin schema, so without it a drift surfaces
 * only as a load-time throw (or, for untyped schemas, silently).
 */
export function createVersionUpgrader(
    entries: readonly VersionEntry[],
    options: { readonly resource: string },
): DatabaseVersioning {
    const currentVersion = entries.length - 1;
    return {
        resource: options.resource,
        handle: async ({ documentStore, documentVersion }) => {
            if (documentVersion > currentVersion) {
                return null; // document newer than this app → reject (live db untouched)
            }
            for (let i = documentVersion + 1; i <= currentVersion; i++) {
                const entry = entries[i]!;
                if (entry.handler) {
                    conformStoreToSchemas(documentStore, stagingSchemas(entries, i)); // stage to the version-i handler input
                    await entry.handler(documentStore);
                }
            }
            return documentStore; // the commit path normalizes to current
        },
    };
}
