// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Store } from "./index.js";
import type { Schema } from "../../schema/index.js";

const f32 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
const health = { type: "object", properties: { current: f32, max: f32 } } as const satisfies Schema;

describe("Store.remapComponent — manual (non-auto) in-place change", () => {
    it("rebuilds a component from number → object across all rows, keeping insert working", () => {
        const store = Store.create({ components: { hp: f32 }, resources: {}, archetypes: { A: ["hp"] } });
        const A = store.archetypes.A as any;
        const e0 = A.insert({ hp: 80 });
        const e1 = A.insert({ hp: 30 });

        Store.remapComponent(store, "hp", health, (old: number) => ({ current: old, max: old }));

        expect(store.read(e0)).toEqual({ hp: { current: 80, max: 80 } });
        expect(store.read(e1)).toEqual({ hp: { current: 30, max: 30 } });
        expect((store.componentSchemas as Record<string, Schema>).hp).toBe(health);

        // Insert AFTER the remap writes through the rebuilt (object) column.
        const e2 = A.insert({ hp: { current: 5, max: 9 } });
        expect(store.read(e2)).toEqual({ hp: { current: 5, max: 9 } });
    });
});

describe("in-place resource coercion keeps the resource accessor live", () => {
    it("coercing a resource's schema does not stale store.resources.<name>", () => {
        const store = Store.create({
            components: {},
            resources: { level: { type: "number", precision: 1, default: 1 } },
            archetypes: {},
        });
        expect(store.resources.level).toBe(1);

        // Auto-convertible change (gain a cap) → coerces the singleton's column in place.
        Store.coerceComponent(store, "level", { type: "number", precision: 1, default: 1, maximum: 10 });

        expect(store.resources.level).toBe(1); // read still resolves to the new buffer
        (store.resources as { level: number }).level = 5; // write through the accessor
        expect(store.resources.level).toBe(5);
    });
});
