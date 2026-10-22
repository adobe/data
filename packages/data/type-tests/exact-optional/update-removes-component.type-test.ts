// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "../../src/ecs/index.js";

/**
 * Compile-time tests under `exactOptionalPropertyTypes`: `update(entity, { c: undefined })`
 * removes component `c`, so it must type-check without a cast even when `c` is required.
 */

const db = Database.create(Database.Plugin.create({
    components: {
        parent: { type: "number" },
        label: { type: "string" },
    },
    archetypes: {
        Child: ["parent", "label"],
    },
    transactions: {
        sever(t, entity: number) {
            t.update(entity, { parent: undefined });
        },
        relabel(t, { entity, label }: { entity: number; label: string }) {
            t.update(entity, { label });
            // @ts-expect-error a removal does not widen the value type
            t.update(entity, { label: 1 });
        },
    },
}));

db.transactions.sever(0);
