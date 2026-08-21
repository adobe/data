// © 2026 Adobe. MIT License. See /LICENSE for details.

import { storeSchemas } from "../../store/index.js";
import { assertVersionsMatchSchema } from "./assert-versions-match-schema.js";
import { testUpgradeHandlers, type UpgradeHandlerTest } from "./test-upgrade-handlers.js";
import type { VersionEntry } from "./version-entry.js";

// Structural view of the bits this reads off a Database / Store.
interface VersionedDatabase {
    readonly componentSchemas: object;
    readonly resources: Record<string, unknown>;
}

/**
 * The ONE co-located guard a versioned app writes — it runs BOTH checks so a single
 * test proves the versioning is consistent end to end:
 *   1. {@link assertVersionsMatchSchema} — the history folds to the live schema, every
 *      change is recorded, only real persisted schemas appear, handlers are single-quadrant
 *      (schema/authoring coverage; throws synchronously with a fix recipe);
 *   2. {@link testUpgradeHandlers} — every entry with a `handler` has a `handlers` case,
 *      and each case runs against a store staged to the handler's input version and passes
 *      (handler coverage + behavior; throws for a missing case, rejects for a failing run).
 *
 * `currentVersion` is read off the live `database` (the version resource's default), so a
 * drift between the stamped default and the history length is caught too. Pass every version
 * resource name in `versionResource` (an array for per-quadrant stamps).
 *
 * Returns the promise from step 2 — `it("versioning", () => assertVersioning({ … }))`.
 * The two underlying functions stay exported for bespoke use.
 */
export function assertVersioning(input: {
    readonly database: VersionedDatabase;
    readonly entries: readonly VersionEntry[];
    readonly versionResource: string | readonly string[];
    readonly handlers?: Readonly<Record<number, UpgradeHandlerTest<any>>>;
}): Promise<void> {
    const primary = typeof input.versionResource === "string" ? input.versionResource : input.versionResource[0]!;
    assertVersionsMatchSchema({
        entries: input.entries,
        ...storeSchemas(input.database),
        versionResource: input.versionResource,
        // The version resource's default IS the stamped current version (a number).
        currentVersion: input.database.resources[primary] as number | undefined,
    });
    return testUpgradeHandlers(input.entries, input.handlers ?? {});
}
