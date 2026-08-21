// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { quadrantOf, type Quadrant } from "../../store/index.js";
import type { DatabaseVersioning } from "../public/database-versioning.js";
import { stagingSchemas, changedQuadrants, type VersionSchemas } from "./fold-schemas.js";
import { conformStoreToSchemas } from "./conform-store-to-schemas.js";
import { readVersionResource, writeVersionResource } from "./version-resource.js";
import type { VersionEntry } from "./version-entry.js";

/**
 * Maps each PERSISTED quadrant to the version resource that stamps it. Only the
 * two persisted quadrants are versioned: `document` (shared+persistent, e.g. a
 * cloud document) and `settings` (nonShared+persistent, e.g. local settings).
 * At least one must be given. Two persisted blobs can be saved to different
 * backends and drift to DIFFERENT versions, so each carries its own stamp.
 */
export interface VersionResources {
    readonly document?: string;
    readonly settings?: string;
}

/**
 * Build a {@link DatabaseVersioning} from an ordered version history, for
 * `Database.create(plugin, { versioning: createVersionUpgrader(entries, …) })`.
 *
 * `currentVersion = entries.length - 1` and the current schema is `foldSchemas(entries)`.
 * Each entry's `handler` (when present) touches exactly ONE persisted quadrant
 * (the guard enforces it), so each quadrant advances INDEPENDENTLY from its own
 * stamped version. The two persisted blobs (document + settings) may be merged
 * into one store before load and arrive at DIFFERENT versions; the upgrader reads
 * each quadrant's stamp and replays only that quadrant's handlers, from its own
 * version up to current:
 *   1. read every configured quadrant's stamp off the store (absent ⇒ 0, legacy);
 *   2. reject (`null`) if ANY quadrant is newer than this app — a load can never
 *      down-convert a blob a newer client wrote;
 *   3. for each version with a handler, if that handler's quadrant is behind, stage
 *      ONLY that quadrant's schemas to the previous version (so the other quadrant,
 *      possibly already ahead, is left untouched) and run the handler;
 *   4. stamp every configured quadrant's resource to current.
 *
 * The database's commit path then auto-normalizes every remaining additive/minor
 * change to the CURRENT schema (never down-converts), so a purely additive/minor
 * upgrade needs no handler at all.
 *
 * A blob NEWER than this app is rejected non-destructively (the live db is left
 * untouched). Rejection is not a throw — `db.fromData` resolves with
 * `{ loaded: false, … }` so the caller can react (e.g. prompt the user to update).
 *
 * You MUST also add the {@link assertVersionsMatchSchema} guard test — nothing at
 * runtime ties `entries` to the plugin schema, so without it a drift surfaces
 * only as a load-time throw (or, for untyped schemas, silently).
 */
export function createVersionUpgrader(
    entries: readonly VersionEntry[],
    resources: VersionResources,
): DatabaseVersioning {
    const currentVersion = entries.length - 1;
    const byQuadrant = resources as Readonly<Record<Quadrant, string | undefined>>;
    // The primary resource (for the seam's read/stamp) — document if present.
    const primary = resources.document ?? resources.settings;
    if (primary === undefined) {
        throw new Error("createVersionUpgrader: at least one of { document, settings } version resources is required.");
    }
    // The distinct configured resource names, for reading/stamping every quadrant.
    const configured = [...new Set([resources.document, resources.settings].filter((r): r is string => r !== undefined))];

    // A handler always accompanies a schema change (it exists BECAUSE a change is
    // not auto-convertible), so its quadrant is that single changed quadrant. A
    // cross-quadrant handler is rejected by the guard.
    const quadrantForHandler = (i: number): Quadrant => [...changedQuadrants(entries, i)][0]!;

    // Validate every handler eagerly: it must change exactly one quadrant, and that
    // quadrant must have a configured version resource (else its stamp can't be
    // read/advanced). These are setup errors — surface them at construction.
    for (let i = 1; i <= currentVersion; i++) {
        if (entries[i]!.handler === undefined) continue;
        const quadrants = changedQuadrants(entries, i);
        if (quadrants.size === 0) {
            throw new Error(`createVersionUpgrader: the version ${i} handler changes no schema; a handler must accompany the change it migrates.`);
        }
        const quadrant = [...quadrants][0]!;
        if (byQuadrant[quadrant] === undefined) {
            throw new Error(
                `createVersionUpgrader: the version ${i} handler upgrades the ${quadrant} quadrant, but no version ` +
                `resource is configured for it. Pass it in createVersionUpgrader(versions, { document, settings }).`,
            );
        }
    }

    return {
        resource: primary,
        handle: async ({ documentStore }) => {
            const stamped = new Map(configured.map((r) => [r, readVersionResource(documentStore, r)] as const));
            for (const version of stamped.values()) {
                if (version > currentVersion) return null; // a quadrant newer than this app → reject
            }
            for (let i = 1; i <= currentVersion; i++) {
                const entry = entries[i]!;
                if (!entry.handler) continue; // additive/minor: the commit path normalizes it
                const quadrant = quadrantForHandler(i);
                if (stamped.get(byQuadrant[quadrant]!)! >= i) continue; // this quadrant already at/past version i
                // Stage ONLY this handler's quadrant to the version-(i-1) shape; another
                // quadrant may be at a different (possibly ahead) version and must not be
                // conformed here — that would down-convert and corrupt or throw.
                conformStoreToSchemas(documentStore, pickQuadrant(stagingSchemas(entries, i), quadrant));
                await entry.handler(documentStore);
            }
            for (const resource of configured) writeVersionResource(documentStore, resource, currentVersion);
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
