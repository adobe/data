// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { createCoerceFunction } from "../../../schema/create-coerce-function.js";
import { equals } from "../../../equals.js";
import { isTransientSchema } from "../../store/index.js";
import { foldSchemas, changedQuadrants } from "./fold-schemas.js";
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
 * stamped version resource default equals `entries.length - 1` (the current version).
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
    /** Name(s) of the version resource(s), excluded from the diff — a stamp's
     *  default IS the version number, so it changes every version by construction
     *  and is not tracked in the history. Pass an array for per-quadrant stamps. */
    readonly versionResource?: string | readonly string[];
    readonly currentVersion?: number;
}): void {
    const versionResources = new Set(
        input.versionResource === undefined
            ? []
            : typeof input.versionResource === "string"
              ? [input.versionResource]
              : input.versionResource,
    );
    for (let i = 0; i < input.entries.length; i++) {
        if (input.entries[i]!.version !== i) {
            throw new Error(
                `Version history entry at index ${i} has version ${input.entries[i]!.version}, but must be ${i} ` +
                `(each entry's version = its index).`,
            );
        }
    }

    const currentVersion = input.entries.length - 1;
    if (input.currentVersion !== undefined && input.currentVersion !== currentVersion) {
        throw new Error(
            `Version mismatch: the stamped current version is ${input.currentVersion} but the history's current ` +
            `version is ${currentVersion} (entries.length - 1). Set the version resource default to ${currentVersion}.`,
        );
    }

    const folded = foldSchemas(input.entries);

    // The session quadrant (neither persistent nor shared) is never versioned, so
    // it must not appear in the history at all.
    const transientOffenders = [
        ...transientNames("components", folded.components),
        ...transientNames("resources", folded.resources),
    ];
    if (transientOffenders.length > 0) {
        throw new Error(
            `The version history records non-persistent schema(s) — ${transientOffenders.join(", ")}. ` +
            `Non-persistent state is never saved, so it is not versioned; remove it from the version entries. ` +
            `Only persisted (document / settings) components and resources belong in the history.`,
        );
    }

    // Every versioned schema must declare a real type (a JSON schema), not just a
    // bare default. Only session values (excluded above) may be untyped — e.g. a
    // GPU buffer that can't be schema-typed. A real type is what lets a change be
    // detected; an untyped `{ default }` hides shape changes.
    const versioned = collectVersioned(folded, input.components, input.resources, versionResources);
    const untyped = versioned.filter((s) => !hasDeclaredType(s.schema)).map((s) => `${s.namespace} "${s.name}"`);
    if (untyped.length > 0) {
        throw new Error(
            `Versioned schema(s) must declare a type — ${untyped.join(", ")} are untyped. Give each a real JSON ` +
            `schema (\`type\`/\`enum\`/\`const\`) so changes are detectable. Only NON-PERSISTENT values (e.g. a GPU ` +
            `buffer) may be untyped, and those are not versioned.`,
        );
    }

    // A default must be fully DESCRIBED by its schema — it cannot carry structure
    // the schema doesn't declare (that structure would evolve undetected).
    const badDefault = versioned.map((s) => defaultProblem(s.namespace, s.name, s.schema)).find((m) => m !== null);
    if (badDefault) throw new Error(badDefault);

    // A handler must touch a SINGLE quadrant. Persisted quadrants can be saved to
    // different backends (cloud document vs local settings), so when one is loaded
    // the other's data is absent — a cross-quadrant handler would read nothing.
    for (let i = 0; i < input.entries.length; i++) {
        if (input.entries[i]!.handler === undefined) continue;
        const quads = changedQuadrants(input.entries, i);
        if (quads.size > 1) {
            throw new Error(
                `The version ${i} handler changes schemas across multiple quadrants (${[...quads].join(", ")}). ` +
                `A handler must be quadrant-local — in split persistence the other quadrant's data is not present ` +
                `when one quadrant loads. Split version ${i} into one entry per quadrant, each with its own handler.`,
            );
        }
    }

    const drifts = [
        ...diff("components", folded.components, input.components),
        ...diff("resources", withoutNames(folded.resources, versionResources), withoutNames(input.resources, versionResources)),
    ];
    if (drifts.length === 0) return;

    throw new Error(buildRecipe(drifts, input.entries.length));
}

function transientNames(namespace: string, schemas: Readonly<Record<string, Schema>>): string[] {
    return Object.keys(schemas)
        .filter((name) => isTransientSchema(schemas[name]!))
        .map((name) => `${namespace} "${name}"`);
}

// Every versioned schema (recorded + current), minus the version resource.
function collectVersioned(
    folded: { components: Readonly<Record<string, Schema>>; resources: Readonly<Record<string, Schema>> },
    components: Readonly<Record<string, Schema>>,
    resources: Readonly<Record<string, Schema>>,
    versionResources: ReadonlySet<string>,
): { namespace: string; name: string; schema: Schema }[] {
    const out: { namespace: string; name: string; schema: Schema }[] = [];
    const add = (namespace: string, map: Readonly<Record<string, Schema>>) => {
        for (const name of Object.keys(map)) {
            if (namespace === "resources" && versionResources.has(name)) continue;
            out.push({ namespace, name, schema: map[name]! });
        }
    };
    add("components", folded.components);
    add("resources", folded.resources);
    add("components", components);
    add("resources", resources);
    return out;
}

// A real JSON schema declares a type (or an enum / const). A bare `{ default }`
// does not — it carries no shape the versioner can diff.
function hasDeclaredType(schema: Schema): boolean {
    return schema.type !== undefined || schema.enum !== undefined || schema.const !== undefined;
}

function defaultProblem(namespace: string, name: string, schema: Schema): string | null {
    if (schema.default === undefined) return null;
    if (defaultViolatesSchema(schema, schema.default)) {
        return (
            `The default for ${namespace} "${name}" is not fully described by its schema — it has a type mismatch or ` +
            `carries structure the schema does not declare. Widen the schema to describe the whole value, or trim the default.`
        );
    }
    return null;
}

// True when `value` is NOT fully described by `schema` — a type mismatch, or (for
// objects/arrays) structure beyond what the schema declares.
function defaultViolatesSchema(schema: Schema, value: unknown): boolean {
    if (schema.const !== undefined) return value !== schema.const;
    if (schema.enum !== undefined) return !schema.enum.includes(value);
    switch (schema.type) {
        case "number":
        case "integer":
            return typeof value !== "number";
        case "boolean":
            return typeof value !== "boolean";
        case "string":
            return typeof value !== "string";
        case "object": {
            if (value === null || typeof value !== "object" || Array.isArray(value)) return true;
            const props = schema.properties ?? {};
            for (const key of Object.keys(value)) {
                if (!(key in props)) return true; // extra key the schema doesn't declare
                if (defaultViolatesSchema(props[key]!, (value as Record<string, unknown>)[key])) return true;
            }
            return false;
        }
        case "array": {
            if (!Array.isArray(value)) return true;
            const items = schema.items;
            if (!items) return value.length > 0; // no item schema → any element is undeclared
            return value.some((v) => defaultViolatesSchema(items, v));
        }
        default:
            return false; // untyped is rejected earlier; nothing to check here
    }
}

function withoutNames(schemas: Readonly<Record<string, Schema>>, names: ReadonlySet<string>): Readonly<Record<string, Schema>> {
    if (names.size === 0) return schemas;
    const rest: Record<string, Schema> = {};
    for (const name of Object.keys(schemas)) {
        if (!names.has(name)) rest[name] = schemas[name]!;
    }
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
        `Fix: append ONE new entry (version: ${length}) with the changes below, then set the version resource default to ${length}.`,
        ``,
    ];

    for (const ns of ["components", "resources"] as const) {
        const here = drifts.filter((d) => d.namespace === ns);
        if (here.length === 0) continue;
        lines.push(`  changes.${ns} = {`);
        for (const d of here) {
            const value = d.next === null ? "null" : JSON.stringify(d.next);
            const tag =
                d.kind === "added" ? "add" :
                d.kind === "removed" ? "remove — ⚠ DROPS DATA" :
                d.kind === "auto" ? "modify (auto-convertible)" :
                "MODIFY (BREAKING — needs a handler)";
            lines.push(`    ${JSON.stringify(d.name)}: ${value},   // ${tag}`);
        }
        lines.push(`  }`);
    }

    lines.push(``);
    const removed = drifts.filter((d) => d.kind === "removed");
    if (removed.length > 0) {
        lines.push(
            `⚠ ${removed.length} removal(s): recording \`null\` drops the data. If it must be preserved, ` +
            `add a handler that reads it (still present while the handler runs) and writes it elsewhere — it is dropped when the load commits: ` +
            removed.map((d) => `${d.namespace} "${d.name}"`).join(", ") + ".",
        );
    }
    if (breaking.length === 0) {
        lines.push(`All modifications are auto-convertible — record the merge-patch above with NO handler.`);
    } else {
        lines.push(
            `${breaking.length} modification(s) are NOT auto-convertible and REQUIRE a handler on the new entry:`,
        );
        for (const d of breaking) {
            lines.push(`  - ${d.namespace} "${d.name}" — remapStoreComponent(store, "${d.name}", <new schema>, old => <new value>).`);
        }
        lines.push(`The handler runs against the store staged to version ${length - 1}, and may read any component.`);
    }
    return lines.join("\n");
}
