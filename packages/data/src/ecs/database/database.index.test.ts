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

    describe("computed indexes", () => {
        const computedPlugin = () => Database.Plugin.create({
            components: {
                firstName: { type: "string" },
                lastName: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
            },
            archetypes: {
                Person: ["firstName", "lastName"],
                Point: ["x", "y"],
            },
            indexes: {
                // Non-unique computed (lowercase last name).
                byLowerLast: {
                    components: ["lastName"],
                    compute: (last: string) => last.toLowerCase(),
                },
                // Unique computed compound key.
                uniqueByFullName: {
                    components: ["firstName", "lastName"],
                    compute: (first: string, last: string) =>
                        `${first} ${last}`.toLowerCase(),
                    unique: true,
                },
                // Computed numeric key — quadrant from (x, y).
                byQuadrant: {
                    components: ["x", "y"],
                    compute: (x: number, y: number) =>
                        (x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0),
                },
            },
            transactions: {
                addPerson: (t, args: { firstName: string; lastName: string }) =>
                    t.archetypes.Person.insert(args),
                renamePerson: (t, args: { entity: number; firstName?: string; lastName?: string }) => {
                    const { entity, ...patch } = args;
                    t.update(entity, patch);
                },
                deletePerson: (t, entity: number) => t.delete(entity),
                addPoint: (t, args: { x: number; y: number }) =>
                    t.archetypes.Point.insert(args),
            },
        });

        it("derives the lookup key via compute on insert", () => {
            const db = Database.create(computedPlugin());
            const e = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });

            // Looking up by the computed (lowercased) key works.
            expect(db.indexes.byLowerLast.find("smith")).toEqual([e]);
            // Original-case value is NOT a key — only the computed one is.
            expect(db.indexes.byLowerLast.find("Smith")).toEqual([]);
        });

        it("returns multiple entities for a non-unique computed key", () => {
            const db = Database.create(computedPlugin());
            const a = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });
            const b = db.transactions.addPerson({ firstName: "Bob", lastName: "SMITH" });
            db.transactions.addPerson({ firstName: "Carol", lastName: "Jones" });

            const smiths = [...db.indexes.byLowerLast.find("smith")].sort();
            expect(smiths).toEqual([a, b].sort());
        });

        it("unique computed index exposes get and returns Entity | undefined", () => {
            const db = Database.create(computedPlugin());
            const e = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });

            expect(db.indexes.uniqueByFullName.get("alice smith")).toBe(e);
            expect(db.indexes.uniqueByFullName.get("missing person")).toBeUndefined();
        });

        it("update re-derives the key when component values change", () => {
            const db = Database.create(computedPlugin());
            const e = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });
            expect(db.indexes.byLowerLast.find("smith")).toEqual([e]);

            db.transactions.renamePerson({ entity: e, lastName: "Jones" });

            expect(db.indexes.byLowerLast.find("smith")).toEqual([]);
            expect(db.indexes.byLowerLast.find("jones")).toEqual([e]);
        });

        it("update is a no-op when the derived key stays the same", () => {
            // Two different inputs that map to the same computed key —
            // changing one component shouldn't bounce the entity out of
            // the bucket if the derived key is unchanged.
            const db = Database.create(computedPlugin());
            const e = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });

            // Renaming firstName doesn't affect byLowerLast (which only
            // indexes lastName), so the derived key for byLowerLast is
            // unchanged.
            db.transactions.renamePerson({ entity: e, firstName: "Alicia" });
            expect(db.indexes.byLowerLast.find("smith")).toEqual([e]);
        });

        it("delete removes the entity from the computed bucket", () => {
            const db = Database.create(computedPlugin());
            const e = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });
            expect(db.indexes.byLowerLast.find("smith")).toEqual([e]);

            db.transactions.deletePerson(e);
            expect(db.indexes.byLowerLast.find("smith")).toEqual([]);
        });

        it("unique conflict on insert throws atomically", () => {
            const db = Database.create(computedPlugin());
            const first = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });

            // Different casing produces the same lowercased computed key.
            expect(() =>
                db.transactions.addPerson({ firstName: "ALICE", lastName: "SMITH" }),
            ).toThrow(/Unique index conflict/);

            // The original entity is still indexed; no phantom row was added.
            expect(db.indexes.uniqueByFullName.get("alice smith")).toBe(first);
        });

        it("unique conflict on update throws atomically", () => {
            const db = Database.create(computedPlugin());
            const a = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });
            const b = db.transactions.addPerson({ firstName: "Bob",   lastName: "Jones" });

            // Try to rename b such that its computed key collides with a.
            expect(() =>
                db.transactions.renamePerson({ entity: b, firstName: "Alice", lastName: "Smith" }),
            ).toThrow(/Unique index conflict/);

            // Both entities still findable at their original keys.
            expect(db.indexes.uniqueByFullName.get("alice smith")).toBe(a);
            expect(db.indexes.uniqueByFullName.get("bob jones")).toBe(b);
        });

        it("findRange supports operator queries on a scalar computed key", () => {
            const db = Database.create(computedPlugin());
            // Quadrant 0 (x<0, y<0), 1 (x>=0, y<0), 2 (x<0, y>=0), 3 (both >= 0).
            const q3 = db.transactions.addPoint({ x: 5, y: 5 });
            db.transactions.addPoint({ x: -5, y: 5 });
            db.transactions.addPoint({ x: -5, y: -5 });
            const q1 = db.transactions.addPoint({ x: 5, y: -5 });

            // >= 3 → only quadrant 3.
            expect(db.indexes.byQuadrant.findRange({ ">=": 3 })).toEqual([q3]);
            // < 2 → quadrants 0 and 1.
            const lessThan2 = [...db.indexes.byQuadrant.findRange({ "<": 2 })].sort();
            expect(lessThan2.length).toBe(2);
            expect(lessThan2).toContain(q1);
            // Direct value form is equivalent to find — covers `WhereCondition<Key>` union.
            expect(db.indexes.byQuadrant.findRange(3)).toEqual([q3]);
        });

        it("t.indexes on a computed unique index sees writes from the same transaction", () => {
            const plugin = Database.Plugin.create({
                components: { email: { type: "string" } },
                archetypes: { User: ["email"] },
                indexes: {
                    uniqueByLowerEmail: {
                        components: ["email"],
                        compute: (e: string) => e.toLowerCase(),
                        unique: true,
                    },
                },
                transactions: {
                    addIfNew: (t, email: string) => {
                        const existing = t.indexes.uniqueByLowerEmail.get(email.toLowerCase());
                        if (existing !== undefined) return existing;
                        return t.archetypes.User.insert({ email });
                    },
                },
            });
            const db = Database.create(plugin);
            const e = db.transactions.addIfNew("Alice@Example.com");
            // Calling again with different casing must find the same entity —
            // proves the just-inserted row is visible inside the transaction
            // body via the computed (lowercased) key.
            const same = db.transactions.addIfNew("ALICE@example.com");
            expect(same).toBe(e);
        });

        it("auto-routes db.select via a computed index when where matches the computed key shape", () => {
            // The auto-router treats `where` keys as a set against an
            // index's `components`. For a computed index, the components
            // are the SOURCE columns, so a `where: { lastName: "Smith" }`
            // — equality on the source column — does NOT match the
            // computed-index key (which lives in a separate value space).
            // It does, however, still match the RAW-mode lookup that the
            // index would do if `compute` were absent. So this test pins
            // the documented behaviour: auto-routing only fires for raw
            // indexes today. Direct `db.indexes.byLowerLast.find(...)`
            // remains the entry point for computed indexes.
            const db = Database.create(computedPlugin());
            const e = db.transactions.addPerson({ firstName: "Alice", lastName: "Smith" });

            // Direct: works.
            expect(db.indexes.byLowerLast.find("smith")).toEqual([e]);

            // Auto-routing for a raw `where` on a SOURCE column does not
            // collapse to a computed-index lookup — that would be wrong
            // because the key spaces are different. We fall back to scan.
            // (Future work: a separate router for computed indexes.)
            const result = db.select(["lastName"], { where: { lastName: "Smith" } });
            expect(result).toEqual([e]);
        });

        it("registry detects structural duplicates by (components, unique, compute identity)", () => {
            const sharedCompute = (last: string) => last.toLowerCase();
            // Same compute reference under two different names: structural duplicate.
            expect(() =>
                Database.create(Database.Plugin.create({
                    components: { name: { type: "string" } },
                    indexes: {
                        byA: { components: ["name"], compute: sharedCompute },
                        byB: { components: ["name"], compute: sharedCompute },
                    },
                })),
            ).toThrow(/identical shape/);

            // Different compute references under two different names:
            // NOT a structural duplicate; both register.
            const db = Database.create(Database.Plugin.create({
                components: { name: { type: "string" } },
                archetypes: { Named: ["name"] },
                indexes: {
                    byLower: { components: ["name"], compute: (n: string) => n.toLowerCase() },
                    byUpper: { components: ["name"], compute: (n: string) => n.toUpperCase() },
                },
                transactions: {
                    add: (t, name: string) => t.archetypes.Named.insert({ name }),
                },
            }));
            const e = db.transactions.add("Alice");
            expect(db.indexes.byLower.find("alice")).toEqual([e]);
            expect(db.indexes.byUpper.find("ALICE")).toEqual([e]);
        });
    });

    describe("multi-value indexes (array fan-out)", () => {
        // Plugin with non-unique multi indexes — the general fan-out cases.
        const multiPlugin = () => Database.Plugin.create({
            components: {
                title: { type: "string" },
                assigned: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
                body: { type: "string" },
                category: { type: "string" },
            },
            archetypes: {
                Task: ["title", "assigned"],
                Tagged: ["title", "tags"],
                Doc: ["body"],
                Categorized: ["title", "category", "tags"],
            },
            indexes: {
                // Raw multi: index on an array column.
                byAssignee: { components: ["assigned"] },
                // Computed multi: compute returns string[].
                byKeyword: {
                    components: ["body"],
                    compute: (body: string) =>
                        body.toLowerCase().split(/\s+/).filter((s) => s.length > 0),
                },
                // Raw compound with one array component — cartesian fan-out.
                byCategoryTag: { components: ["category", "tags"] },
            },
            transactions: {
                addTask: (t, args: { title: string; assigned: readonly string[] }) =>
                    t.archetypes.Task.insert(args),
                addTagged: (t, args: { title: string; tags: readonly string[] }) =>
                    t.archetypes.Tagged.insert(args),
                addDoc: (t, args: { body: string }) =>
                    t.archetypes.Doc.insert(args),
                addCategorized: (t, args: { title: string; category: string; tags: readonly string[] }) =>
                    t.archetypes.Categorized.insert(args),
                updateAssignees: (t, args: { entity: number; assigned: readonly string[] }) => {
                    const { entity, ...patch } = args;
                    t.update(entity, patch);
                },
                deleteTask: (t, entity: number) => t.delete(entity),
            },
        });

        // Separate plugin used by the unique-conflict tests so the unique
        // constraint isn't in scope for the basic shared-element tests above.
        const uniqueMultiPlugin = () => Database.Plugin.create({
            components: {
                title: { type: "string" },
                assigned: { type: "array", items: { type: "string" } },
            },
            archetypes: { Task: ["title", "assigned"] },
            indexes: {
                exclusiveByAssignee: { components: ["assigned"], unique: true },
            },
            transactions: {
                addTask: (t, args: { title: string; assigned: readonly string[] }) =>
                    t.archetypes.Task.insert(args),
                updateAssignees: (t, args: { entity: number; assigned: readonly string[] }) => {
                    const { entity, ...patch } = args;
                    t.update(entity, patch);
                },
            },
        });

        // -------------------------------------------------------------- raw
        it("raw multi: each array element is its own bucket entry", () => {
            const db = Database.create(multiPlugin());
            const t = db.transactions.addTask({
                title: "ship it",
                assigned: ["joe", "bob"],
            });
            expect(db.indexes.byAssignee.find({ assigned: "joe" })).toEqual([t]);
            expect(db.indexes.byAssignee.find({ assigned: "bob" })).toEqual([t]);
            expect(db.indexes.byAssignee.find({ assigned: "carol" })).toEqual([]);
        });

        it("raw multi: multiple entities sharing an element are returned together", () => {
            const db = Database.create(multiPlugin());
            const a = db.transactions.addTask({ title: "A", assigned: ["joe", "bob"] });
            const b = db.transactions.addTask({ title: "B", assigned: ["joe", "carol"] });
            db.transactions.addTask({ title: "C", assigned: ["diane"] });

            const joes = [...db.indexes.byAssignee.find({ assigned: "joe" })].sort();
            expect(joes).toEqual([a, b].sort());
        });

        it("raw multi: empty array produces no bucket entries", () => {
            const db = Database.create(multiPlugin());
            db.transactions.addTask({ title: "Unassigned", assigned: [] });
            // Nothing to look up.
            expect(db.indexes.byAssignee.find({ assigned: "joe" })).toEqual([]);
        });

        it("raw multi: update set-diffs buckets — stable elements stay, new ones added, removed ones dropped", () => {
            const db = Database.create(multiPlugin());
            const t = db.transactions.addTask({ title: "T", assigned: ["joe", "bob"] });

            db.transactions.updateAssignees({ entity: t, assigned: ["joe", "carol"] });

            expect(db.indexes.byAssignee.find({ assigned: "joe" })).toEqual([t]);
            expect(db.indexes.byAssignee.find({ assigned: "bob" })).toEqual([]);
            expect(db.indexes.byAssignee.find({ assigned: "carol" })).toEqual([t]);
        });

        it("raw multi: delete clears the entity from every bucket it was in", () => {
            const db = Database.create(multiPlugin());
            const t = db.transactions.addTask({ title: "T", assigned: ["joe", "bob"] });

            db.transactions.deleteTask(t);

            expect(db.indexes.byAssignee.find({ assigned: "joe" })).toEqual([]);
            expect(db.indexes.byAssignee.find({ assigned: "bob" })).toEqual([]);
        });

        it("raw multi compound: cartesian fan-out across array + scalar components", () => {
            const db = Database.create(multiPlugin());
            const t = db.transactions.addCategorized({
                title: "X",
                category: "engineering",
                tags: ["urgent", "blocked"],
            });

            // Both (category, tag) combinations land the entity in distinct buckets.
            expect(db.indexes.byCategoryTag.find({ category: "engineering", tags: "urgent" })).toEqual([t]);
            expect(db.indexes.byCategoryTag.find({ category: "engineering", tags: "blocked" })).toEqual([t]);
            // Wrong category: nothing.
            expect(db.indexes.byCategoryTag.find({ category: "design", tags: "urgent" })).toEqual([]);
        });

        // ----------------------------------------------------- unique + multi
        it("unique + multi: throws on insert when ANY element collides with another entity", () => {
            const db = Database.create(uniqueMultiPlugin());
            db.transactions.addTask({ title: "First",  assigned: ["joe"] });

            expect(() =>
                db.transactions.addTask({ title: "Second", assigned: ["bob", "joe"] }),
            ).toThrow(/Unique index conflict/);

            // First task is intact in the unique index; second never landed.
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "bob" })).toBeUndefined();
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "joe" })).toBeDefined();
        });

        it("unique + multi: throws on update when reassignment collides with another entity", () => {
            const db = Database.create(uniqueMultiPlugin());
            const a = db.transactions.addTask({ title: "A", assigned: ["alice"] });
            const b = db.transactions.addTask({ title: "B", assigned: ["bob"] });

            // Reassigning b to include alice's value collides on "alice".
            expect(() =>
                db.transactions.updateAssignees({ entity: b, assigned: ["alice", "bob"] }),
            ).toThrow(/Unique index conflict/);

            // Both entities still findable at their original keys.
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "alice" })).toBe(a);
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "bob" })).toBe(b);
        });

        it("unique + multi: same entity reassigning to overlapping element is fine", () => {
            const db = Database.create(uniqueMultiPlugin());
            const a = db.transactions.addTask({ title: "A", assigned: ["alice", "bob"] });

            // Removing one of its own elements and adding a new one — no self-conflict.
            expect(() =>
                db.transactions.updateAssignees({ entity: a, assigned: ["alice", "carol"] }),
            ).not.toThrow();
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "alice" })).toBe(a);
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "bob" })).toBeUndefined();
            expect(db.indexes.exclusiveByAssignee.get({ assigned: "carol" })).toBe(a);
        });

        // ----------------------------------------------------- computed multi
        it("computed multi: compute returning string[] fans out each element", () => {
            const db = Database.create(multiPlugin());
            const d = db.transactions.addDoc({ body: "the quick brown fox" });

            expect(db.indexes.byKeyword.find("quick")).toEqual([d]);
            expect(db.indexes.byKeyword.find("brown")).toEqual([d]);
            expect(db.indexes.byKeyword.find("missing")).toEqual([]);
        });

        it("computed multi: range operators on a single computed element", () => {
            const db = Database.create(multiPlugin());
            const d = db.transactions.addDoc({ body: "alpha beta gamma" });
            // Any docs that contain a word lexically >= "b" and < "z"?
            const inRange = db.indexes.byKeyword.findRange({ ">=": "b", "<": "z" });
            expect(inRange).toEqual([d]);
        });

        // ----------------------------------------------------- t.indexes during transaction
        it("multi index sees writes from the same transaction", () => {
            const plugin = Database.Plugin.create({
                components: {
                    title: { type: "string" },
                    assigned: { type: "array", items: { type: "string" } },
                },
                archetypes: { Task: ["title", "assigned"] },
                indexes: {
                    byAssignee: { components: ["assigned"] },
                },
                transactions: {
                    addOrAttach: (t, args: { title: string; assignees: readonly string[] }) => {
                        // If anyone in `assignees` already has tasks, reuse the first
                        // such task; otherwise insert a new one.
                        for (const a of args.assignees) {
                            const hits = t.indexes.byAssignee.find({ assigned: a });
                            if (hits.length > 0) return hits[0];
                        }
                        return t.archetypes.Task.insert({
                            title: args.title,
                            assigned: args.assignees,
                        });
                    },
                },
            });
            const db = Database.create(plugin);
            const first = db.transactions.addOrAttach({ title: "T1", assignees: ["joe"] });
            // A second call referencing joe should find the just-created task.
            const second = db.transactions.addOrAttach({ title: "T2", assignees: ["joe", "bob"] });
            expect(second).toBe(first);
        });
    });

    describe("sorted iteration via `order`", () => {
        const sortedPlugin = () => Database.Plugin.create({
            components: {
                parent: { type: "number" },
                fractIndex: { type: "string" },
                priority: { type: "number" },
                label: { type: "string" },
            },
            archetypes: {
                Child: ["parent", "fractIndex"],
                Prioritized: ["parent", "priority", "fractIndex"],
            },
            indexes: {
                // SortedChildOf-style: group by parent, sort by fractIndex asc.
                trackChildren: {
                    components: ["parent"],
                    order: { fractIndex: true },
                },
                // Multi-key: priority desc, fractIndex asc as tie-breaker.
                priorityChildren: {
                    components: ["parent"],
                    order: { priority: false, fractIndex: true },
                },
            },
            transactions: {
                addChild: (t, args: { parent: number; fractIndex: string }) =>
                    t.archetypes.Child.insert(args),
                addPrioritized: (
                    t,
                    args: { parent: number; priority: number; fractIndex: string },
                ) =>
                    t.archetypes.Prioritized.insert(args),
                moveChild: (
                    t,
                    args: { entity: number; fractIndex: string },
                ) => {
                    const { entity, ...patch } = args;
                    t.update(entity, patch);
                },
                deleteChild: (t, entity: number) => t.delete(entity),
            },
        });

        // ----------------------------------------------- single-key ascending
        it("returns entities sorted by the order key (ascending)", () => {
            const db = Database.create(sortedPlugin());
            // Insert in *non*-sorted order; the index must sort them.
            const c = db.transactions.addChild({ parent: 7, fractIndex: "c" });
            const a = db.transactions.addChild({ parent: 7, fractIndex: "a" });
            const b = db.transactions.addChild({ parent: 7, fractIndex: "b" });

            expect(db.indexes.trackChildren.find({ parent: 7 })).toEqual([a, b, c]);
        });

        it("groups by `components` then sorts within each group", () => {
            const db = Database.create(sortedPlugin());
            const a7 = db.transactions.addChild({ parent: 7, fractIndex: "a" });
            const b9 = db.transactions.addChild({ parent: 9, fractIndex: "b" });
            const b7 = db.transactions.addChild({ parent: 7, fractIndex: "b" });
            const a9 = db.transactions.addChild({ parent: 9, fractIndex: "a" });

            // Each parent's children sorted by fractIndex.
            expect(db.indexes.trackChildren.find({ parent: 7 })).toEqual([a7, b7]);
            expect(db.indexes.trackChildren.find({ parent: 9 })).toEqual([a9, b9]);
        });

        // ----------------------------------------------- update repositions
        it("update on the sort component repositions the entity within its bucket", () => {
            const db = Database.create(sortedPlugin());
            const a = db.transactions.addChild({ parent: 7, fractIndex: "a" });
            const b = db.transactions.addChild({ parent: 7, fractIndex: "b" });
            const c = db.transactions.addChild({ parent: 7, fractIndex: "c" });

            expect(db.indexes.trackChildren.find({ parent: 7 })).toEqual([a, b, c]);

            // Move b to "z" — should now be last.
            db.transactions.moveChild({ entity: b, fractIndex: "z" });
            expect(db.indexes.trackChildren.find({ parent: 7 })).toEqual([a, c, b]);

            // Move a between b and c via a key between "c" and "z".
            db.transactions.moveChild({ entity: a, fractIndex: "d" });
            expect(db.indexes.trackChildren.find({ parent: 7 })).toEqual([c, a, b]);
        });

        it("update that does not change the sort key is a no-op for order", () => {
            const db = Database.create(sortedPlugin());
            db.transactions.addChild({ parent: 7, fractIndex: "a" });
            const b = db.transactions.addChild({ parent: 7, fractIndex: "b" });
            db.transactions.addChild({ parent: 7, fractIndex: "c" });

            // Update b to the same fractIndex — order shouldn't change.
            db.transactions.moveChild({ entity: b, fractIndex: "b" });
            const order = db.indexes.trackChildren.find({ parent: 7 });
            expect(order[1]).toBe(b); // still in middle
        });

        // ----------------------------------------------- delete preserves order
        it("delete preserves the sort order of remaining entities", () => {
            const db = Database.create(sortedPlugin());
            const a = db.transactions.addChild({ parent: 7, fractIndex: "a" });
            const b = db.transactions.addChild({ parent: 7, fractIndex: "b" });
            const c = db.transactions.addChild({ parent: 7, fractIndex: "c" });

            db.transactions.deleteChild(b);
            expect(db.indexes.trackChildren.find({ parent: 7 })).toEqual([a, c]);
        });

        // ----------------------------------------------- multi-key precedence
        it("multi-key order: primary then tie-breaker, with direction per key", () => {
            const db = Database.create(sortedPlugin());
            // Priority desc, fractIndex asc.
            const e1 = db.transactions.addPrioritized({ parent: 1, priority: 1, fractIndex: "a" });
            const e3 = db.transactions.addPrioritized({ parent: 1, priority: 3, fractIndex: "b" });
            const e2a = db.transactions.addPrioritized({ parent: 1, priority: 2, fractIndex: "a" });
            const e2b = db.transactions.addPrioritized({ parent: 1, priority: 2, fractIndex: "b" });

            // Expected: 3 (highest), then 2/a, 2/b (tie-broken by fractIndex), then 1.
            expect(db.indexes.priorityChildren.find({ parent: 1 })).toEqual([e3, e2a, e2b, e1]);
        });

        // ----------------------------------------------- bulk seeding via extend
        it("populates and sorts when a sorted-index plugin is added after data exists", () => {
            const base = Database.Plugin.create({
                components: {
                    parent: { type: "number" },
                    fractIndex: { type: "string" },
                },
                archetypes: { Child: ["parent", "fractIndex"] },
                transactions: {
                    addChild: (t, args: { parent: number; fractIndex: string }) =>
                        t.archetypes.Child.insert(args),
                },
            });

            const db = Database.create(base);
            // Insert in scrambled order BEFORE the sorted index is registered.
            const c = db.transactions.addChild({ parent: 5, fractIndex: "c" });
            const a = db.transactions.addChild({ parent: 5, fractIndex: "a" });
            const b = db.transactions.addChild({ parent: 5, fractIndex: "b" });

            // Now extend with the sorted index — seedIndexFromArchetypes
            // must produce a correctly sorted bucket.
            const indexed = Database.Plugin.create({
                extends: base,
                indexes: {
                    trackChildren: {
                        components: ["parent"],
                        order: { fractIndex: true },
                    },
                },
            });
            const ext = db.extend(indexed);
            expect(ext.indexes.trackChildren.find({ parent: 5 })).toEqual([a, b, c]);
        });

        // ----------------------------------------------- declaration rejection
        it("rejects `order` combined with `compute` at registration", () => {
            expect(() =>
                Database.create(Database.Plugin.create({
                    components: { name: { type: "string" } },
                    indexes: {
                        bogus: {
                            components: ["name"],
                            compute: (n: string) => n.toLowerCase(),
                            order: { name: true },
                        },
                    },
                })),
            ).toThrow(/both `compute` and `order`/);
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
