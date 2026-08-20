// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { quadrantOf, type Quadrant } from "../../store/index.js";
import type { SchemaChanges, VersionEntry } from "./version-entry.js";

export type VersionSchemas = {
    readonly components: Readonly<Record<string, Schema>>;
    readonly resources: Readonly<Record<string, Schema>>;
};

/**
 * Reconstruct the component + resource schemas at version `version` by applying
 * every entry's changes from `entries[0]` THROUGH `entries[version]` (inclusive).
 * Default `version` is the current one (`entries.length - 1`), so `foldSchemas(entries)`
 * is the current schema and `foldSchemas(entries, v)` is the schema a version-`v`
 * document is expected in. A `version` below 0 yields the empty base.
 */
export function foldSchemas(entries: readonly VersionEntry[], version: number = entries.length - 1): VersionSchemas {
    const components: Record<string, Schema> = {};
    const resources: Record<string, Schema> = {};
    const end = Math.min(version, entries.length - 1);
    for (let i = 0; i <= end; i++) {
        const { changes } = entries[i]!;
        apply(components, changes.components);
        apply(resources, changes.resources);
    }
    return { components, resources };
}

/**
 * The schema to stage the store to BEFORE running the version-`i` handler: the
 * previous version's schema (`fold(i-1)` — old shapes for the components the
 * handler reads/transforms, and the to-be-removed ones still present) PLUS the
 * components/resources NEWLY introduced at version `i` (so the handler can write
 * into them, e.g. to preserve a value out of a component it is about to remove).
 * A component CHANGED at version `i` keeps its old (`i-1`) shape here.
 */
export function stagingSchemas(entries: readonly VersionEntry[], i: number): VersionSchemas {
    const prev = foldSchemas(entries, i - 1);
    const cur = foldSchemas(entries, i);
    return {
        components: withNewKeys(prev.components, cur.components),
        resources: withNewKeys(prev.resources, cur.resources),
    };
}

/**
 * The set of quadrants the version-`i` entry's changed schemas touch. A removed
 * component (null) is gauged by its pre-removal schema. Used to enforce (and
 * drive) one-quadrant-per-handler.
 */
export function changedQuadrants(entries: readonly VersionEntry[], i: number): Set<Quadrant> {
    const cur = foldSchemas(entries, i);
    const prev = foldSchemas(entries, i - 1);
    const quads = new Set<Quadrant>();
    const scan = (namespace: "components" | "resources") => {
        const changes = entries[i]!.changes[namespace];
        if (!changes) return;
        for (const name of Object.keys(changes)) {
            const schema = changes[name] === null ? prev[namespace][name] : cur[namespace][name];
            if (schema) quads.add(quadrantOf(schema));
        }
    };
    scan("components");
    scan("resources");
    return quads;
}

function withNewKeys(prev: Readonly<Record<string, Schema>>, cur: Readonly<Record<string, Schema>>): Record<string, Schema> {
    const result: Record<string, Schema> = { ...prev };
    for (const name of Object.keys(cur)) {
        if (!(name in result)) result[name] = cur[name]!;
    }
    return result;
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
