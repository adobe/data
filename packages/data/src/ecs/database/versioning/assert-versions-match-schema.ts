// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { createCoerceFunction } from "../../../schema/create-coerce-function.js";
import { equals } from "../../../equals.js";
import { foldSchemas } from "./fold-schemas.js";
import type { VersionEntry } from "./version-entry.js";

type Drift = {
    readonly namespace: "components" | "resources";
    readonly name: string;
    readonly kind: "added" | "removed" | "auto" | "breaking";
    readonly next: Schema | null; // the merge-patch value to record (null = removal)
};

/**
 * Assert that folding every version entry reproduces the CURRENT declared schema.
 * This is the co-located guard: change a component or resource and forget to
 * record it, and this throws — with an actionable recipe for fixing it.
 *
 * `components`/`resources` are the app's current persistent schemas (inject the
 * plugin's, minus the built-ins). Pass `currentVersion` to also assert the
 * stamped version resource default equals `entries.length`.
 *
 * On drift the message classifies every change as auto-convertible (record a
 * merge-patch, no handler) or breaking (record a patch AND a handler), and prints
 * the exact new entry to append — so a human just re-runs after editing schemas,
 * and an agent can apply the fix mechanically.
 */
export function assertVersionsMatchSchema(input: {
    readonly entries: readonly VersionEntry[];
    readonly components: Readonly<Record<string, Schema>>;
    readonly resources: Readonly<Record<string, Schema>>;
    /** Name of the version resource, excluded from the diff — its default IS the
     *  version number, so it changes every version by construction and is not
     *  tracked in the history. */
    readonly versionResource?: string;
    readonly currentVersion?: number;
}): void {
    if (input.currentVersion !== undefined && input.currentVersion !== input.entries.length) {
        throw new Error(
            `Version mismatch: the stamped current version is ${input.currentVersion} but the history has ` +
            `${input.entries.length} entries. Set the version resource default to ${input.entries.length}.`,
        );
    }

    const folded = foldSchemas(input.entries);
    const drifts = [
        ...diff("components", folded.components, input.components),
        ...diff("resources", without(folded.resources, input.versionResource), without(input.resources, input.versionResource)),
    ];
    if (drifts.length === 0) return;

    throw new Error(buildRecipe(drifts, input.entries.length));
}

function without(schemas: Readonly<Record<string, Schema>>, name: string | undefined): Readonly<Record<string, Schema>> {
    if (name === undefined || !(name in schemas)) return schemas;
    const { [name]: _omit, ...rest } = schemas;
    return rest;
}

function diff(
    namespace: "components" | "resources",
    folded: Readonly<Record<string, Schema>>,
    current: Readonly<Record<string, Schema>>,
): Drift[] {
    const drifts: Drift[] = [];
    for (const name of new Set([...Object.keys(folded), ...Object.keys(current)])) {
        const from = folded[name];
        const to = current[name];
        if (from === undefined && to !== undefined) {
            drifts.push({ namespace, name, kind: "added", next: to });
        } else if (from !== undefined && to === undefined) {
            drifts.push({ namespace, name, kind: "removed", next: null });
        } else if (from !== undefined && to !== undefined && !equals(from, to)) {
            const auto = createCoerceFunction(from, to) !== null;
            drifts.push({ namespace, name, kind: auto ? "auto" : "breaking", next: to });
        }
    }
    return drifts;
}

function buildRecipe(drifts: Drift[], length: number): string {
    const breaking = drifts.filter((d) => d.kind === "breaking");
    const lines: string[] = [
        `The version history no longer matches the current schema — ${drifts.length} change(s) are unrecorded.`,
        `Fix: append ONE new version entry with the changes below, then set the version resource default to ${length + 1}.`,
        ``,
    ];

    for (const ns of ["components", "resources"] as const) {
        const here = drifts.filter((d) => d.namespace === ns);
        if (here.length === 0) continue;
        lines.push(`  changes.${ns} = {`);
        for (const d of here) {
            const value = d.next === null ? "null" : JSON.stringify(d.next);
            const tag =
                d.kind === "added" ? "add" : d.kind === "removed" ? "remove" : d.kind === "auto" ? "modify (auto-convertible)" : "MODIFY (BREAKING — needs a handler)";
            lines.push(`    ${JSON.stringify(d.name)}: ${value},   // ${tag}`);
        }
        lines.push(`  }`);
    }

    lines.push(``);
    if (breaking.length === 0) {
        lines.push(`All changes are auto-convertible — record the merge-patch above with NO handler.`);
    } else {
        lines.push(
            `${breaking.length} change(s) are NOT auto-convertible and REQUIRE a handler on the new entry:`,
        );
        for (const d of breaking) {
            lines.push(`  - ${d.namespace} "${d.name}" — add handler logic that migrates it to the new schema.`);
        }
        lines.push(`The handler runs against the store staged to version ${length}, and may read any component.`);
    }
    return lines.join("\n");
}
