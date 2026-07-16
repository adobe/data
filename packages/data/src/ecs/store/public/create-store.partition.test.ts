// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createStore } from "./create-store.js";
import { constBufferType } from "../../../typed-buffer/create-const-buffer.js";

// `cell` partitions; `name` is uniquely indexed. `as const` preserves the
// `partition: true` literal (so the store is typed with the discrimination) and
// the index declaration (so `store.indexes.byName` is typed).
const schema = {
    components: {
        cell: { type: "integer", partition: true },
        name: { type: "string" },
    },
    resources: {},
    archetypes: { Spatial: ["cell", "name"] },
    indexes: { byName: { key: "name", unique: true } },
} as const;

const makeStore = () => createStore(schema);

describe("Store partition integration", () => {
    it("dynamically extends with a partition component AFTER creation; N values → N archetypes, each with a const column", () => {
        // Start with an empty store, then extend — exercises live (post-construction)
        // partition detection, not the schema passed at creation.
        const store = createStore().extend(schema);

        // The dynamically-added partitioned archetype is a Router (no dense view).
        const spatial = store.archetypes.Spatial;
        expect("columns" in spatial).toBe(false);

        // Insert N entities with N distinct partition values.
        const N = 5;
        const entities = Array.from({ length: N }, (_, i) => spatial.insert({ cell: i, name: `e${i}` }));

        // Query the archetypes — exactly N, one per distinct value.
        const archetypes = store.queryArchetypes(["cell", "name"]);
        expect(archetypes.length).toBe(N);

        // Every distinct value lives in its own archetype, and each still carries
        // a named `cell` column that is a const typed buffer (zero per-row bytes).
        const valuesSeen = new Set<number>();
        for (const arch of archetypes) {
            expect(arch.rowCount).toBe(1);
            const cellColumn = arch.columns.cell;
            expect(cellColumn.type).toBe(constBufferType);
            expect(cellColumn.typedArrayElementSizeInBytes).toBe(0);
            valuesSeen.add(cellColumn.get(0));
        }
        expect([...valuesSeen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);

        // The index (also added dynamically) resolves each routed entity.
        for (let i = 0; i < N; i++) {
            expect(store.indexes.byName.get({ name: `e${i}` })).toBe(entities[i]);
        }
    });

    it("store.archetypes.<PartitionedName> is a Proxy-free Router that routes inserts", () => {
        const store = makeStore();
        const spatial = store.archetypes.Spatial;
        expect(typeof spatial.insert).toBe("function");
        expect("columns" in spatial).toBe(false); // a family has no dense view

        const a = spatial.insert({ cell: 1, name: "a" });
        const b = spatial.insert({ cell: 2, name: "b" });
        expect(store.locate(a)!.archetype).not.toBe(store.locate(b)!.archetype);
        expect(store.get(a, "cell")).toBe(1);
        expect(store.get(b, "cell")).toBe(2);
    });

    it("maintains indexes on routed inserts (find across value-children)", () => {
        const store = makeStore();
        const spatial = store.archetypes.Spatial;
        const a = spatial.insert({ cell: 1, name: "alice" });
        const b = spatial.insert({ cell: 2, name: "bob" });
        expect(store.indexes.byName.get({ name: "alice" })).toBe(a);
        expect(store.indexes.byName.get({ name: "bob" })).toBe(b);
    });

    it("enforces a unique index across different value-children, atomically", () => {
        const store = makeStore();
        const spatial = store.archetypes.Spatial;
        const first = spatial.insert({ cell: 1, name: "dup" });
        // Same name, different cell → different archetype, still a unique conflict.
        expect(() => spatial.insert({ cell: 2, name: "dup" })).toThrow(/[Uu]nique/);
        // The original row is intact (atomic — no partial mutation).
        expect(store.indexes.byName.get({ name: "dup" })).toBe(first);
    });

    it("queryArchetypes `where` filters value-children at the store layer", () => {
        const store = makeStore();
        const spatial = store.archetypes.Spatial;
        spatial.insert({ cell: 1, name: "a" });
        spatial.insert({ cell: 2, name: "b" });
        spatial.insert({ cell: 2, name: "c" });
        const cell2 = store.queryArchetypes(["cell", "name"], { where: { cell: 2 } });
        expect(cell2.length).toBe(1);
        expect(cell2[0].rowCount).toBe(2);
    });

    it("store.ensureArchetype routes (no value) and resolves concrete (with value)", () => {
        const store = makeStore();
        const router = store.ensureArchetype(["id", "cell", "name"]);
        expect("columns" in router).toBe(false);
        router.insert({ cell: 5, name: "x" });

        const concrete = store.ensureArchetype(["id", "cell", "name"], { cell: 5 });
        expect(concrete.columns).toBeDefined();
        expect(concrete.rowCount).toBe(1);
    });

    it("index find works when inserting via the concrete-child path too", () => {
        const store = makeStore();
        const concrete = store.ensureArchetype(["id", "cell", "name"], { cell: 9 });
        const e = concrete.insert({ cell: 9, name: "zed" });
        expect(store.indexes.byName.get({ name: "zed" })).toBe(e);
    });

    it("index updates when a partition-value change migrates an entity", () => {
        const store = makeStore();
        const spatial = store.archetypes.Spatial;
        const e = spatial.insert({ cell: 1, name: "mover" });
        store.update(e, { cell: 2 });
        // Entity moved value-children; the name index still resolves it.
        expect(store.get(e, "cell")).toBe(2);
        expect(store.indexes.byName.get({ name: "mover" })).toBe(e);
    });
});
