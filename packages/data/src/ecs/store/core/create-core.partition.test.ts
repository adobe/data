// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createCore } from "./create-core.js";
import { Schema } from "../../../schema/index.js";
import { constBufferType } from "../../../typed-buffer/create-const-buffer.js";

const positionSchema = {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" } },
} as const satisfies Schema;

// A partition component: every distinct `cell` value gets its own archetype.
const cellSchema = { type: "integer", partition: true } as const satisfies Schema;

const makeCore = () => createCore({ cell: cellSchema, position: positionSchema });

describe("partition components", () => {
    describe("ensureArchetype return discrimination", () => {
        it("returns a Router (no dense view) when a partition key is present without a value", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            expect(typeof router.insert).toBe("function");
            // A family has no single dense column view. `in` (not a cast) — the
            // Router type has no such members, so probe presence structurally.
            expect("columns" in router).toBe(false);
            expect("rowCount" in router).toBe(false);
        });

        it("returns a concrete Archetype when the partition value is supplied", () => {
            const core = makeCore();
            const arch = core.ensureArchetype(["id", "cell", "position"], { cell: 7 });
            expect(arch.columns).toBeDefined();
            expect(arch.rowCount).toBe(0);
        });

        it("returns a concrete Archetype (not a Router) when no partition component is in the set", () => {
            const core = makeCore();
            const arch = core.ensureArchetype(["id", "position"]);
            expect(arch.columns).toBeDefined();
            expect(typeof arch.insert).toBe("function");
        });
    });

    describe("routing insert", () => {
        it("routes rows with distinct partition values into distinct archetypes", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            const a = router.insert({ cell: 1, position: { x: 1, y: 1 } });
            const b = router.insert({ cell: 2, position: { x: 2, y: 2 } });
            const c = router.insert({ cell: 1, position: { x: 3, y: 3 } });

            const cell1 = core.ensureArchetype(["id", "cell", "position"], { cell: 1 });
            const cell2 = core.ensureArchetype(["id", "cell", "position"], { cell: 2 });

            // Same value → same archetype; different value → different archetype.
            expect(cell1).not.toBe(cell2);
            expect(cell1.rowCount).toBe(2); // a and c
            expect(cell2.rowCount).toBe(1); // b

            expect(core.locate(a)!.archetype).toBe(cell1);
            expect(core.locate(c)!.archetype).toBe(cell1);
            expect(core.locate(b)!.archetype).toBe(cell2);
        });

        it("stores the partition value as a const column (zero per-row bytes)", () => {
            const core = makeCore();
            core.ensureArchetype(["id", "cell", "position"]).insert({ cell: 42, position: { x: 0, y: 0 } });
            const arch = core.ensureArchetype(["id", "cell", "position"], { cell: 42 });
            expect(arch.columns.cell.type).toBe(constBufferType);
            expect(arch.columns.cell.typedArrayElementSizeInBytes).toBe(0);
            expect(arch.columns.cell.get(0)).toBe(42);
        });

        it("reads the routed partition value back through the entity", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            const e = router.insert({ cell: 9, position: { x: 5, y: 6 } });
            expect(core.get(e, "cell")).toBe(9);
            expect(core.read(e)).toMatchObject({ cell: 9, position: { x: 5, y: 6 } });
        });
    });

    describe("queryArchetypes", () => {
        it("returns every value-child of a partitioned component set", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            router.insert({ cell: 1, position: { x: 0, y: 0 } });
            router.insert({ cell: 2, position: { x: 0, y: 0 } });
            router.insert({ cell: 3, position: { x: 0, y: 0 } });

            const all = core.queryArchetypes(["cell", "position"]);
            expect(all.length).toBe(3);
        });

        it("filters to a single value-child with a partition `where` (broad phase)", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            router.insert({ cell: 1, position: { x: 0, y: 0 } });
            router.insert({ cell: 2, position: { x: 0, y: 0 } });
            router.insert({ cell: 2, position: { x: 0, y: 0 } });

            const cell2 = core.queryArchetypes(["cell", "position"], { where: { cell: 2 } });
            expect(cell2.length).toBe(1);
            expect(cell2[0].columns.cell.get(0)).toBe(2);
            expect(cell2[0].rowCount).toBe(2);

            const none = core.queryArchetypes(["cell", "position"], { where: { cell: 99 } });
            expect(none.length).toBe(0);
        });
    });

    describe("update migration", () => {
        it("migrates an entity to a new value-child when its partition value changes", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            const e = router.insert({ cell: 1, position: { x: 7, y: 8 } });

            const cell1 = core.ensureArchetype(["id", "cell", "position"], { cell: 1 });
            const cell2 = core.ensureArchetype(["id", "cell", "position"], { cell: 2 });
            expect(cell1.rowCount).toBe(1);
            expect(cell2.rowCount).toBe(0);

            core.update(e, { cell: 2 });

            // Same entity id, moved archetype, position preserved.
            expect(core.locate(e)!.archetype).toBe(cell2);
            expect(cell1.rowCount).toBe(0);
            expect(cell2.rowCount).toBe(1);
            expect(core.get(e, "cell")).toBe(2);
            expect(core.read(e)).toMatchObject({ cell: 2, position: { x: 7, y: 8 } });
        });

        it("does not migrate when a non-partition field changes", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            const e = router.insert({ cell: 5, position: { x: 1, y: 1 } });
            const cell5 = core.locate(e)!.archetype;

            core.update(e, { position: { x: 9, y: 9 } });

            expect(core.locate(e)!.archetype).toBe(cell5);
            expect(core.read(e)).toMatchObject({ cell: 5, position: { x: 9, y: 9 } });
        });

        it("does not migrate when a partition value is set to its current value", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            const e = router.insert({ cell: 3, position: { x: 0, y: 0 } });
            const before = core.locate(e)!.archetype;
            core.update(e, { cell: 3 });
            expect(core.locate(e)!.archetype).toBe(before);
        });
    });

    describe("serialization", () => {
        it("round-trips partition children (values + rows) through toData/fromData", () => {
            const core = makeCore();
            const router = core.ensureArchetype(["id", "cell", "position"]);
            const a = router.insert({ cell: 1, position: { x: 1, y: 1 } });
            const b = router.insert({ cell: 2, position: { x: 2, y: 2 } });

            const snapshot = core.toData(true);

            const restored = makeCore();
            restored.fromData(snapshot);

            expect(restored.get(a, "cell")).toBe(1);
            expect(restored.get(b, "cell")).toBe(2);
            expect(restored.read(a)).toMatchObject({ cell: 1, position: { x: 1, y: 1 } });
            expect(restored.read(b)).toMatchObject({ cell: 2, position: { x: 2, y: 2 } });

            const cell1 = restored.ensureArchetype(["id", "cell", "position"], { cell: 1 });
            expect(cell1.columns.cell.type).toBe(constBufferType);
            expect(cell1.rowCount).toBe(1);
        });
    });

    describe("feature is inert without partition components", () => {
        it("a store with no partition component behaves exactly as before", () => {
            const core = createCore({ position: positionSchema });
            const arch = core.ensureArchetype(["id", "position"]);
            // Concrete archetype, direct insert, dense columns — no Router anywhere.
            expect(arch.columns).toBeDefined();
            const e = arch.insert({ position: { x: 1, y: 2 } });
            expect(core.read(e)).toMatchObject({ position: { x: 1, y: 2 } });
        });
    });
});
