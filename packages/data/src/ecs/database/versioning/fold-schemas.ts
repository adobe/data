// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import type { SchemaChanges, VersionEntry } from "./version-entry.js";

export type VersionSchemas = {
    readonly components: Readonly<Record<string, Schema>>;
    readonly resources: Readonly<Record<string, Schema>>;
};

/**
 * Reconstruct the component + resource schemas at a given version by applying
 * every entry's changes over the empty base. `upTo` (default: all) yields the
 * schema *at* that version — `foldSchemas(entries)` is the current schema,
 * `foldSchemas(entries, v)` is the schema a version-`v` document is expected in.
 */
export function foldSchemas(entries: readonly VersionEntry[], upTo: number = entries.length): VersionSchemas {
    const components: Record<string, Schema> = {};
    const resources: Record<string, Schema> = {};
    const end = Math.min(upTo, entries.length);
    for (let i = 0; i < end; i++) {
        const { changes } = entries[i]!;
        apply(components, changes.components);
        apply(resources, changes.resources);
    }
    return { components, resources };
}

// A schema-level replace/remove — NOT a deep merge: each entry's value replaces
// the whole schema (null removes it), so a shape change leaves no stale keys.
function apply(schemas: Record<string, Schema>, changes: SchemaChanges | undefined): void {
    if (changes === undefined) return;
    for (const name of Object.keys(changes)) {
        const schema = changes[name]!;
        if (schema === null) delete schemas[name];
        else schemas[name] = schema;
    }
}
