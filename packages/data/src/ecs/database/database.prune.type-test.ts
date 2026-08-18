// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Type-only tests for Database.pruneToPluginSchema's generic return type.
// Nothing here executes — the file is a compile-time (red/green) check that
// `pruneToPluginSchema<P>(plugin: P)` returns `Database.FromPlugin<P>`, i.e. the
// same instance retyped to the *target* plugin's schema. `@ts-expect-error`
// marks the assignments that must NOT type-check.

import { Database } from "./database.js";

const numeric = { type: "number", default: 0 } as const;

// The simpler (target) schema.
const simplePlugin = Database.Plugin.create({
    components: { a: numeric },
    resources: { keptRes: { default: 0 as number } },
    archetypes: { A: ["a"] } as const,
    transactions: {
        addA(t, args: { a: number }) {
            return t.archetypes.A.insert(args);
        },
    },
});

// A larger schema that extends the simpler one and adds a foreign component,
// archetype, and transaction.
const fullPlugin = Database.Plugin.create({
    extends: simplePlugin,
    components: { c: numeric },
    archetypes: { AC: ["a", "c"] } as const,
    transactions: {
        addAC(t, args: { a: number; c: number }) {
            return t.archetypes.AC.insert(args);
        },
    },
});

// Wrapped in a never-called function: purely a type-level assertion site.
function _pruneReturnTypeChecks(): void {
    const full = Database.create(fullPlugin);

    // POSITIVE — pruning the wider database to the simpler plugin yields a value
    // assignable to `Database.FromPlugin<typeof simplePlugin>`, and its declared
    // surface is usable through the narrowed type.
    const pruned: Database.FromPlugin<typeof simplePlugin> = full.pruneToPluginSchema(simplePlugin);
    pruned.transactions.addA({ a: 1 });
    void pruned.resources.keptRes;

    // NEGATIVE — the pruned type is narrower than the full schema, so it must NOT
    // be assignable to `Database.FromPlugin<typeof fullPlugin>` (that would claim
    // the pruned-away `c` / `addAC` surface still exists in the type).
    // @ts-expect-error pruned schema is narrower than the full plugin's schema
    const wide: Database.FromPlugin<typeof fullPlugin> = full.pruneToPluginSchema(simplePlugin);
    void wide;

    // NEGATIVE — a foreign transaction is not part of the pruned (target) type.
    // @ts-expect-error `addAC` was pruned away and is no longer in the type
    pruned.transactions.addAC({ a: 1, c: 2 });
}
void _pruneReturnTypeChecks;
