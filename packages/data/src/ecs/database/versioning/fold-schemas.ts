// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { mergePatch, type Patch } from "../../../functions/merge-patch.js";
import type { VersionEntry } from "./version-entry.js";

export type VersionSchemas = {
    readonly components: Readonly<Record<string, Schema>>;
    readonly resources: Readonly<Record<string, Schema>>;
};

/**
 * Reconstruct the component + resource schemas at a given version by folding
 * every entry's merge-patch over the empty base. `upTo` (default: all) yields the
 * schema *at* that version — `foldSchemas(entries)` is the current schema,
 * `foldSchemas(entries, v)` is the schema a version-`v` document is expected in.
 */
export function foldSchemas(entries: readonly VersionEntry[], upTo: number = entries.length): VersionSchemas {
    let components: Record<string, Schema> = {};
    let resources: Record<string, Schema> = {};
    const end = Math.min(upTo, entries.length);
    for (let i = 0; i < end; i++) {
        const { changes } = entries[i]!;
        if (changes.components !== undefined) {
            components = mergePatch(components, changes.components as Patch<Record<string, Schema>>);
        }
        if (changes.resources !== undefined) {
            resources = mergePatch(resources, changes.resources as Patch<Record<string, Schema>>);
        }
    }
    return { components, resources };
}
