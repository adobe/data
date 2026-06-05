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
        expect(db.indexes.byEmail.get({ email: "alice@a.com" })).toBe(e);
    });

    it("get returns null for an unknown key (known absent)", () => {
        const db = Database.create(plugin());
        expect(db.indexes.byEmail.get({ email: "missing@x.com" })).toBeNull();
    });

    it("duplicate insert throws atomically — original row stays intact", () => {
        const db = Database.create(plugin());
        const first = db.transactions.add("shared@x.com");
        expect(() => db.transactions.add("shared@x.com")).toThrow(/Unique index conflict/);
        expect(db.indexes.byEmail.get({ email: "shared@x.com" })).toBe(first);
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
        expect([...db.indexes.childrenOf.find({ parent: 7 })].sort()).toEqual([a, b].sort());
    });

    it("delete removes the entity from the bucket", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ parent: 7, label: "a" });
        expect(db.indexes.childrenOf.find({ parent: 7 })).toEqual([e]);
        db.transactions.delete(e);
        expect(db.indexes.childrenOf.find({ parent: 7 })).toEqual([]);
    });

    it("update moves the entity between buckets", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ parent: 7, label: "a" });
        db.transactions.move({ entity: e, newParent: 9 });
        expect(db.indexes.childrenOf.find({ parent: 7 })).toEqual([]);
        expect(db.indexes.childrenOf.find({ parent: 9 })).toEqual([e]);
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
        expect(db.indexes.orderedChildrenOf.find({ parent: 7 })).toEqual([a, b, c]);
    });

    it("update on the sort key repositions the entity in place", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });

        db.transactions.move({ entity: b, fractIndex: "z" });
        expect(db.indexes.orderedChildrenOf.find({ parent: 7 })).toEqual([a, c, b]);

        db.transactions.move({ entity: a, fractIndex: "d" });
        expect(db.indexes.orderedChildrenOf.find({ parent: 7 })).toEqual([c, a, b]);
    });

    it("delete preserves sort order of the remaining entities", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });
        db.transactions.delete(b);
        expect(db.indexes.orderedChildrenOf.find({ parent: 7 })).toEqual([a, c]);
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
        expect(ext.indexes.orderedChildrenOf.find({ parent: 5 })).toEqual([a, b, c]);
    });
});

describe("Pattern 4 — observe(arg): reactive sorted bucket view", () => {
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
            reparent: (t, args: { entity: number; parent: number }) =>
                t.update(args.entity, { parent: args.parent }),
            delete: (t, e: number) => t.delete(e),
        },
    });

    it("emits the initial sorted list synchronously on subscribe", () => {
        const db = Database.create(plugin());
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (entities) => { emissions.push([...entities]); },
        );
        expect(emissions).toEqual([[a, b, c]]);
        unsub();
    });

    it("emits the re-sorted list when an entity is inserted into the bucket", async () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (entities) => { emissions.push([...entities]); },
        );
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        await Promise.resolve();

        expect(emissions[0]).toEqual([a, c]);
        expect(emissions[emissions.length - 1]).toEqual([a, b, c]);
        unsub();
    });

    it("emits a reorder when only the sort key changes (regression case)", async () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (entities) => { emissions.push([...entities]); },
        );
        expect(emissions[0]).toEqual([a, b, c]);

        // Reorder-only transaction: parent (the bucket key) is untouched, so a
        // `where`-only observe.select would never see this. The index does.
        db.transactions.move({ entity: b, fractIndex: "z" });
        await Promise.resolve();
        expect(emissions[emissions.length - 1]).toEqual([a, c, b]);
        unsub();
    });

    it("emits the shrunken list when an entity is deleted from the bucket", async () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (entities) => { emissions.push([...entities]); },
        );
        db.transactions.delete(b);
        await Promise.resolve();

        expect(emissions[emissions.length - 1]).toEqual([a]);
        unsub();
    });

    it("does NOT emit when an unrelated bucket's entity changes", async () => {
        const db = Database.create(plugin());
        db.transactions.add({ parent: 7, fractIndex: "a" });
        const other = db.transactions.add({ parent: 9, fractIndex: "a" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (entities) => { emissions.push([...entities]); },
        );
        expect(emissions).toHaveLength(1);

        // A child of a *different* parent moves. Same component (`fractIndex`)
        // changes, so the observer is woken and recomputes — but its own
        // bucket is unchanged, so no second emission.
        db.transactions.move({ entity: other, fractIndex: "z" });
        await Promise.resolve();
        expect(emissions).toHaveLength(1);
        unsub();
    });

    it("emits on both buckets when an entity reparents between them", async () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });
        const m = db.transactions.add({ parent: 7, fractIndex: "b" });

        const fromSeven: number[][] = [];
        const toNine: number[][] = [];
        const unsub7 = db.indexes.orderedChildrenOf.observe({ parent: 7 })((e) => fromSeven.push([...e]));
        const unsub9 = db.indexes.orderedChildrenOf.observe({ parent: 9 })((e) => toNine.push([...e]));

        db.transactions.reparent({ entity: m, parent: 9 });
        await Promise.resolve();

        expect(fromSeven[fromSeven.length - 1]).toEqual([a]);
        expect(toNine[toNine.length - 1]).toEqual([m]);
        unsub7();
        unsub9();
    });

    it("unsubscribe stops further emissions", async () => {
        const db = Database.create(plugin());
        db.transactions.add({ parent: 7, fractIndex: "a" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (entities) => { emissions.push([...entities]); },
        );
        expect(emissions).toHaveLength(1);
        unsub();

        db.transactions.add({ parent: 7, fractIndex: "b" });
        await Promise.resolve();
        expect(emissions).toHaveLength(1);
    });
});

describe("observe(arg) — additional edge cases", () => {
    const sortedPlugin = () => Database.Plugin.create({
        components: {
            parent: { type: "number" },
            fractIndex: { type: "string" },
        },
        archetypes: { Child: ["parent", "fractIndex"] },
        indexes: {
            orderedChildrenOf: { key: "parent", order: { by: ["fractIndex"] } },
            childrenOf: { key: "parent" },
        },
        transactions: {
            add: (t, args: { parent: number; fractIndex: string }) =>
                t.archetypes.Child.insert(args),
            move: (t, args: { entity: number; fractIndex: string }) =>
                t.update(args.entity, { fractIndex: args.fractIndex }),
            delete: (t, e: number) => t.delete(e),
        },
    });

    it("emits [] for an initially-empty bucket, then the entity once populated", async () => {
        const db = Database.create(sortedPlugin());
        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 42 })(
            (e) => emissions.push([...e]),
        );
        expect(emissions).toEqual([[]]);

        const e = db.transactions.add({ parent: 42, fractIndex: "a" });
        await Promise.resolve();
        expect(emissions[emissions.length - 1]).toEqual([e]);
        unsub();
    });

    it("emits [] when the last entity leaves the bucket", async () => {
        const db = Database.create(sortedPlugin());
        const only = db.transactions.add({ parent: 7, fractIndex: "a" });
        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (e) => emissions.push([...e]),
        );
        db.transactions.delete(only);
        await Promise.resolve();
        expect(emissions[emissions.length - 1]).toEqual([]);
        unsub();
    });

    it("notifies every subscriber of the same bucket", async () => {
        const db = Database.create(sortedPlugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });

        const first: number[][] = [];
        const second: number[][] = [];
        const unsub1 = db.indexes.orderedChildrenOf.observe({ parent: 7 })((e) => first.push([...e]));
        const unsub2 = db.indexes.orderedChildrenOf.observe({ parent: 7 })((e) => second.push([...e]));

        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        await Promise.resolve();

        expect(first[first.length - 1]).toEqual([a, b]);
        expect(second[second.length - 1]).toEqual([a, b]);
        unsub1();
        unsub2();
    });

    it("coalesces several transactions before the microtask into one emission", async () => {
        const db = Database.create(sortedPlugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (e) => emissions.push([...e]),
        );
        // Three synchronous transactions, no awaits in between.
        const c = db.transactions.add({ parent: 7, fractIndex: "c" });
        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        db.transactions.move({ entity: c, fractIndex: "d" });
        await Promise.resolve();

        // Initial emit + exactly one coalesced emit reflecting the final state.
        expect(emissions).toHaveLength(2);
        expect(emissions[1]).toEqual([a, b, c]);
        unsub();
    });

    it("does not re-emit when a touched bucket ends a transaction unchanged", async () => {
        const db = Database.create(sortedPlugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });

        const emissions: number[][] = [];
        const unsub = db.indexes.orderedChildrenOf.observe({ parent: 7 })(
            (e) => emissions.push([...e]),
        );
        // Move the only child to a new sort key and back within the same
        // microtask window: the bucket is woken but its final sequence is
        // identical, so no second emission.
        db.transactions.move({ entity: a, fractIndex: "z" });
        db.transactions.move({ entity: a, fractIndex: "a" });
        await Promise.resolve();
        expect(emissions).toHaveLength(1);
        unsub();
    });

    it("works on a non-sorted index — membership changes still emit", async () => {
        const db = Database.create(sortedPlugin());
        const a = db.transactions.add({ parent: 7, fractIndex: "a" });

        const emissions: number[][] = [];
        const unsub = db.indexes.childrenOf.observe({ parent: 7 })(
            (e) => emissions.push([...e].sort()),
        );
        expect(emissions[0]).toEqual([a]);

        const b = db.transactions.add({ parent: 7, fractIndex: "b" });
        await Promise.resolve();
        expect(emissions[emissions.length - 1]).toEqual([a, b].sort());
        unsub();
    });

    const priorityPlugin = () => Database.Plugin.create({
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
            setPriority: (t, args: { entity: number; priority: number }) =>
                t.update(args.entity, { priority: args.priority }),
            setDue: (t, args: { entity: number; due: number }) =>
                t.update(args.entity, { due: args.due }),
        },
    });

    it("re-sorts under a custom comparator when the primary sort key changes", async () => {
        const db = Database.create(priorityPlugin());
        const low = db.transactions.add({ owner: 1, priority: 1, due: 100 });
        const high = db.transactions.add({ owner: 1, priority: 3, due: 50 });

        const emissions: number[][] = [];
        const unsub = db.indexes.tasksByPriority.observe({ owner: 1 })(
            (e) => emissions.push([...e]),
        );
        // priority desc → [high, low].
        expect(emissions[0]).toEqual([high, low]);

        db.transactions.setPriority({ entity: low, priority: 5 });
        await Promise.resolve();
        expect(emissions[emissions.length - 1]).toEqual([low, high]);
        unsub();
    });

    it("re-sorts when only the secondary (tie-break) sort component changes", async () => {
        const db = Database.create(priorityPlugin());
        // Equal priority → ordered by `due` asc.
        const early = db.transactions.add({ owner: 1, priority: 2, due: 10 });
        const late = db.transactions.add({ owner: 1, priority: 2, due: 20 });

        const emissions: number[][] = [];
        const unsub = db.indexes.tasksByPriority.observe({ owner: 1 })(
            (e) => emissions.push([...e]),
        );
        expect(emissions[0]).toEqual([early, late]);

        // Push `early`'s due past `late`'s — flips the tie-break order.
        db.transactions.setDue({ entity: early, due: 30 });
        await Promise.resolve();
        expect(emissions[emissions.length - 1]).toEqual([late, early]);
        unsub();
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
        expect(db.indexes.tasksByAssignee.find({ assigned: "joe" })).toEqual([e]);
        expect(db.indexes.tasksByAssignee.find({ assigned: "bob" })).toEqual([e]);
        expect(db.indexes.tasksByAssignee.find({ assigned: "carol" })).toEqual([]);
    });

    it("multiple entities sharing an element are both returned", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ title: "A", assigned: ["joe", "bob"] });
        const b = db.transactions.add({ title: "B", assigned: ["joe", "carol"] });
        db.transactions.add({ title: "C", assigned: ["diane"] });
        expect([...db.indexes.tasksByAssignee.find({ assigned: "joe" })].sort()).toEqual([a, b].sort());
    });

    it("empty array contributes no bucket entries", () => {
        const db = Database.create(plugin());
        db.transactions.add({ title: "Unassigned", assigned: [] });
        expect(db.indexes.tasksByAssignee.find({ assigned: "joe" })).toEqual([]);
    });

    it("update set-diffs the bucket membership", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ title: "T", assigned: ["joe", "bob"] });
        db.transactions.reassign({ entity: e, assigned: ["joe", "carol"] });
        expect(db.indexes.tasksByAssignee.find({ assigned: "joe" })).toEqual([e]);
        expect(db.indexes.tasksByAssignee.find({ assigned: "bob" })).toEqual([]);
        expect(db.indexes.tasksByAssignee.find({ assigned: "carol" })).toEqual([e]);
    });

    it("delete drops the entity from every bucket it was in", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ title: "T", assigned: ["joe", "bob"] });
        db.transactions.delete(e);
        expect(db.indexes.tasksByAssignee.find({ assigned: "joe" })).toEqual([]);
        expect(db.indexes.tasksByAssignee.find({ assigned: "bob" })).toEqual([]);
    });
});

describe("Pattern 6 — computed scalar (byEmailCi)", () => {
    const plugin = () => Database.Plugin.create({
        components: { email: { type: "string" } },
        archetypes: { User: ["email"] },
        indexes: {
            byEmailCi: { key: { email: (c) => c.email!.toLowerCase() }, components: ["email"] },
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
        expect(db.indexes.byEmailCi.find({ email: "alice@example.com" })).toEqual([e]);
        // The original-case input is not a key.
        expect(db.indexes.byEmailCi.find({ email: "Alice@Example.com" })).toEqual([]);
    });

    it("update re-derives the key", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add("alice@a.com");
        expect(db.indexes.byEmailCi.find({ email: "alice@a.com" })).toEqual([e]);
        db.transactions.rename({ entity: e, email: "alice@b.com" });
        expect(db.indexes.byEmailCi.find({ email: "alice@a.com" })).toEqual([]);
        expect(db.indexes.byEmailCi.find({ email: "alice@b.com" })).toEqual([e]);
    });

    it("delete removes the computed bucket entry", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add("alice@a.com");
        db.transactions.delete(e);
        expect(db.indexes.byEmailCi.find({ email: "alice@a.com" })).toEqual([]);
    });
});

describe("Pattern 7 — multi-value computed (docsByKeyword)", () => {
    const plugin = () => Database.Plugin.create({
        components: { body: { type: "string" } },
        archetypes: { Doc: ["body"] },
        indexes: {
            docsByKeyword: {
                key: {
                    keyword: (c) =>
                        c.body!.toLowerCase().split(/\s+/).filter((s) => s.length > 0),
                },
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
        expect(db.indexes.docsByKeyword.find({ keyword: "quick" })).toEqual([d]);
        expect(db.indexes.docsByKeyword.find({ keyword: "brown" })).toEqual([d]);
        expect(db.indexes.docsByKeyword.find({ keyword: "missing" })).toEqual([]);
    });

    it("findRange supports operator filters on the scalar element", () => {
        const db = Database.create(plugin());
        const d = db.transactions.add("alpha beta gamma");
        const inRange = [...db.indexes.docsByKeyword.findRange({ keyword: { ">=": "b", "<": "z" } })].sort();
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
                    team: (c) => c.roster!.team,
                    position: (c) => c.roster!.position,
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
                    role: (c) => c.roster!.role,
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
        expect(db.indexes.tasksByPriority.find({ owner: 1 })).toEqual([e3, e2a, e2b, e1]);
    });
});

// ============================================================================
// Cross-cutting concerns
// ============================================================================

describe("string ordering is by code point, never locale", () => {
    const plugin = () => Database.Plugin.create({
        components: { group: { type: "number" }, label: { type: "string" } },
        archetypes: { Row: ["group", "label"] },
        indexes: { byGroupSorted: { key: "group", order: { by: ["label"] } } },
        transactions: {
            add: (t, a: { group: number; label: string }) => t.archetypes.Row.insert(a),
        },
    });

    it("default comparator sorts strings by ASCII code point (uppercase before lowercase)", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ group: 1, label: "a" });    // 'a' = 97
        const Z = db.transactions.add({ group: 1, label: "Z" });    // 'Z' = 90
        const zero = db.transactions.add({ group: 1, label: "0" }); // '0' = 48
        const A = db.transactions.add({ group: 1, label: "A" });    // 'A' = 65
        // Code point: '0' < 'A' < 'Z' < 'a'. A locale-aware comparator would
        // interleave case (lowercase 'a' before 'Z'), so this fails if the
        // index ever sorts via localeCompare — the no-locale guard.
        expect(db.indexes.byGroupSorted.find({ group: 1 })).toEqual([zero, A, Z, a]);
    });
});

describe("archetype-scoped index", () => {
    // Task and Note both have `parent`; the index is scoped to Task only.
    const plugin = () => Database.Plugin.create({
        components: {
            parent: { type: "number" },
            priority: { type: "number" },
            body: { type: "string" },
        },
        archetypes: {
            Task: ["parent", "priority"],
            Note: ["parent", "body"],
        },
        indexes: {
            tasksByParent: { key: "parent", archetype: "Task" },
        },
        transactions: {
            addTask: (t, a: { parent: number; priority: number }) => t.archetypes.Task.insert(a),
            addNote: (t, a: { parent: number; body: string }) => t.archetypes.Note.insert(a),
            delete: (t, e: number) => t.delete(e),
        },
    });

    it("indexes only the scoped archetype, excluding others that share the key column", () => {
        const db = Database.create(plugin());
        const t1 = db.transactions.addTask({ parent: 7, priority: 1 });
        const t2 = db.transactions.addTask({ parent: 7, priority: 2 });
        db.transactions.addNote({ parent: 7, body: "shares parent 7 but is a Note" });

        // Without scoping the Note (parent === 7) would appear here too.
        expect([...db.indexes.tasksByParent.find({ parent: 7 })].sort()).toEqual([t1, t2].sort());
    });

    it("seeds from only the scoped archetype when registered after data exists", () => {
        const base = Database.Plugin.create({
            components: {
                parent: { type: "number" },
                priority: { type: "number" },
                body: { type: "string" },
            },
            archetypes: { Task: ["parent", "priority"], Note: ["parent", "body"] },
            transactions: {
                addTask: (t, a: { parent: number; priority: number }) => t.archetypes.Task.insert(a),
                addNote: (t, a: { parent: number; body: string }) => t.archetypes.Note.insert(a),
            },
        });
        const db = Database.create(base);
        const t = db.transactions.addTask({ parent: 5, priority: 1 });
        db.transactions.addNote({ parent: 5, body: "note" });

        const ext = db.extend(Database.Plugin.create({
            extends: base,
            indexes: { tasksByParent: { key: "parent", archetype: "Task" } },
        }));
        expect(ext.indexes.tasksByParent.find({ parent: 5 })).toEqual([t]);
    });

    it("throws when scoped to an unknown archetype", () => {
        const bad = Database.Plugin.create({
            components: { parent: { type: "number" } },
            archetypes: { Task: ["parent"] },
            // `archetype` typed loosely here via `as any` to reach the runtime guard.
            indexes: { x: { key: "parent", archetype: "Nonexistent" as any } },
        });
        expect(() => Database.create(bad)).toThrow(/unknown archetype/i);
    });
});

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
                    key: { name: (c) => c.name!.toLowerCase() },
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

describe("auto-routing of ordered select through a sorted index", () => {
    // Two indexes on the same key, distinct shapes: one unsorted, one sorted
    // ascending by `priority` (default comparator). An ordered query must route
    // to the *sorted* one (never the unsorted one), and a query whose order the
    // index can't serve must fall back to the scan.
    const plugin = () => Database.Plugin.create({
        components: {
            owner: { type: "number" },
            priority: { type: "number" },
            due: { type: "number" },
            title: { type: "string" },
        },
        archetypes: { Task: ["owner", "priority", "due", "title"] },
        indexes: {
            byOwner: { key: "owner" },
            byOwnerSorted: { key: "owner", order: { by: ["priority"] } },
        },
        transactions: {
            add: (t, a: { owner: number; priority: number; due: number; title: string }) =>
                t.archetypes.Task.insert(a),
        },
    });

    const spyFind = (handle: any) => {
        const original = handle.find;
        const state = { calls: 0 };
        handle.find = (v: unknown) => { state.calls += 1; return original(v); };
        return { state, restore: () => { handle.find = original; } };
    };

    const seed = (db: Database.FromPlugin<ReturnType<typeof plugin>>) => {
        const mid = db.transactions.add({ owner: 1, priority: 2, due: 10, title: "mid" });
        const low = db.transactions.add({ owner: 1, priority: 1, due: 20, title: "low" });
        const high = db.transactions.add({ owner: 1, priority: 3, due: 30, title: "high" });
        db.transactions.add({ owner: 2, priority: 1, due: 40, title: "other" });
        return { low, mid, high };
    };

    it("routes an ascending ordered query to the sorted index (and returns it sorted)", () => {
        const db = Database.create(plugin());
        const { low, mid, high } = seed(db);

        const sorted = spyFind((db.indexes as any).byOwnerSorted);
        try {
            const result = db.select(["owner", "priority"], { where: { owner: 1 }, order: { priority: true } });
            // GREEN: the ordered query was served by the sorted index...
            expect(sorted.state.calls).toBe(1);
            // ...and the result is in the index's ascending priority order.
            expect([...result]).toEqual([low, mid, high]);
        } finally {
            sorted.restore();
        }
    });

    it("routes the ordered query to the sorted index, never the unsorted one on the same key", () => {
        const db = Database.create(plugin());
        seed(db);

        const unsorted = spyFind((db.indexes as any).byOwner);
        const sorted = spyFind((db.indexes as any).byOwnerSorted);
        try {
            db.select(["owner", "priority"], { where: { owner: 1 }, order: { priority: true } });
            expect(sorted.state.calls).toBe(1);
            expect(unsorted.state.calls).toBe(0);
        } finally {
            unsorted.restore();
            sorted.restore();
        }
    });

    it("falls back to scan for a descending order (sorted index only materializes ascending)", () => {
        const db = Database.create(plugin());
        const { low, mid, high } = seed(db);

        const sorted = spyFind((db.indexes as any).byOwnerSorted);
        try {
            const result = db.select(["owner", "priority"], { where: { owner: 1 }, order: { priority: false } });
            // Not routed — the index can't serve descending without re-sorting.
            expect(sorted.state.calls).toBe(0);
            // The scan still produces a correct descending result.
            expect([...result]).toEqual([high, mid, low]);
        } finally {
            sorted.restore();
        }
    });

    it("falls back to scan when the requested order column is not the index's sort column", () => {
        const db = Database.create(plugin());
        seed(db);

        const sorted = spyFind((db.indexes as any).byOwnerSorted);
        try {
            // Index sorts by `priority`; this asks for `due`.
            const result = db.select(["owner", "due"], { where: { owner: 1 }, order: { due: true } });
            expect(sorted.state.calls).toBe(0);
            expect(result).toHaveLength(3);
        } finally {
            sorted.restore();
        }
    });

    it("still routes a plain (no-order) equality query — unaffected by the order support", () => {
        const db = Database.create(plugin());
        seed(db);

        // No order: the first matching key index (byOwner) serves it.
        const unsorted = spyFind((db.indexes as any).byOwner);
        try {
            const result = db.select(["owner"], { where: { owner: 1 } });
            expect(unsorted.state.calls).toBe(1);
            expect(result).toHaveLength(3);
        } finally {
            unsorted.restore();
        }
    });

    it("routes the ordered query through db.observe.select too (initial snapshot + requery)", async () => {
        const db = Database.create(plugin());
        const { low, mid, high } = seed(db);

        const sorted = spyFind((db.indexes as any).byOwnerSorted);
        try {
            const emissions: number[][] = [];
            const unsub = db.observe.select(["owner", "priority"], { where: { owner: 1 }, order: { priority: true } })(
                (entities) => { emissions.push([...entities]); },
            );
            // Initial snapshot routed and sorted.
            expect(sorted.state.calls).toBe(1);
            expect(emissions[0]).toEqual([low, mid, high]);

            // A new task for owner 1 with the lowest priority sorts to the front.
            const lowest = db.transactions.add({ owner: 1, priority: 0, due: 5, title: "lowest" });
            await Promise.resolve();
            expect(sorted.state.calls).toBe(2);
            expect(emissions[emissions.length - 1]).toEqual([lowest, low, mid, high]);
            unsub();
        } finally {
            sorted.restore();
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
                const existing = t.indexes.uniqueByEmail.get({ email: args.email });
                if (existing !== null) return existing;
                return t.archetypes.User.insert(args);
            },
            renameAndLookup: (t, args: { entity: number; newName: string }) => {
                t.update(args.entity, { name: args.newName });
                const found = t.indexes.byName.find({ name: args.newName });
                if (!found.includes(args.entity)) {
                    throw new Error("name index stale after t.update");
                }
            },
            deleteAndLookup: (t, args: { entity: number; name: string }) => {
                t.delete(args.entity);
                const stillThere = t.indexes.byName.find({ name: args.name });
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
        expect(db.indexes.byName.find({ name: "alex" })).toEqual([e]);
        expect(db.indexes.byName.find({ name: "alice" })).toEqual([]);
    });

    it("find does not see a row deleted earlier in the same transaction body", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ name: "alice", email: "a@a.com" });
        expect(() => db.transactions.deleteAndLookup({ entity: e, name: "alice" })).not.toThrow();
        expect(db.indexes.byName.find({ name: "alice" })).toEqual([]);
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
        expect(db.indexes.uniqueByEmail.get({ email: "shared@x.com" })).toBe(first);
        // No phantom row landed in either index or store. byName.find("alex")
        // returning [] proves the secondary index never saw the row;
        // db.select asserts the store itself never grew.
        expect(db.indexes.byName.find({ name: "alex" })).toEqual([]);
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
        expect(db.indexes.uniqueByEmail.get({ email: "a@a.com" })).toBe(e1);
        expect(db.indexes.uniqueByEmail.get({ email: "b@b.com" })).toBe(e2);
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
        expect([...ext.indexes.byName.find({ name: "alice" })].sort()).toEqual([e1, e2].sort());
    });
});
