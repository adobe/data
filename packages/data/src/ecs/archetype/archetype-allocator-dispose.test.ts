// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createArchetype } from "./index.js";
import { replaceArchetypeColumn } from "./replace-archetype-column.js";
import { createEntityLocationTable } from "../entity-location-table/index.js";
import { Entity } from "../entity/entity.js";
import { createTypedBuffer } from "../../typed-buffer/index.js";
import { createWasmMemoryAllocator } from "../../cache/memory-allocator.js";
import type { Schema } from "../../schema/index.js";

const num = { type: "number" } as const satisfies Schema;

describe("archetype column replacement releases the old arena block", () => {
  it("frees the replaced column's backing so the arena reuses it", () => {
    const allocator = createWasmMemoryAllocator(new WebAssembly.Memory({ initial: 1 }));
    const lt = createEntityLocationTable();
    const archetype = createArchetype({ id: Entity.schema, x: num }, 0, lt, allocator);
    archetype.insert({ x: 5 });

    const oldColumn = archetype.columns.x;
    const oldOffset = oldColumn.getTypedArray().byteOffset;

    // Replace the `x` column (routes through archetype.fromData). The old
    // arena-backed column must be disposed → its block returns to the free list.
    const replacement = createTypedBuffer(num, archetype.rowCapacity); // default-allocated
    replaceArchetypeColumn(archetype, "x", replacement);

    // A fresh same-size allocation from the SAME arena must reuse the freed block
    // rather than growing into new space — proof the old block was released.
    const probe = allocator.allocate(Float64Array, archetype.rowCapacity);
    expect(probe.byteOffset).toBe(oldOffset);
  });
});
