// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { Schema } from "../../schema/index.js";
import { Database } from "./database.js";

describe("Database.scope", () => {
    const s: Schema = { type: "number" };

    it("session stamps both flags", () => {
        expect(Database.scope.session({ x: s }).x).toMatchObject({
            type: "number",
            nonPersistent: true,
            nonShared: true,
        });
    });

    it("settings stamps nonShared only (durable, local)", () => {
        const r = Database.scope.settings({ x: s }).x;
        expect(r.nonShared).toBe(true);
        expect(r.nonPersistent).toBeUndefined();
    });

    it("presence stamps nonPersistent only (ephemeral, shared)", () => {
        const r = Database.scope.presence({ x: s }).x;
        expect(r.nonPersistent).toBe(true);
        expect(r.nonShared).toBeUndefined();
    });

    it("document is identity — same map and same schema references (dedupe-safe)", () => {
        const map = { x: s };
        expect(Database.scope.document(map)).toBe(map);
        expect(Database.scope.document(map).x).toBe(s);
    });

    it("preserves keys and does not mutate the input", () => {
        const map: Record<string, Schema> = { a: s, b: { type: "string" } };
        const out = Database.scope.session(map);
        expect(Object.keys(out)).toEqual(["a", "b"]);
        expect(map.a).toBe(s); // input schema untouched
        expect(map.a).not.toHaveProperty("nonShared");
    });
});
