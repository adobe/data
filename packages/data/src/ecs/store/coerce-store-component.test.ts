// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Store } from "./index.js";
import { coerceStoreComponent } from "./coerce-store-component.js";
import { coerceArchetypeColumn, type Archetype } from "../archetype/index.js";
import type { Schema } from "../../schema/index.js";

const f32 = { type: "number", precision: 1 } as const satisfies Schema;
const num = { type: "number" } as const satisfies Schema;
const vec2 = { type: "object", properties: { x: f32, y: f32 } } as const satisfies Schema;
const vec3 = { type: "object", properties: { x: f32, y: f32, z: { type: "number", precision: 1, default: 7 } } } as const satisfies Schema;
const capped = { type: "integer", minimum: 0, maximum: 100 } as const satisfies Schema;

describe("coerceArchetypeColumn — in-place column conversion on a table", () => {
    it("adds a struct field to every live row and keeps insert working", () => {
        const store = Store.create({ components: { pos: vec2 }, resources: {}, archetypes: { P: ["pos"] } });
        const P = store.archetypes.P as any;
        const e0 = P.insert({ pos: { x: 1, y: 2 } });
        const e1 = P.insert({ pos: { x: 3, y: 4 } });

        const arch = store.queryArchetypes(["pos"])[0] as unknown as Archetype<any>;
        expect(coerceArchetypeColumn(arch, "pos", vec3)).toBe(true);

        // Existing rows carry the new field's default.
        expect(store.read(e0)).toEqual({ pos: { x: 1, y: 2, z: 7 } });
        expect(store.read(e1)).toEqual({ pos: { x: 3, y: 4, z: 7 } });
        // The column now reports the new schema.
        expect(arch.columns.pos.schema).toBe(vec3);

        // Insert AFTER the swap writes through the rebuilt (converted) column.
        const e2 = P.insert({ pos: { x: 5, y: 6, z: 8 } });
        expect(store.read(e2)).toEqual({ pos: { x: 5, y: 6, z: 8 } });
    });

    it("is a no-op returning false when the component is absent", () => {
        const store = Store.create({ components: { pos: vec2 }, resources: {}, archetypes: { P: ["pos"] } });
        const p = store.queryArchetypes(["pos"])[0] as unknown as Archetype<any>;
        expect(coerceArchetypeColumn(p, "missing", num)).toBe(false);
    });
});

describe("coerceStoreComponent — in-place schema change across the whole store", () => {
    it("converts the component in every archetype and adopts the new schema", () => {
        const store = Store.create({
            components: { hp: num, mana: num },
            resources: {},
            archetypes: { A: ["hp"], AB: ["hp", "mana"] },
        });
        const A = store.archetypes.A as any;
        const AB = store.archetypes.AB as any;
        const e0 = A.insert({ hp: 50 });
        const e1 = A.insert({ hp: 70000 });
        const e2 = AB.insert({ hp: 90000, mana: 5 });

        coerceStoreComponent(store, "hp", capped);

        // Every archetype's existing rows are clamped into the new range.
        expect(store.read(e0)).toEqual({ hp: 50 });
        expect(store.read(e1)).toEqual({ hp: 100 });
        expect(store.read(e2)).toEqual({ hp: 100, mana: 5 });

        // The store adopts the new schema; the untouched component is unchanged.
        expect((store.componentSchemas as Record<string, Schema>).hp).toBe(capped);
        expect((store.componentSchemas as Record<string, Schema>).mana).toBe(num);

        // Inserts now go through the new (integer-backed) storage: a fractional
        // value truncates, proving the column was actually re-typed.
        const e3 = A.insert({ hp: 42.9 });
        expect(store.read(e3)).toEqual({ hp: 42 });
    });

    it("throws when a column cannot be automatically converted", () => {
        const store = Store.create({ components: { hp: num }, resources: {}, archetypes: { A: ["hp"] } });
        (store.archetypes.A as any).insert({ hp: 1 });
        expect(() => coerceStoreComponent(store, "hp", vec2)).toThrow(/No automatic TypedBuffer conversion/);
    });
});
