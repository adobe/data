// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { quadrantOf, type Quadrant } from "../../store/index.js";
import type { DatabaseVersioning } from "../public/database-versioning.js";
import { stagingSchemas, changedQuadrants, type VersionSchemas } from "./fold-schemas.js";
import { conformStoreToSchemas } from "./conform-store-to-schemas.js";
import type { VersionEntry } from "./version-entry.js";

/**
 * Build a {@link DatabaseVersioning} from an ordered version history, for
 * `Database.create(plugin, { versioning: createVersionUpgrader(entries) })`.
 *
 * `currentVersion = entries.length - 1` (exposed as `db.version`) and the current
 * schema is `foldSchemas(entries)`. Each entry's `handler` (when present) touches
 * exactly ONE persisted quadrant — `document` (shared+persistent) or `settings`
 * (nonShared+persistent) — the guard enforces it, so each quadrant advances
 * INDEPENDENTLY from its own stamped version.
 *
 * The version each quadrant was last saved at is read from the blob's save
 * METADATA (`schemaVersions`, not an ECS resource) and handed to `handle`. The two
 * persisted blobs can be saved separately and arrive at DIFFERENT versions; the
 * upgrader replays only each quadrant's handlers, from its own version up to current:
 *   1. reject (`null`) if EITHER quadrant is newer than this app — a load can never
 *      down-convert a blob a newer client wrote;
 *   2. for each version with a handler, if that handler's quadrant is behind, stage
 *      ONLY that quadrant's schemas to the previous version (so the other quadrant,
 *      possibly already ahead, is left untouched) and run the handler.
 *
 * The database's commit path then auto-normalizes every remaining additive/minor
 * change to the CURRENT schema (never down-converts), so a purely additive/minor
 * upgrade needs no handler at all.
 *
 * A blob NEWER than this app is rejected non-destructively (the live db is left
 * untouched). Rejection is not a throw — `db.fromData` resolves with
 * `{ loaded: false, … }` so the caller can react (e.g. prompt the user to update).
 *
 * You MUST also add the {@link assertVersioning} guard test — nothing at runtime ties
 * `entries` to the plugin schema, so without it a drift surfaces only as a load-time
 * throw (or, for untyped schemas, silently).
 */
export function createVersionUpgrader(entries: readonly VersionEntry[]): DatabaseVersioning {
    const currentVersion = entries.length - 1;

    // A handler always accompanies a schema change (it exists BECAUSE a change is not
    // auto-convertible), so its quadrant is that single changed quadrant. A
    // cross-quadrant handler is rejected by the guard.
    const quadrantForHandler = (i: number): Quadrant => [...changedQuadrants(entries, i)][0]!;

    // Validate every handler eagerly: it must change exactly one schema quadrant — a
    // setup error we surface at construction rather than mid-load.
    for (let i = 1; i <= currentVersion; i++) {
        if (entries[i]!.handler === undefined) continue;
        if (changedQuadrants(entries, i).size === 0) {
            throw new Error(`createVersionUpgrader: the version ${i} handler changes no schema; a handler must accompany the change it migrates.`);
        }
    }

    return {
        currentVersion,
        handle: async ({ documentStore, schemaVersions }) => {
            const stampOf = (quadrant: Quadrant): number => (quadrant === "settings" ? schemaVersions.settings : schemaVersions.document);
            if (schemaVersions.document > currentVersion || schemaVersions.settings > currentVersion) {
                return null; // a quadrant newer than this app → reject (live db untouched)
            }
            for (let i = 1; i <= currentVersion; i++) {
                const entry = entries[i]!;
                if (!entry.handler) continue; // additive/minor: the commit path normalizes it
                const quadrant = quadrantForHandler(i);
                if (stampOf(quadrant) >= i) continue; // this quadrant already at/past version i
                // Stage ONLY this handler's quadrant to the version-(i-1) shape; another
                // quadrant may be at a different (possibly ahead) version and must not be
                // conformed here — that would down-convert and corrupt or throw.
                conformStoreToSchemas(documentStore, pickQuadrant(stagingSchemas(entries, i), quadrant));
                await entry.handler(documentStore);
            }
            return documentStore; // the commit path normalizes to current
        },
    };
}

// Keep only the schemas belonging to `quadrant`, so staging never touches (and
// so never down-converts) a schema in another, possibly-ahead, quadrant.
function pickQuadrant(schemas: VersionSchemas, quadrant: Quadrant): VersionSchemas {
    const keep = (map: Readonly<Record<string, Schema>>): Record<string, Schema> => {
        const out: Record<string, Schema> = {};
        for (const name of Object.keys(map)) {
            if (quadrantOf(map[name]!) === quadrant) out[name] = map[name]!;
        }
        return out;
    };
    return { components: keep(schemas.components), resources: keep(schemas.resources) };
}
