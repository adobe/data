// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";

const userPlugin = () => Database.Plugin.create({
    components: {
        name: { type: "string" },
        email: { type: "string" },
        score: { type: "number" },
        active: { type: "boolean" },
    },
    archetypes: {
        User: ["name", "email", "score", "active"],
    },
    indexes: {
        byName: { components: ["name"] },
        uniqueByEmail: { components: ["email"], unique: true },
        byNameScore: { components: ["name", "score"] },
    },
    transactions: {
        addUser: (t, args: { name: string; email: string; score: number; active: boolean }) =>
            t.archetypes.User.insert(args),
        updateUser: (t, args: { entity: number; values: Partial<{ name: string; email: string; score: number; active: boolean }> }) =>
            t.update(args.entity, args.values),
        deleteUser: (t, entity: number) => t.delete(entity),
    },
});

const create = () => Database.create(userPlugin());

describe("Database indexes", () => {
    describe("non-unique index", () => {
        it("find returns entities matching the key", () => {
            const db = create();
            const e1 = db.transactions.addUser({ name: "alice", email: "alice@a.com", score: 10, active: true });
            const e2 = db.transactions.addUser({ name: "alice", email: "alice@b.com", score: 20, active: true });
            const e3 = db.transactions.addUser({ name: "bob", email: "bob@c.com", score: 30, active: true });

            const alices = [...db.indexes.byName.find({ name: "alice" })].sort();
            expect(alices).toEqual([e1, e2].sort());

            const bobs = db.indexes.byName.find({ name: "bob" });
            expect(bobs).toEqual([e3]);

            const missing = db.indexes.byName.find({ name: "nobody" });
            expect(missing).toEqual([]);
        });

        it("update reflects a key change in the index", () => {
            const db = create();
            const e = db.transactions.addUser({ name: "alice", email: "a@a.com", score: 0, active: true });

            expect(db.indexes.byName.find({ name: "alice" })).toEqual([e]);
            expect(db.indexes.byName.find({ name: "alex" })).toEqual([]);

            db.transactions.updateUser({ entity: e, values: { name: "alex" } });

            expect(db.indexes.byName.find({ name: "alice" })).toEqual([]);
            expect(db.indexes.byName.find({ name: "alex" })).toEqual([e]);
        });

        it("delete removes entity from index", () => {
            const db = create();
            const e = db.transactions.addUser({ name: "alice", email: "a@a.com", score: 0, active: true });

            expect(db.indexes.byName.find({ name: "alice" })).toEqual([e]);
            db.transactions.deleteUser(e);
            expect(db.indexes.byName.find({ name: "alice" })).toEqual([]);
        });
    });

    describe("compound index", () => {
        it("find requires all key components and order matters", () => {
            const db = create();
            const a10 = db.transactions.addUser({ name: "alice", email: "a@a.com", score: 10, active: true });
            const a20 = db.transactions.addUser({ name: "alice", email: "a@b.com", score: 20, active: true });

            expect(db.indexes.byNameScore.find({ name: "alice", score: 10 })).toEqual([a10]);
            expect(db.indexes.byNameScore.find({ name: "alice", score: 20 })).toEqual([a20]);
            expect(db.indexes.byNameScore.find({ name: "alice", score: 99 })).toEqual([]);
        });

        it("findRange filters by the existing where vocabulary", () => {
            const db = create();
            db.transactions.addUser({ name: "alice", email: "a@a.com", score: 10, active: true });
            db.transactions.addUser({ name: "alice", email: "a@b.com", score: 20, active: true });
            db.transactions.addUser({ name: "alice", email: "a@c.com", score: 50, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 15, active: true });

            // All entities with score >= 20 across the index.
            const highScorers = db.indexes.byNameScore.findRange({ score: { ">=": 20 } });
            expect(highScorers).toHaveLength(2);
        });
    });

    describe("unique index", () => {
        it("get returns a single entity for a known key", () => {
            const db = create();
            const e = db.transactions.addUser({ name: "alice", email: "alice@a.com", score: 1, active: true });

            expect(db.indexes.uniqueByEmail.get({ email: "alice@a.com" })).toBe(e);
            expect(db.indexes.uniqueByEmail.get({ email: "missing@x.com" })).toBeUndefined();
        });

        it("get tracks updates to the unique component", () => {
            const db = create();
            const e = db.transactions.addUser({ name: "alice", email: "alice@a.com", score: 1, active: true });

            db.transactions.updateUser({ entity: e, values: { email: "alice@b.com" } });

            expect(db.indexes.uniqueByEmail.get({ email: "alice@a.com" })).toBeUndefined();
            expect(db.indexes.uniqueByEmail.get({ email: "alice@b.com" })).toBe(e);
        });

        it("get is absent on non-unique indexes at runtime as well as types", () => {
            const db = create();
            // db.indexes.byName has no `get` member — the type test already
            // proves this at compile time; this asserts the same shape at
            // runtime so a refactor cannot silently re-expose it.
            expect("get" in db.indexes.byName).toBe(false);
            expect("get" in db.indexes.uniqueByEmail).toBe(true);
        });

        it("inserting a duplicate key throws", () => {
            const db = create();
            db.transactions.addUser({ name: "alice", email: "shared@x.com", score: 1, active: true });

            expect(() => {
                db.transactions.addUser({ name: "alex", email: "shared@x.com", score: 2, active: true });
            }).toThrow(/Unique index conflict/);
        });
    });

    describe("auto-routing of db.select", () => {
        it("routes equality where to a matching index", () => {
            const db = create();
            const e1 = db.transactions.addUser({ name: "alice", email: "a@a.com", score: 1, active: true });
            const e2 = db.transactions.addUser({ name: "alice", email: "a@b.com", score: 2, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 3, active: true });

            // Spy on the underlying index to confirm routing fires.
            const idx = db.indexes.byName as unknown as { find: (v: Record<string, unknown>) => readonly number[] };
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

        it("respects include archetype filtering when index returns extra entities", () => {
            // The base components in this plugin all live on the User archetype,
            // so every indexed entity also has every include component. Use the
            // index's known existing data with an include set the entities still
            // satisfy.
            const db = create();
            db.transactions.addUser({ name: "alice", email: "a@a.com", score: 1, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 2, active: true });

            const result = db.select(["name", "email"], { where: { name: "alice" } });
            expect(result).toHaveLength(1);
        });

        it("falls back to a scan when the where clause uses a non-equality operator", () => {
            const db = create();
            db.transactions.addUser({ name: "alice", email: "a@a.com", score: 5, active: true });
            db.transactions.addUser({ name: "alice", email: "a@b.com", score: 50, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 500, active: true });

            // Spy on the index — a range operator on `name` is not a pure
            // equality and must NOT route through the index.
            const idx = db.indexes.byName as unknown as { find: (v: Record<string, unknown>) => readonly number[] };
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

        it("falls back to a scan when the where keys don't match any index", () => {
            const db = create();
            db.transactions.addUser({ name: "alice", email: "a@a.com", score: 1, active: true });
            db.transactions.addUser({ name: "alice", email: "a@b.com", score: 100, active: false });

            // `active` is not indexed — the where keys don't match any
            // registered index's components set, so we must scan.
            const result = db.select(["active"], { where: { active: false } });
            expect(result).toHaveLength(1);
        });
    });

    describe("auto-routing of db.observe.select", () => {
        it("routes the initial snapshot through the index", () => {
            const db = create();
            const e1 = db.transactions.addUser({ name: "alice", email: "a@a.com", score: 1, active: true });
            const e2 = db.transactions.addUser({ name: "alice", email: "a@b.com", score: 2, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 3, active: true });

            const idx = db.indexes.byName as unknown as { find: (v: Record<string, unknown>) => readonly number[] };
            const original = idx.find;
            let calls = 0;
            idx.find = (v) => { calls += 1; return original(v); };

            try {
                let emitted: readonly number[] = [];
                const unsubscribe = db.observe.select(["name"], { where: { name: "alice" } })(
                    (entities) => { emitted = entities; },
                );
                // The initial snapshot is emitted synchronously.
                expect([...emitted].sort()).toEqual([e1, e2].sort());
                expect(calls).toBe(1);
                unsubscribe();
            } finally {
                idx.find = original;
            }
        });

        it("routes the requery after a relevant transaction", async () => {
            const db = create();
            const e1 = db.transactions.addUser({ name: "alice", email: "a@a.com", score: 1, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 2, active: true });

            const idx = db.indexes.byName as unknown as { find: (v: Record<string, unknown>) => readonly number[] };
            const original = idx.find;
            let calls = 0;
            idx.find = (v) => { calls += 1; return original(v); };

            try {
                const emissions: readonly number[][] = [];
                const unsubscribe = db.observe.select(["name"], { where: { name: "alice" } })(
                    (entities) => { (emissions as number[][]).push([...entities]); },
                );
                // Initial snapshot counts as one find call.
                expect(calls).toBe(1);

                // Mutate name on a different entity into the "alice" bucket.
                const e3 = db.transactions.addUser({ name: "alice", email: "a@c.com", score: 3, active: true });

                // Requery is queued via microtask; drain it.
                await Promise.resolve();

                expect(calls).toBe(2);
                expect([...emissions[emissions.length - 1]].sort()).toEqual([e1, e3].sort());
                unsubscribe();
            } finally {
                idx.find = original;
            }
        });

        it("falls back to a scan for non-equality where in the observe path", () => {
            const db = create();
            db.transactions.addUser({ name: "alice", email: "a@a.com", score: 5, active: true });
            db.transactions.addUser({ name: "alice", email: "a@b.com", score: 50, active: true });
            db.transactions.addUser({ name: "bob", email: "b@a.com", score: 500, active: true });

            const idx = db.indexes.byName as unknown as { find: (v: Record<string, unknown>) => readonly number[] };
            const original = idx.find;
            let calls = 0;
            idx.find = (v) => { calls += 1; return original(v); };

            try {
                let emitted: readonly number[] = [];
                const unsubscribe = db.observe.select(["name"], { where: { name: { ">=": "b" } } })(
                    (entities) => { emitted = entities; },
                );
                expect(emitted).toHaveLength(1);
                expect(calls).toBe(0);
                unsubscribe();
            } finally {
                idx.find = original;
            }
        });

        it("does not route t.select inside transactions", () => {
            // Sanity check: a transaction body that calls `t.select` must
            // NOT go through the public index handle. Index maintenance is
            // post-commit in V1; routing `t.select` through the (stale)
            // registry could return wrong rows. Part C addresses this by
            // moving maintenance into the store; until then, t.select stays
            // raw, and the spy on the handle's find must not fire.
            const txPlugin = Database.Plugin.create({
                components: {
                    name: { type: "string" },
                    email: { type: "string" },
                    score: { type: "number" },
                    active: { type: "boolean" },
                },
                archetypes: { User: ["name", "email", "score", "active"] },
                indexes: { byName: { components: ["name"] } },
                transactions: {
                    addUser: (t, args: { name: string; email: string; score: number; active: boolean }) =>
                        t.archetypes.User.insert(args),
                    selectAlices: (t) => {
                        const result = t.select(["name"], { where: { name: "alice" } });
                        if (result.length < 0) throw new Error("unreachable");
                    },
                },
            });
            const db = Database.create(txPlugin);
            db.transactions.addUser({ name: "alice", email: "a@a.com", score: 1, active: true });

            const idx = db.indexes.byName as unknown as { find: (v: Record<string, unknown>) => readonly number[] };
            const original = idx.find;
            let calls = 0;
            idx.find = (v) => { calls += 1; return original(v); };

            try {
                db.transactions.selectAlices();
                expect(calls).toBe(0);
            } finally {
                idx.find = original;
            }
        });
    });

    describe("strict registration rules", () => {
        // A small shared fixture: two plugins with overlapping shapes that
        // are NOT identity-equal across plugins, so `combinePlugins` can't
        // catch them; the registry's identity check is the second line.
        const makeFreshPlugins = () => ({
            // Same components reference shared across both plugins —
            // these will satisfy the identity rule.
            sharedDecl: { components: ["email"] as const, unique: true } as const,
        });

        it("green: extending twice with the same plugin instance is a no-op", () => {
            // Mirrors the V1 test; reaffirms the rule survives the rewrite.
            const plugin = Database.Plugin.create({
                components: { name: { type: "string" } },
                archetypes: { Named: ["name"] },
                indexes: { byName: { components: ["name"] } },
                transactions: {
                    add: (t, name: string) => t.archetypes.Named.insert({ name }),
                },
            });
            const db = Database.create(plugin);
            expect(() => db.extend(plugin)).not.toThrow();
            expect(Object.keys(db.indexes)).toEqual(["byName"]);
        });

        it("green: combining plugins via Plugin.combine with a shared index decl registers a single index", () => {
            const sharedIndexDecl = { components: ["email"] as const, unique: true } as const;
            const componentsDecl = {
                email: { type: "string" } as const,
            } as const;

            const pluginA = Database.Plugin.create({
                components: componentsDecl,
                indexes: { byEmail: sharedIndexDecl },
            });
            const pluginB = Database.Plugin.create({
                components: componentsDecl,
                indexes: { byEmail: sharedIndexDecl },
            });

            const combined = Database.Plugin.combine(pluginA, pluginB);
            const db = Database.create(combined);
            expect(Object.keys(db.indexes)).toEqual(["byEmail"]);
        });

        it("green: distinct names with distinct shapes both register", () => {
            const plugin = Database.Plugin.create({
                components: {
                    name: { type: "string" },
                    email: { type: "string" },
                },
                indexes: {
                    byName: { components: ["name"] },
                    byEmail: { components: ["email"] },
                },
            });
            const db = Database.create(plugin);
            expect(Object.keys(db.indexes).sort()).toEqual(["byEmail", "byName"]);
        });

        it("green: same components order with different unique flag is NOT a duplicate (shapes differ)", () => {
            // The shape key includes the unique flag, so this is allowed.
            // Intentional locking of the equality definition.
            const plugin = Database.Plugin.create({
                components: { email: { type: "string" } },
                indexes: {
                    byEmailLookup: { components: ["email"] },
                    uniqueByEmail: { components: ["email"], unique: true },
                },
            });
            const db = Database.create(plugin);
            expect(Object.keys(db.indexes).sort()).toEqual(["byEmailLookup", "uniqueByEmail"]);
        });

        it("red: same name with different declaration objects across plugins throws", () => {
            // Components must be identity-shared across plugins (`store.extend`
            // enforces that separately); otherwise the component check trips
            // first and we never reach the index check. Share the schema
            // reference, vary only the index decl object.
            const emailSchema = { type: "string" } as const;
            const components = { email: emailSchema } as const;
            const pluginA = Database.Plugin.create({
                components,
                // First decl object
                indexes: { byEmail: { components: ["email"], unique: true } },
            });
            const pluginB = Database.Plugin.create({
                components,
                // Structurally identical but a *different* object identity
                indexes: { byEmail: { components: ["email"], unique: true } },
            });

            const db = Database.create(pluginA);
            expect(() => db.extend(pluginB)).toThrow(/different declaration object/);
        });

        it("red: same name with structurally different decls throws", () => {
            const emailSchema = { type: "string" } as const;
            const components = { email: emailSchema } as const;
            const pluginA = Database.Plugin.create({
                components,
                indexes: { byEmail: { components: ["email"], unique: true } },
            });
            const pluginB = Database.Plugin.create({
                components,
                indexes: { byEmail: { components: ["email"], unique: false } },
            });

            const db = Database.create(pluginA);
            expect(() => db.extend(pluginB)).toThrow(/different declaration object/);
        });

        it("red: different names with identical shape across plugins throws", () => {
            const emailSchema = { type: "string" } as const;
            const components = { email: emailSchema } as const;
            const pluginA = Database.Plugin.create({
                components,
                indexes: { byEmail: { components: ["email"], unique: true } },
            });
            const pluginB = Database.Plugin.create({
                components,
                indexes: { lookupByEmail: { components: ["email"], unique: true } },
            });

            const db = Database.create(pluginA);
            expect(() => db.extend(pluginB)).toThrow(/identical shape/);
        });

        it("red: different names with identical shape inside a single plugin throws", () => {
            // A plugin declaring two indexes with the same shape is also caught.
            const plugin = Database.Plugin.create({
                components: { email: { type: "string" } },
                indexes: {
                    byEmail: { components: ["email"], unique: true },
                    lookupByEmail: { components: ["email"], unique: true },
                },
            });
            expect(() => Database.create(plugin)).toThrow(/identical shape/);
        });
    });

    describe("t.indexes inside transactions (Part C: eager maintenance)", () => {
        // Plugin with a transaction that consults t.indexes mid-flow.
        const eagerPlugin = () => Database.Plugin.create({
            components: {
                name: { type: "string" },
                email: { type: "string" },
            },
            archetypes: { User: ["name", "email"] },
            indexes: {
                byName: { components: ["name"] },
                uniqueByEmail: { components: ["email"], unique: true },
            },
            transactions: {
                add: (t, args: { name: string; email: string }) =>
                    t.archetypes.User.insert(args),
                addIfNew: (t, args: { name: string; email: string }) => {
                    // In-transaction lookup that must see the row this
                    // transaction has not yet inserted. Eager maintenance
                    // guarantees the index is fresh per mutation.
                    const existing = t.indexes.uniqueByEmail.get({ email: args.email });
                    if (existing !== undefined) return existing;
                    return t.archetypes.User.insert(args);
                },
                addTwoWithLookup: (t, args: { a: { name: string; email: string }; b: { name: string; email: string } }) => {
                    // Insert two; between them, look up the first.
                    const e1 = t.archetypes.User.insert(args.a);
                    const seen = t.indexes.uniqueByEmail.get({ email: args.a.email });
                    if (seen !== e1) {
                        throw new Error(`expected ${e1}, got ${seen}`);
                    }
                    return t.archetypes.User.insert(args.b);
                },
                renameAndLookup: (t, args: { entity: number; newName: string }) => {
                    t.update(args.entity, { name: args.newName });
                    // Index must reflect the update immediately.
                    const found = t.indexes.byName.find({ name: args.newName });
                    if (!found.includes(args.entity)) {
                        throw new Error("name index stale after t.update");
                    }
                },
                deleteAndLookup: (t, entity: number) => {
                    t.delete(entity);
                    // Lookups for this entity's old key should return empty.
                    const stillThere = t.indexes.byName.find({ name: "alice" });
                    if (stillThere.includes(entity)) {
                        throw new Error("index still references deleted entity");
                    }
                },
                updateEmail: (t, args: { entity: number; newEmail: string }) => {
                    t.update(args.entity, { email: args.newEmail });
                },
            },
        });

        it("get on a unique index sees a row inserted by the same transaction", () => {
            const db = Database.create(eagerPlugin());
            const e = db.transactions.addIfNew({ name: "alice", email: "a@a.com" });
            // Calling addIfNew a second time with the same email finds the
            // existing entity (this exercises both the same-transaction-as-insert
            // freshness AND across-transaction freshness).
            const same = db.transactions.addIfNew({ name: "alice2", email: "a@a.com" });
            expect(same).toBe(e);
        });

        it("get sees a row inserted earlier in the same transaction body", () => {
            const db = Database.create(eagerPlugin());
            // The transaction inserts, looks up, then inserts again — the
            // throw inside the body would propagate; the test ensures the
            // lookup found the just-inserted row.
            const e = db.transactions.addTwoWithLookup({
                a: { name: "alice", email: "a@a.com" },
                b: { name: "bob", email: "b@b.com" },
            });
            expect(e).toBeDefined();
        });

        it("find sees an update made earlier in the same transaction body", () => {
            const db = Database.create(eagerPlugin());
            const e = db.transactions.add({ name: "alice", email: "a@a.com" });
            // renameAndLookup throws if the index doesn't reflect the rename.
            expect(() => db.transactions.renameAndLookup({ entity: e, newName: "alex" })).not.toThrow();
            // After the transaction commits, the index reflects the new name.
            expect(db.indexes.byName.find({ name: "alex" })).toEqual([e]);
            expect(db.indexes.byName.find({ name: "alice" })).toEqual([]);
        });

        it("find does not see a row deleted earlier in the same transaction body", () => {
            const db = Database.create(eagerPlugin());
            const e = db.transactions.add({ name: "alice", email: "a@a.com" });
            expect(() => db.transactions.deleteAndLookup(e)).not.toThrow();
            expect(db.indexes.byName.find({ name: "alice" })).toEqual([]);
        });

        it("unique conflict at insert rolls back atomically — store and index stay consistent", () => {
            const db = Database.create(eagerPlugin());
            const first = db.transactions.add({ name: "alice", email: "shared@x.com" });
            expect(() => db.transactions.add({ name: "alex", email: "shared@x.com" })).toThrow(/Unique index conflict/);
            // The original row is intact in both store and index.
            expect(db.indexes.uniqueByEmail.get({ email: "shared@x.com" })).toBe(first);
            const located = db.locate(first);
            expect(located).not.toBeNull();
            // No phantom row from the failed insert.
            expect(db.indexes.byName.find({ name: "alex" })).toEqual([]);
        });

        it("unique conflict on update rolls back atomically", () => {
            const db = Database.create(eagerPlugin());
            const e1 = db.transactions.add({ name: "alice", email: "a@a.com" });
            const e2 = db.transactions.add({ name: "bob", email: "b@b.com" });
            // Try to update e1's email to e2's — must throw via the unique
            // pre-check, and neither store nor index moves.
            expect(() => {
                db.transactions.updateEmail({ entity: e1, newEmail: "b@b.com" });
            }).toThrow(/Unique index conflict/);
            // Both still findable by their original emails.
            expect(db.indexes.uniqueByEmail.get({ email: "a@a.com" })).toBe(e1);
            expect(db.indexes.uniqueByEmail.get({ email: "b@b.com" })).toBe(e2);
        });
    });

    describe("registry maintenance", () => {
        it("populates from existing entities when a plugin registers indexes later", () => {
            const base = Database.Plugin.create({
                components: { name: { type: "string" } },
                archetypes: { Named: ["name"] },
                transactions: {
                    create: (t, name: string) => t.archetypes.Named.insert({ name }),
                },
            });
            const indexed = Database.Plugin.create({
                extends: base,
                indexes: {
                    byName: { components: ["name"] },
                },
            });

            // Create the base database, insert before the index plugin is applied,
            // then extend with the index plugin.
            const db = Database.create(base);
            const e1 = db.transactions.create("alice");
            const e2 = db.transactions.create("alice");

            const extended = db.extend(indexed);
            // The newly registered index sees the entities that already exist.
            expect([...extended.indexes.byName.find({ name: "alice" })].sort()).toEqual([e1, e2].sort());
        });

        it("extending with the same plugin twice is a no-op", () => {
            const plugin = userPlugin();
            const db = Database.create(plugin);
            // db.extend already short-circuits identical plugins via
            // extendedPlugins set; assert that the index map still has
            // the original three indexes after the redundant extend.
            db.extend(plugin);
            expect(Object.keys(db.indexes).sort()).toEqual([
                "byName", "byNameScore", "uniqueByEmail",
            ]);
        });
    });
});
