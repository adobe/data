// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { createCoerceFunction } from "../../../schema/create-coerce-function.js";
import { equals } from "../../../equals.js";
import { coerceStoreComponent } from "../../store/index.js";
import type { Store } from "../../store/index.js";
import type { VersionSchemas } from "./fold-schemas.js";

/**
 * Coerce every component and resource of `store` to the given target schemas, IN
 * PLACE. A component whose stored schema already matches is skipped; one that
 * differs is auto-converted (add-field-from-default, widen/narrow, reorder,
 * clamp, …); one absent from the store is declared (so the store knows it going
 * forward). Resources are components internally, so they convert the same way.
 *
 * Used both to stage a document store to an intermediate version before a major
 * handler and to normalize it to the current schema afterward. A component whose
 * change is NOT auto-convertible throws — that is a major change that a handler
 * must have already produced, so reaching here un-handled is a developer error.
 */
export function conformStoreToSchemas(store: Store<any, any, any>, target: VersionSchemas): void {
    conform(store, target.components);
    conform(store, target.resources);
}

function conform(store: Store<any, any, any>, schemas: Readonly<Record<string, Schema>>): void {
    const stored = store.componentSchemas as Record<string, Schema>;
    for (const name of Object.keys(schemas)) {
        const to = schemas[name]!;
        const from = stored[name];
        if (from !== undefined && equals(from, to)) continue; // already at the target schema
        if (from !== undefined && createCoerceFunction(from, to) === null) {
            throw new Error(
                `Cannot conform "${name}" from its stored schema to the target schema: the change is not ` +
                `automatically convertible, so it must be produced by a version upgrade handler before this point.`,
            );
        }
        coerceStoreComponent(store, name, to); // converts existing data, or declares an absent component
    }
}
