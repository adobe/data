// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time (red/green) verification of the partition public surface on
// `Store` — discrimination of `store.archetypes.<Name>` and `ensureArchetype`,
// and the partition-keyed `queryArchetypes` where. Bodies live in never-called
// functions so the file type-checks without executing.

import { Store } from "../store.js";
import { createStore } from "./create-store.js";

// ── Fixture: `cell` partitions; `position`/`health` do not ──
type SpatialStoreSchema = {
    components: {
        cell: { type: "integer"; partition: true };
        position: { type: "number" };
        health: { type: "number" };
    };
    resources: {};
    archetypes: {
        Spatial: ["cell", "position"];   // includes a partition component → family
        Mob: ["position", "health"];     // no partition component → concrete
    };
};

type SpatialStore = Store.FromSchema<SpatialStoreSchema>;
declare const store: SpatialStore;

// store.archetypes.<Name> — discriminated per declared name
function _archetypesMap() {
    // A partitioned named archetype is a Router — write via insert, no dense view.
    store.archetypes.Spatial.insert({ cell: 1, position: 2 });
    // @ts-expect-error - Spatial is a partition family (Router), not a concrete Archetype
    store.archetypes.Spatial.columns;
    // @ts-expect-error - a Router has no rowCount
    store.archetypes.Spatial.rowCount;

    // A non-partitioned named archetype is a concrete Archetype.
    store.archetypes.Mob.columns;
    store.archetypes.Mob.rowCount;
    store.archetypes.Mob.insert({ position: 1, health: 100 });
}

// store.ensureArchetype(keys, values?) — discriminated
function _ensureArchetype() {
    // Partition key present, no value → Router (insert only).
    const router = store.ensureArchetype(["id", "cell", "position"]);
    router.insert({ cell: 1, position: 2 });
    // @ts-expect-error - a partition family (Router) has no columns
    router.columns;

    // Partition value supplied → concrete Archetype (dense access).
    const concrete = store.ensureArchetype(["id", "cell", "position"], { cell: 7 });
    concrete.columns;
    concrete.rowCount;

    // No partition component in the set → concrete Archetype.
    const plain = store.ensureArchetype(["id", "position"]);
    plain.columns;

    // @ts-expect-error - partition value must match the component's type (cell is number)
    store.ensureArchetype(["id", "cell", "position"], { cell: "nope" });
}

// queryArchetypes where — keyed to partition components only
function _queryWhere() {
    store.queryArchetypes(["cell", "position"], { where: { cell: 7 } });
    // @ts-expect-error - `position` is not a partition component; not archetype-decidable
    store.queryArchetypes(["cell", "position"], { where: { position: 1 } });
    // @ts-expect-error - partition where value must match the component type (cell is number)
    store.queryArchetypes(["cell"], { where: { cell: "x" } });
}

// createStore return threads PK (inference, not just Store.FromSchema)
function _inferenceCheck() {
    const s = createStore({
        components: {
            cell: { type: "integer", partition: true },
            position: { type: "number" },
        },
        resources: {},
        archetypes: { Spatial: ["cell", "position"] },
    } as const);
    s.archetypes.Spatial.insert({ cell: 1, position: 2 });
    // @ts-expect-error - inferred Spatial is a Router (partition family), no columns
    s.archetypes.Spatial.columns;
    return s;
}
