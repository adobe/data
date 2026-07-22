// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Database } from "../database.js";

describe("Database.components / resources / archetypes", () => {
    const s: Schema = { type: "number" };
    // Typed with a `default` in its type (not just `Schema`) so it qualifies as
    // a ResourceSchema — resources typed as bare `Schema` are rejected by design.
    const r = { type: "boolean", default: false } as const satisfies Schema;

    it("components stamps each scope's flags and merges the groups", () => {
        const c = Database.components({
            document: { a: s },
            settings: { b: s },
            presence: { c: s },
            session: { d: s },
        });
        expect(Object.keys(c)).toEqual(["a", "b", "c", "d"]);
        expect(c.a).toMatchObject({ type: "number" }); // document: no flags
        expect(c.b).toMatchObject({ nonShared: true });
        expect(c.b.nonPersistent).toBeUndefined();
        expect(c.c).toMatchObject({ nonPersistent: true });
        expect(c.c.nonShared).toBeUndefined();
        expect(c.d).toMatchObject({ nonPersistent: true, nonShared: true });
    });

    it("omitted scopes default to empty — a document-only feature needs just one key", () => {
        const c = Database.components({ document: { a: s } });
        expect(Object.keys(c)).toEqual(["a"]);
        expect(c.a).toMatchObject({ type: "number" });
        expect(c.a).not.toHaveProperty("nonShared");
    });

    it("does not mutate the input schemas", () => {
        const doc = { a: s };
        Database.components({ document: doc, settings: {}, presence: {}, session: {} });
        expect(doc.a).toBe(s);
        expect(s).not.toHaveProperty("nonShared");
    });

    it("resources requires a default (and applies scope flags)", () => {
        const res = Database.resources({
            document: {},
            settings: { flag: r },
            presence: {},
            session: {},
        });
        expect(res.flag).toMatchObject({ default: false, nonShared: true });
    });

    it("archetypes validates keys against components and preserves tuples", () => {
        const components = Database.components({
            document: { mark: s, index: s },
            settings: {}, presence: {}, session: {},
        });
        const a = Database.archetypes(components, { PlacedMark: ["mark", "index"] });
        expect(a.PlacedMark).toEqual(["mark", "index"]);
    });
});
