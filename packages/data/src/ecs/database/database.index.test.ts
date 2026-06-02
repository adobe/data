// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";

// ============================================================================
// Catalogue pattern coverage — each describe corresponds to one of the 12
// patterns in `packages/data/src/ecs/README.md`. The tests assert runtime
// behavior. The type-level surface is covered by `index-api-proof.type-test.ts`
// and `database.index.type-test.ts`.
// ============================================================================

describe("Pattern 1 — single-column unique lookup (byEmail)", () => {
    const plugin = () => Database.Plugin.create({
        components: { email: { type: "string" } },
        archetypes: { User: ["email"] },
        indexes: {
            byEmail: { key: "email", unique: true },
        },
        transactions: {
            add: (t, email: string) => t.archetypes.User.insert({ email }),
        },
    });

    it("get returns the entity for a known scalar key", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add("alice@a.com");
        expect(db.indexes.byEmail.get("alice@a.com")).toBe(e);
    });

    it("get returns null for an unknown key (known absent)", () => {
        const db = Database.create(plugin());
        expect(db.indexes.byEmail.get("missing@x.com")).toBeNull();
    });

    it("duplicate insert throws atomically — original row stays intact", () => {
        const db = Database.create(plugin());
        const first = db.transactions.add("shared@x.com");
        expect(() => db.transactions.add("shared@x.com")).toThrow(/Unique index conflict/);
        expect(db.indexes.byEmail.get("shared@x.com")).toBe(first);
    });
});

describe("Pattern 2 — multi-column compound unique (playerSlot)", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            team: { type: "number" },
            position: { type: "string" },
            name: { type: "string" },
        },
        archetypes: { Player: ["team", "position", "name"] },
        indexes: {
            playerSlot: { key: ["team", "position"], unique: true },
        },
        transactions: {
            add: (t, args: { team: number; position: string; name: string }) =>
                t.archetypes.Player.insert(args),
        },
    });

    it("get takes the column-keyed object and returns the entity", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ team: 1, position: "qb", name: "alice" });
        expect(db.indexes.playerSlot.get({ team: 1, position: "qb" })).toBe(e);
        expect(db.indexes.playerSlot.get({ team: 1, position: "rb" })).toBeNull();
    });

    it("same component values in different teams do not collide", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ team: 1, position: "qb", name: "alice" });
        const b = db.transactions.add({ team: 2, position: "qb", name: "bob" });
        expect(db.indexes.playerSlot.get({ team: 1, position: "qb" })).toBe(a);
        expect(db.indexes.playerSlot.get({ team: 2, position: "qb" })).toBe(b);
    });
});

describe("Pattern 3 — non-unique by single column (childrenOf)", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            parent: { type: "number" },
            label: { type: "string" },
        },
        archetypes: { Child: ["parent", "label"] },
        indexes: {
            childrenOf: { key: "parent" },
        },
        transactions: {
            add: (t, args: { parent: number; label: string }) =>
                t.archetypes.Child.insert(args),
            delete: (t, e: number) => t.delete(e),
            move: (t, args: { entity: number; newParent: number }) =>
                t.update(args.entity, { parent: args.newParent }),
        },
    });

    it("find returns every entity sharing the key", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, label: "a" });
        const b = db.transactions.add({ parent: 7, label: "b" });
        db.transactions.add({ parent: 9, label: "c" });
        expect([...db.indexes.childrenOf.find(7)].sort()).toEqual([a, b].sort());
    });

    it("delete removes the entity from the bucket", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ parent: 7, label: "a" });
        expect(db.indexes.childrenOf.find(7)).toEqual([e]);
        db.transactions.delete(e);
        expect(db.indexes.childrenOf.find(7)).toEqual([]);
    });

    it("update moves the entity between buckets", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ parent: 7, label: "a" });
        db.transactions.move({ entity: e, newParent: 9 });
        expect(db.indexes.childrenOf.find(7)).toEqual([]);
        expect(db.indexes.childrenOf.find(9)).toEqual([e]);
    });

    it("`get` is absent on non-unique handles at runtime and types", () => {
        const db = Database.create(plugin());
        expect("get" in db.indexes.childrenOf).toBe(false);
    });
});

describe("Pattern 4 — sorted children (orderedChildrenOf)", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            parent: { type: "number" },
            fractIndex: { type: "string" },
        },
        archetypes: { Child: ["parent", "fractIndex"] },
        indexes: {
            orderedChildrenOf: {
                key: "parent",
                order: { by: ["fractIndex"] },
            },
        },
        transactions: {
            add: (t, args: { parent: number; fractIndex: string }) =>
                t.archetypes.Child.insert(args),
            move: (t, args: { entity: number; fractIndex: string }) =>
                t.update(args.entity, { fractIndex: args.fractIndex }),
            delete: (t, e: number) => t.delete(e),
        },
    });

    it("returns entities sorted by the order key (asc by default)", () => {
        const db = Database.create(plugin());
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        expect(db.indexes.orderedChildrenOf.find(7)).toEqual([a, b, c]);
    });

    it("update on the sort key repositions the entity in place", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });

        db.transactions.move({ entity: b, fractIndex: "z" });
        expect(db.indexes.orderedChildrenOf.find(7)).toEqual([a, c, b]);

        db.transactions.move({ entity: a, fractIndex: "d" });
        expect(db.indexes.orderedChildrenOf.find(7)).toEqual([c, a, b]);
    });

    it("delete preserves sort order of the remaining entities", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });
        db.transactions.delete(b);
        expect(db.indexes.orderedChildrenOf.find(7)).toEqual([a, c]);
    });

    it("populates and sorts when the index is registered after data exists", () => {
        const base = Database.Plugin.create({
            components: {
                parent: { type: "number" },
                fractIndex: { type: "string" },
            },
            archetypes: { Child: ["parent", "fractIndex"] },
            transactions: {
                add: (t, args: { parent: number; fractIndex: string }) =>
                    t.archetypes.Child.insert(args),
            },
        });
        const db = Database.create(base);
        const c = db.transactions.add({ parent: 5, fractIndex: "c" });
        const a = db.transactions.add({ parent: 5, fractIndex: "a" });
        const b = db.transactions.add({ parent: 5, fractIndex: "b" });

        const indexed = Database.Plugin.create({
            extends: base,
            indexes: {
                orderedChildrenOf: { key: "parent", order: { by: ["fractIndex"] } },
            },
        });
        const ext = db.extend(indexed);
        expect(ext.indexes.orderedChildrenOf.find(5)).toEqual([a, b, c]);
    });
});

describe("Pattern 5 — multi-value (array column → fan-out): tasksByAssignee", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            title: { type: "string" },
            assigned: { type: "array", items: { type: "string" } },
        },
        archetypes: { Task: ["title", "assigned"] },
        indexes: {
            tasksByAssignee: { key: "assigned" },
        },
        transactions: {
            add: (t, args: { title: string; assigned: readonly string[] }) =>
                t.archetypes.Task.insert(args),
            reassign: (t, args: { entity: number; assigned: readonly string[] }) =>
                t.update(args.entity, { assigned: args.assigned }),
            delete: (t, e: number) => t.delete(e),
        },
    });

    it("each array element becomes its own bucket entry", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ title: "ship", assigned: ["joe", "bob"] });
        expect(db.indexes.tasksByAssignee.find("joe")).toEqual([e]);
        expect(db.indexes.tasksByAssignee.find("bob")).toEqual([e]);
        expect(db.indexes.tasksByAssignee.find("carol")).toEqual([]);
    });

    it("multiple entities sharing an element are both returned", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ title: "A", assigned: ["joe", "bob"] });
        const b = db.transactions.add({ title: "B", assigned: ["joe", "carol"] });
        db.transactions.add({ title: "C", assigned: ["diane"] });
        expect([...db.indexes.tasksByAssignee.find("joe")].sort()).toEqual([a, b].sort());
    });

    it("empty array contributes no bucket entries", () => {
        const db = Database.create(plugin());
        db.transactions.add({ title: "Unassigned", assigned: [] });
        expect(db.indexes.tasksByAssignee.find("joe")).toEqual([]);
    });

    it("update set-diffs the bucket membership", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ title: "T", assigned: ["joe", "bob"] });
        db.transactions.reassign({ entity: e, assigned: ["joe", "carol"] });
        expect(db.indexes.tasksByAssignee.find("joe")).toEqual([e]);
        expect(db.indexes.tasksByAssignee.find("bob")).toEqual([]);
        expect(db.indexes.tasksByAssignee.find("carol")).toEqual([e]);
    });

    it("delete drops the entity from every bucket it was in", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ title: "T", assigned: ["joe", "bob"] });
        db.transactions.delete(e);
        expect(db.indexes.tasksByAssignee.find("joe")).toEqual([]);
        expect(db.indexes.tasksByAssignee.find("bob")).toEqual([]);
    });
});

describe("Pattern 6 — computed scalar (byEmailCi)", () => {
    const plugin = () => Database.Plugin.create({
        components: { email: { type: "string" } },
        archetypes: { User: ["email"] },
        indexes: {
            byEmailCi: { key: (email: string) => email.toLowerCase(), components: ["email"] },
        },
        transactions: {
            add: (t, email: string) => t.archetypes.User.insert({ email }),
            rename: (t, args: { entity: number; email: string }) =>
                t.update(args.entity, { email: args.email }),
            delete: (t, e: number) => t.delete(e),
        },
    });

    it("looks up by the computed (lowercased) key", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add("Alice@Example.com");
        expect(db.indexes.byEmailCi.find("alice@example.com")).toEqual([e]);
        // The original-case input is not a key.
        expect(db.indexes.byEmailCi.find("Alice@Example.com")).toEqual([]);
    });

    it("update re-derives the key", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add("alice@a.com");
        expect(db.indexes.byEmailCi.find("alice@a.com")).toEqual([e]);
        db.transactions.rename({ entity: e, email: "alice@b.com" });
        expect(db.indexes.byEmailCi.find("alice@a.com")).toEqual([]);
        expect(db.indexes.byEmailCi.find("alice@b.com")).toEqual([e]);
    });

    it("delete removes the computed bucket entry", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add("alice@a.com");
        db.transactions.delete(e);
        expect(db.indexes.byEmailCi.find("alice@a.com")).toEqual([]);
    });
});

describe("Pattern 7 — multi-value computed (docsByKeyword)", () => {
    const plugin = () => Database.Plugin.create({
        components: { body: { type: "string" } },
        archetypes: { Doc: ["body"] },
        indexes: {
            docsByKeyword: {
                key: (body: string) =>
                    body.toLowerCase().split(/\s+/).filter((s) => s.length > 0),
                components: ["body"],
            },
        },
        transactions: {
            add: (t, body: string) => t.archetypes.Doc.insert({ body }),
        },
    });

    it("fans out each computed array element into its own bucket", () => {
        const db = Database.create(plugin());
        const d = db.transactions.add("the quick brown fox");
        expect(db.indexes.docsByKeyword.find("quick")).toEqual([d]);
        expect(db.indexes.docsByKeyword.find("brown")).toEqual([d]);
        expect(db.indexes.docsByKeyword.find("missing")).toEqual([]);
    });

    it("findRange supports operator filters on the scalar element", () => {
        const db = Database.create(plugin());
        const d = db.transactions.add("alpha beta gamma");
        const inRange = [...db.indexes.docsByKeyword.findRange({ ">=": "b", "<": "z" })].sort();
        expect(inRange).toEqual([d]);
    });
});

describe("Pattern 8 — compound from nested data (playerByRoster)", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            roster: {
                type: "object",
                properties: {
                    team: { type: "number" },
                    position: { type: "string" },
                },
                required: ["team", "position"],
            },
            name: { type: "string" },
        },
        archetypes: { Player: ["roster", "name"] },
        indexes: {
            playerByRoster: {
                key: {
                    team: (r: { team: number; position: string }) => r.team,
                    position: (r: { team: number; position: string }) => r.position,
                },
                unique: true,
                components: ["roster"],
            },
        },
        transactions: {
            add: (
                t,
                args: { roster: { team: number; position: string }; name: string },
            ) => t.archetypes.Player.insert(args),
        },
    });

    it("get takes a slot-keyed object and returns the entity", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({
            roster: { team: 1, position: "qb" },
            name: "alice",
        });
        expect(db.indexes.playerByRoster.get({ team: 1, position: "qb" })).toBe(e);
        expect(db.indexes.playerByRoster.get({ team: 1, position: "rb" })).toBeNull();
    });
});

describe("Pattern 10 — mixed identity + derived slots (playerByTeamRole)", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            team: { type: "number" },
            roster: {
                type: "object",
                properties: { role: { type: "string" } },
                required: ["role"],
            },
            name: { type: "string" },
        },
        archetypes: { Player: ["team", "roster", "name"] },
        indexes: {
            playerByTeamRole: {
                key: {
                    team: "team",
                    role: (r: { role: string }) => r.role,
                },
                unique: true,
                components: ["roster"],
            },
        },
        transactions: {
            add: (
                t,
                args: { team: number; roster: { role: string }; name: string },
            ) => t.archetypes.Player.insert(args),
        },
    });

    it("identity-slot reads the column directly; derived-slot computes from nested data", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({
            team: 1,
            roster: { role: "qb" },
            name: "alice",
        });
        expect(db.indexes.playerByTeamRole.get({ team: 1, role: "qb" })).toBe(e);
        expect(db.indexes.playerByTeamRole.get({ team: 1, role: "rb" })).toBeNull();
        expect(db.indexes.playerByTeamRole.get({ team: 2, role: "qb" })).toBeNull();
    });
});

describe("Pattern 12 — custom comparator (tasksByPriority)", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            owner: { type: "number" },
            priority: { type: "number" },
            due: { type: "number" },
        },
        archetypes: { Task: ["owner", "priority", "due"] },
        indexes: {
            tasksByPriority: {
                key: "owner",
                order: {
                    by: ["priority", "due"],
                    // priority desc, due asc tie-breaker. `compare`'s `a` / `b`
                    // types are not contextually inferred today (the literal
                    // `by` tuple does not flow back into the method
                    // signature's `Pick<C, By[number]>`), so we annotate
                    // explicitly. The compiler still validates that the
                    // annotation is a subset of `Pick<C, By[number]>`.
                    compare: (
                        a: { priority: number; due: number },
                        b: { priority: number; due: number },
                    ) => b.priority - a.priority || a.due - b.due,
                },
            },
        },
        transactions: {
            add: (t, args: { owner: number; priority: number; due: number }) =>
                t.archetypes.Task.insert(args),
        },
    });

    it("applies the custom comparator within each bucket", () => {
        const db = Database.create(plugin());
        const e1 = db.transactions.add({ owner: 1, priority: 1, due: 100 });
        const e3 = db.transactions.add({ owner: 1, priority: 3, due: 50 });
        const e2a = db.transactions.add({ owner: 1, priority: 2, due: 10 });
        const e2b = db.transactions.add({ owner: 1, priority: 2, due: 20 });
        // Priority desc, then due asc.
        expect(db.indexes.tasksByPriority.find(1)).toEqual([e3, e2a, e2b, e1]);
    });
});

// ============================================================================
// Cross-cutting concerns
// ============================================================================

describe("findRange — operator filters on the bucket key", () => {
    it("filters by range operators on a tuple-keyed index", () => {
        const plugin = Database.Plugin.create({
            components: {
                name: { type: "string" },
                score: { type: "number" },
            },
            archetypes: { User: ["name", "score"] },
            indexes: {
                byNameScore: { key: ["name", "score"] },
            },
            transactions: {
                add: (t, args: { name: string; score: number }) =>
                    t.archetypes.User.insert(args),
            },
        });
        const db = Database.create(plugin);
        db.transactions.add({ name: "alice", score: 10 });
        const high = db.transactions.add({ name: "alice", score: 20 });
        const higher = db.transactions.add({ name: "alice", score: 50 });
        const hits = [...db.indexes.byNameScore.findRange({ score: { ">=": 20 } })].sort();
        expect(hits).toEqual([high, higher].sort());
    });
});

describe("auto-routing of db.select", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            name: { type: "string" },
            email: { type: "string" },
            active: { type: "boolean" },
        },
        archetypes: { User: ["name", "email", "active"] },
        indexes: {
            byName: { key: "name" },
        },
        transactions: {
            add: (t, args: { name: string; email: string; active: boolean }) =>
                t.archetypes.User.insert(args),
        },
    });

    it("routes pure equality where to a matching index", () => {
        const db = Database.create(plugin());
        const e1 = db.transactions.add({ name: "alice", email: "a@a.com", active: true });
        const e2 = db.transactions.add({ name: "alice", email: "a@b.com", active: true });
        db.transactions.add({ name: "bob", email: "b@a.com", active: true });

        const idx = db.indexes.byName as unknown as { find: (v: unknown) => readonly number[] };
        const original = idx.find;
        let calls = 0;
        idx.find = (v) => { calls += 1; return original(v); };
        try {
            const result = db.select(["name"], { where: { name: "alice" } });
            expect([...result].sort()).toEqual([e1, e2].sort());
            expect(calls).toBe(1);
        } finally {
            idx.find = original;
        }
    });

    it("falls back to scan when where keys don't match any index", () => {
        const db = Database.create(plugin());
        db.transactions.add({ name: "alice", email: "a@a.com", active: true });
        db.transactions.add({ name: "alice", email: "a@b.com", active: false });
        const result = db.select(["active"], { where: { active: false } });
        expect(result).toHaveLength(1);
    });

    it("falls back to scan for a non-equality operator (>= on indexed col)", () => {
        const db = Database.create(plugin());
        db.transactions.add({ name: "alice", email: "a@a.com", active: true });
        db.transactions.add({ name: "bob", email: "b@a.com", active: true });

        const idx = db.indexes.byName as unknown as { find: (v: unknown) => readonly number[] };
        const original = idx.find;
        let calls = 0;
        idx.find = (v) => { calls += 1; return original(v); };
        try {
            const result = db.select(["name"], { where: { name: { ">=": "b" } } });
            expect(result).toHaveLength(1);
            expect(calls).toBe(0);
        } finally {
            idx.find = original;
        }
    });

    it("does not auto-route to a computed (function-key) or slot-map index", () => {
        const computedPlugin = Database.Plugin.create({
            components: { name: { type: "string" } },
            archetypes: { U: ["name"] },
            indexes: {
                byLowerName: {
                    key: (name: string) => name.toLowerCase(),
                    components: ["name"],
                },
            },
            transactions: {
                add: (t, name: string) => t.archetypes.U.insert({ name }),
            },
        });
        const db = Database.create(computedPlugin);
        db.transactions.add("Alice");

        const idx = db.indexes.byLowerName as unknown as { find: (v: unknown) => readonly number[] };
        const original = idx.find;
        let calls = 0;
        idx.find = (v) => { calls += 1; return original(v); };
        try {
            // Raw-where equality is in source-column space, not derived-key space.
            const result = db.select(["name"], { where: { name: "Alice" } });
            expect(result).toHaveLength(1);
            expect(calls).toBe(0);
        } finally {
            idx.find = original;
        }
    });
});

describe("auto-routing of db.observe.select", () => {
    const plugin = () => Database.Plugin.create({
        components: { name: { type: "string" } },
        archetypes: { U: ["name"] },
        indexes: {
            byName: { key: "name" },
        },
        transactions: {
            add: (t, name: string) => t.archetypes.U.insert({ name }),
        },
    });

    it("routes the initial snapshot through the index", () => {
        const db = Database.create(plugin());
        const e1 = db.transactions.add("alice");
        const e2 = db.transactions.add("alice");
        db.transactions.add("bob");

        const idx = db.indexes.byName as unknown as { find: (v: unknown) => readonly number[] };
        const original = idx.find;
        let calls = 0;
        idx.find = (v) => { calls += 1; return original(v); };
        try {
            let emitted: readonly number[] = [];
            const unsub = db.observe.select(["name"], { where: { name: "alice" } })(
                (entities) => { emitted = entities; },
            );
            expect([...emitted].sort()).toEqual([e1, e2].sort());
            expect(calls).toBe(1);
            unsub();
        } finally {
            idx.find = original;
        }
    });

    it("routes the requery after a relevant transaction", async () => {
        const db = Database.create(plugin());
        const e1 = db.transactions.add("alice");
        db.transactions.add("bob");

        const idx = db.indexes.byName as unknown as { find: (v: unknown) => readonly number[] };
        const original = idx.find;
        let calls = 0;
        idx.find = (v) => { calls += 1; return original(v); };
        try {
            const emissions: number[][] = [];
            const unsub = db.observe.select(["name"], { where: { name: "alice" } })(
                (entities) => { emissions.push([...entities]); },
            );
            expect(calls).toBe(1);
            const e3 = db.transactions.add("alice");
            await Promise.resolve();
            expect(calls).toBe(2);
            expect([...emissions[emissions.length - 1]].sort()).toEqual([e1, e3].sort());
            unsub();
        } finally {
            idx.find = original;
        }
    });
});

describe("t.indexes — eager maintenance inside transactions", () => {
    const plugin = () => Database.Plugin.create({
        components: {
            name: { type: "string" },
            email: { type: "string" },
        },
        archetypes: { User: ["name", "email"] },
        indexes: {
            byName: { key: "name" },
            uniqueByEmail: { key: "email", unique: true },
        },
        transactions: {
            add: (t, args: { name: string; email: string }) =>
                t.archetypes.User.insert(args),
            addIfNew: (t, args: { name: string; email: string }) => {
                const existing = t.indexes.uniqueByEmail.get(args.email);
                if (existing !== null) return existing;
                return t.archetypes.User.insert(args);
            },
            renameAndLookup: (t, args: { entity: number; newName: string }) => {
                t.update(args.entity, { name: args.newName });
                const found = t.indexes.byName.find(args.newName);
                if (!found.includes(args.entity)) {
                    throw new Error("name index stale after t.update");
                }
            },
            deleteAndLookup: (t, args: { entity: number; name: string }) => {
                t.delete(args.entity);
                const stillThere = t.indexes.byName.find(args.name);
                if (stillThere.includes(args.entity)) {
                    throw new Error("index still references deleted entity");
                }
            },
            updateEmail: (t, args: { entity: number; newEmail: string }) =>
                t.update(args.entity, { email: args.newEmail }),
        },
    });

    it("get on a unique index sees a row inserted earlier in the same transaction", () => {
        const db = Database.create(plugin());
        const e = db.transactions.addIfNew({ name: "alice", email: "a@a.com" });
        // A second call finds the just-inserted row.
        const same = db.transactions.addIfNew({ name: "alice2", email: "a@a.com" });
        expect(same).toBe(e);
    });

    it("find sees an update made earlier in the same transaction body", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ name: "alice", email: "a@a.com" });
        expect(() => db.transactions.renameAndLookup({ entity: e, newName: "alex" })).not.toThrow();
        expect(db.indexes.byName.find("alex")).toEqual([e]);
        expect(db.indexes.byName.find("alice")).toEqual([]);
    });

    it("find does not see a row deleted earlier in the same transaction body", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ name: "alice", email: "a@a.com" });
        expect(() => db.transactions.deleteAndLookup({ entity: e, name: "alice" })).not.toThrow();
        expect(db.indexes.byName.find("alice")).toEqual([]);
    });

    it("unique conflict on insert is caught up-front — no partial store or index mutation", () => {
        const db = Database.create(plugin());
        const first = db.transactions.add({ name: "alice", email: "shared@x.com" });
        // Snapshot pre-throw state so we can assert no drift.
        const beforeRows = db.select(["email"]);
        expect(() =>
            db.transactions.add({ name: "alex", email: "shared@x.com" }),
        ).toThrow(/Unique index conflict/);

        // The unique-key bucket still points at the original entity.
        expect(db.indexes.uniqueByEmail.get("shared@x.com")).toBe(first);
        // No phantom row landed in either index or store. byName.find("alex")
        // returning [] proves the secondary index never saw the row;
        // db.select asserts the store itself never grew.
        expect(db.indexes.byName.find("alex")).toEqual([]);
        const afterRows = db.select(["email"]);
        expect([...afterRows].sort()).toEqual([...beforeRows].sort());
    });

    it("unique conflict on update is caught up-front — both stores stay consistent", () => {
        const db = Database.create(plugin());
        const e1 = db.transactions.add({ name: "alice", email: "a@a.com" });
        const e2 = db.transactions.add({ name: "bob", email: "b@b.com" });
        // Snapshot pre-throw state.
        const e1BeforeRead = db.read(e1);
        const e2BeforeRead = db.read(e2);

        expect(() =>
            db.transactions.updateEmail({ entity: e1, newEmail: "b@b.com" }),
        ).toThrow(/Unique index conflict/);

        // Index untouched on both keys.
        expect(db.indexes.uniqueByEmail.get("a@a.com")).toBe(e1);
        expect(db.indexes.uniqueByEmail.get("b@b.com")).toBe(e2);
        // Underlying store untouched — e1's email is still "a@a.com",
        // proving the pre-check fired before `core.update` ran.
        expect(db.read(e1)).toEqual(e1BeforeRead);
        expect(db.read(e2)).toEqual(e2BeforeRead);
    });
});

describe("registration rules", () => {
    it("extending twice with the same plugin instance is a no-op", () => {
        const plugin = Database.Plugin.create({
            components: { name: { type: "string" } },
            archetypes: { N: ["name"] },
            indexes: { byName: { key: "name" } },
            transactions: { add: (t, name: string) => t.archetypes.N.insert({ name }) },
        });
        const db = Database.create(plugin);
        expect(() => db.extend(plugin)).not.toThrow();
        expect(Object.keys(db.indexes)).toEqual(["byName"]);
    });

    it("combining plugins via Plugin.combine with a shared index decl registers once", () => {
        const components = { email: { type: "string" } as const } as const;
        const shared = { key: "email" as const, unique: true } as const;
        const a = Database.Plugin.create({ components, indexes: { byEmail: shared } });
        const b = Database.Plugin.create({ components, indexes: { byEmail: shared } });
        const combined = Database.Plugin.combine(a, b);
        const db = Database.create(combined);
        expect(Object.keys(db.indexes)).toEqual(["byEmail"]);
    });

    it("distinct names with distinct shapes both register", () => {
        const plugin = Database.Plugin.create({
            components: {
                name: { type: "string" },
                email: { type: "string" },
            },
            indexes: {
                byName: { key: "name" },
                byEmail: { key: "email" },
            },
        });
        const db = Database.create(plugin);
        expect(Object.keys(db.indexes).sort()).toEqual(["byEmail", "byName"]);
    });

    it("same name with different declaration objects across plugins throws", () => {
        const components = { email: { type: "string" } as const } as const;
        const a = Database.Plugin.create({
            components,
            indexes: { byEmail: { key: "email", unique: true } },
        });
        const b = Database.Plugin.create({
            components,
            // Structurally identical, but a different object identity.
            indexes: { byEmail: { key: "email", unique: true } },
        });
        const db = Database.create(a);
        expect(() => db.extend(b)).toThrow(/different declaration object/);
    });

    it("different names with identical shape across plugins throws", () => {
        const components = { email: { type: "string" } as const } as const;
        const a = Database.Plugin.create({
            components,
            indexes: { byEmail: { key: "email", unique: true } },
        });
        const b = Database.Plugin.create({
            components,
            indexes: { lookupByEmail: { key: "email", unique: true } },
        });
        const db = Database.create(a);
        expect(() => db.extend(b)).toThrow(/identical shape/);
    });

    it("identical shape inside a single plugin throws", () => {
        const plugin = Database.Plugin.create({
            components: { email: { type: "string" } },
            indexes: {
                byEmail: { key: "email", unique: true },
                lookupByEmail: { key: "email", unique: true },
            },
        });
        expect(() => Database.create(plugin)).toThrow(/identical shape/);
    });

    it("same key tuple with different `unique` flag is NOT a structural duplicate", () => {
        const plugin = Database.Plugin.create({
            components: { email: { type: "string" } },
            indexes: {
                byEmailLookup: { key: "email" },
                uniqueByEmail: { key: "email", unique: true },
            },
        });
        const db = Database.create(plugin);
        expect(Object.keys(db.indexes).sort()).toEqual(["byEmailLookup", "uniqueByEmail"]);
    });
});

describe("registry maintenance", () => {
    it("populates from existing entities when a plugin registers an index later", () => {
        const base = Database.Plugin.create({
            components: { name: { type: "string" } },
            archetypes: { N: ["name"] },
            transactions: { add: (t, name: string) => t.archetypes.N.insert({ name }) },
        });
        const indexed = Database.Plugin.create({
            extends: base,
            indexes: { byName: { key: "name" } },
        });

        const db = Database.create(base);
        const e1 = db.transactions.add("alice");
        const e2 = db.transactions.add("alice");

        const ext = db.extend(indexed);
        expect([...ext.indexes.byName.find("alice")].sort()).toEqual([e1, e2].sort());
    });
});
