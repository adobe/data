// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time (red/green) verification that the transaction context `t`
// discriminates partition archetypes — both `t.archetypes.<Name>` and
// `t.ensureArchetype`. Wrapped in a never-called function so the file
// type-checks without executing the plugin factory.

import { Database } from "./database.js";

function _transactionContextDiscrimination() {
    Database.Plugin.create({
        components: {
            cell: { type: "integer", partition: true },
            position: { type: "number" },
            health: { type: "number" },
        },
        archetypes: {
            Spatial: ["cell", "position"],   // partition family
            Mob: ["position", "health"],     // concrete
        },
        transactions: {
            check: (t) => {
                // A partitioned named archetype is a Router on `t` — write via insert.
                t.archetypes.Spatial.insert({ cell: 1, position: 2 });
                // @ts-expect-error - Spatial is a partition family (Router), not a concrete Archetype
                t.archetypes.Spatial.columns;

                // A non-partition named archetype is a concrete Archetype on `t`.
                t.archetypes.Mob.columns;
                t.archetypes.Mob.insert({ position: 1, health: 100 });

                // ensureArchetype on `t` discriminates just like on the store.
                const router = t.ensureArchetype(["id", "cell", "position"]);
                router.insert({ cell: 1, position: 2 });
                // @ts-expect-error - a partition family (Router) has no columns
                router.columns;

                const concrete = t.ensureArchetype(["id", "cell", "position"], { cell: 7 });
                concrete.columns;

                // @ts-expect-error - partition value must match the component type (cell is number)
                t.ensureArchetype(["id", "cell", "position"], { cell: "nope" });
            },
        },
    });
}
