// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Entity } from "../entity/entity.js";
import { Observe } from "../../observe/index.js";

/**
 * Database-level type checks for the new index API. The exhaustive
 * pattern-by-pattern type proof for the four `key` shapes lives in
 * `index-api-proof.type-test.ts`; this file verifies how the inferred
 * handle types flow up through `Database.FromPlugin`, `db.indexes`, and
 * `t.indexes`.
 *
 * Each test isolates itself in its own function so an error in one
 * declaration does not degrade inference for the others (same idea as
 * `create-plugin.type-test.ts`).
 */

// ============================================================================
// VALID — handle shapes flow through Database.FromPlugin
// ============================================================================

function validSingleKeyScalarFind() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
            name: { type: "string" },
        },
        indexes: {
            byName: { key: "name" },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byName"];

    // Single-string key → find takes a named object `{ col: value }`.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], { readonly name: string }>>;
    type _FindRet = Assert<Equal<ReturnType<Handle["find"]>, readonly Entity[]>>;
    type _RangeRet = Assert<Equal<ReturnType<Handle["findRange"]>, readonly Entity[]>>;
    // No `get` on non-unique handle.
    type _NoGet = Assert<Equal<"get" extends keyof Handle ? true : false, false>>;
}

function validTupleCompoundFind() {
    const plugin = createPlugin({
        components: {
            team: { type: "number" },
            position: { type: "string" },
            z: { type: "number" },
        },
        indexes: {
            byTeamPosition: { key: ["team", "position"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byTeamPosition"];

    // Tuple key → find takes an object with exactly those columns.
    type FindArg = Parameters<Handle["find"]>[0];
    type _Keys = Assert<Equal<keyof FindArg, "team" | "position">>;
    type _Types = Assert<Equal<FindArg, { readonly team: number; readonly position: string }>>;
}

function validUniqueExposesGet() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
        },
        indexes: {
            uniqueByEmail: { key: "email", unique: true },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["uniqueByEmail"];

    // get returns Entity | null (null = known absent); arg is a named object.
    type _GetArg = Assert<Equal<Parameters<Handle["get"]>[0], { readonly email: string }>>;
    type _GetRet = Assert<Equal<ReturnType<Handle["get"]>, Entity | null>>;
}

function validComputedScalarFind() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
        },
        indexes: {
            byEmailCi: { key: { email: (c) => c.email!.toLowerCase() }, components: ["email"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byEmailCi"];

    // Computed (single-slot) key → find takes a named object whose field is
    // the slot, typed by the extractor's return.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], { readonly email: string }>>;
}

function validComputedMultiValueFanout() {
    const plugin = createPlugin({
        components: {
            body: { type: "string" },
        },
        indexes: {
            byKeyword: { key: { keyword: (c) => c.body!.split(/\s+/) }, components: ["body"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byKeyword"];

    // Array-returning computed slot → find field takes the element type.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], { readonly keyword: string }>>;
}

function validSlotMapFind() {
    const plugin = createPlugin({
        components: {
            team: { type: "number" },
            role: { type: "string" },
        },
        indexes: {
            playerByTeamRole: {
                key: { team: "team", role: "role" },
                unique: true,
            },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["playerByTeamRole"];

    type FindArg = Parameters<Handle["find"]>[0];
    type _SlotKeys = Assert<Equal<keyof FindArg, "team" | "role">>;
}

function validSortedOrderShape() {
    const plugin = createPlugin({
        components: {
            parent: { type: "number" },
            fractIndex: { type: "string" },
        },
        indexes: {
            orderedChildrenOf: {
                key: "parent",
                order: { by: ["fractIndex"] },
            },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["orderedChildrenOf"];
    // Order doesn't change find's argument shape — still the named `{ parent }`.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], { readonly parent: number }>>;
    // `observe` mirrors `find`'s argument shape and yields an Observe of the
    // sorted bucket.
    type _ObserveArg = Assert<Equal<Parameters<Handle["observe"]>[0], { readonly parent: number }>>;
    type _ObserveRet = Assert<Equal<ReturnType<Handle["observe"]>, Observe<readonly Entity[]>>>;
}

function archetypeScopeValidatesName() {
    createPlugin({
        components: { parent: { type: "number" }, priority: { type: "number" } },
        archetypes: { Task: ["parent", "priority"] },
        indexes: {
            // A declared archetype name is accepted.
            ok: { key: "parent", archetype: "Task" },
        },
    });
}

function archetypeScopeRejectsUnknownName() {
    createPlugin({
        components: { parent: { type: "number" } },
        archetypes: { Task: ["parent"] },
        indexes: {
            // @ts-expect-error - "Bogus" is not a declared archetype
            bad: { key: "parent", archetype: "Bogus" },
        },
    });
}

function validIndexesEmptyByDefault() {
    const plugin = createPlugin({
        components: { a: { type: "number" } },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type _NoIndexes = Assert<Equal<keyof DB["indexes"], never>>;
}

function validExtendedPluginCarriesIndexes() {
    const base = createPlugin({
        components: { email: { type: "string" } },
        indexes: { uniqueByEmail: { key: "email", unique: true } },
    });

    const extended = createPlugin({
        extends: base,
        components: { name: { type: "string" } },
        indexes: { byName: { key: "name" } },
    });

    type DB = Database.FromPlugin<typeof extended>;
    type _HasByName = Assert<Equal<"byName" extends keyof DB["indexes"] ? true : false, true>>;
    type _HasByEmail = Assert<Equal<"uniqueByEmail" extends keyof DB["indexes"] ? true : false, true>>;
    // The extended-plugin unique index still narrows get correctly.
    type _GetRet = Assert<Equal<ReturnType<DB["indexes"]["uniqueByEmail"]["get"]>, Entity | null>>;
}

// ============================================================================
// VALID — t.indexes inside transactions
// ============================================================================

function tIndexesAvailableInsideTransactions() {
    createPlugin({
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
            ensureUnique: (t, args: { name: string; email: string }) => {
                const existing: Entity | null = t.indexes.uniqueByEmail.get({ email: args.email });
                if (existing !== null) return existing;
                const sameName: readonly Entity[] = t.indexes.byName.find({ name: args.name });
                if (sameName.length > 0) return sameName[0];
                return t.archetypes.User.insert(args);
            },
        },
    });
}

function tIndexesRejectsBogusName() {
    createPlugin({
        components: { name: { type: "string" } },
        archetypes: { Named: ["name"] },
        indexes: { byName: { key: "name" } },
        transactions: {
            bogusLookup: (t) => {
                // @ts-expect-error - "bogus" is not a declared index
                t.indexes.bogus.find("x");
            },
        },
    });
}

function tIndexesRejectsGetOnNonUnique() {
    createPlugin({
        components: { name: { type: "string" } },
        archetypes: { Named: ["name"] },
        indexes: { byName: { key: "name" } },
        transactions: {
            wrongGet: (t) => {
                // @ts-expect-error - byName is not unique; get is not on the handle
                t.indexes.byName.get("x");
            },
        },
    });
}

function bareStoreWithoutIndexesStillTypechecks() {
    type S = import("../store/store.js").Store<{ a: number }, {}, {}>;
    type _CheckEmpty = Assert<Equal<keyof S["indexes"], never>>;
}

// ============================================================================
// INVALID — declaration-time errors
// ============================================================================

function invalidUnknownComponentSingleStringKey() {
    createPlugin({
        components: { name: { type: "string" } },
        indexes: {
            // @ts-expect-error - "bogus" is not a declared component
            byBogus: { key: "bogus" },
        },
    });
}

function invalidUnknownComponentInTupleKey() {
    createPlugin({
        components: { x: { type: "number" } },
        indexes: {
            // @ts-expect-error - "y" is not a declared component
            byXY: { key: ["x", "y"] },
        },
    });
}

function invalidUnknownComponentInSlotMapIdentitySlot() {
    createPlugin({
        components: { team: { type: "number" } },
        indexes: {
            bad: {
                // @ts-expect-error - "bogus" is not a declared component
                key: { team: "team", role: "bogus" },
            },
        },
    });
}

function invalidOrderByUnknownComponent() {
    createPlugin({
        components: {
            parent: { type: "number" },
            fractIndex: { type: "string" },
        },
        indexes: {
            bad: {
                key: "parent",
                // @ts-expect-error - "bogus" is not a declared component
                order: { by: ["bogus"] },
            },
        },
    });
}

// Negative compare-narrowing check note:
//   We'd like a typo like `compare: (a, b) => a.priority - b.priority` on an
//   order declared with `by: ["fractIndex"]` to fail at the plugin
//   descriptor. It does not today — TS infers `By` for the contextual
//   compare signature from the declaration-site default
//   (`readonly StringKeyof<C>[]`), not the literal `by` tuple, so
//   `Pick<C, By[number]>` widens to `C` and any column access type-checks.
//   The check still works when `IndexOrder` is used in isolation (see the
//   negative case in `index-api-proof.type-test.ts`); only the contextual
//   inference through `IndexDeclarations` is loose. Treating this as a
//   documented limitation rather than a runtime bug, since the runtime
//   only reads columns named in `by`.

function invalidFindOnNonUnique() {
    const plugin = createPlugin({
        components: { name: { type: "string" } },
        indexes: { byName: { key: "name" } },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - get is only on unique indexes
        db.indexes.byName.get("x");
    };
}

function invalidFindWrongFieldType() {
    const plugin = createPlugin({
        components: { team: { type: "number" } },
        indexes: { byTeam: { key: "team" } },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - the `team` field is a number, not a string
        db.indexes.byTeam.find({ team: "not a number" });
        // @ts-expect-error - a bare scalar is no longer accepted; arg is an object
        db.indexes.byTeam.find(1);
        // valid call
        db.indexes.byTeam.find({ team: 1 });
    };
}

function invalidPartialFindOnCompound() {
    const plugin = createPlugin({
        components: {
            x: { type: "number" },
            y: { type: "number" },
        },
        indexes: { byXY: { key: ["x", "y"] } },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - missing "y" in the compound key
        db.indexes.byXY.find({ x: 1 });
        // valid call provides both keys
        db.indexes.byXY.find({ x: 1, y: 2 });
    };
}

function invalidUniqueGetWrongType() {
    const plugin = createPlugin({
        components: { email: { type: "string" } },
        indexes: { uniqueByEmail: { key: "email", unique: true } },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - email must be a string
        db.indexes.uniqueByEmail.get({ email: 42 });
        // valid call
        db.indexes.uniqueByEmail.get({ email: "x@y.z" });
    };
}

// ============================================================================
// VALID — computed factories see db.indexes
//
// Regression guard: FullDBForPlugin used to forward only Database slots 1–7,
// so the IX slot (9) fell back to its `{}` default and `db.indexes` was empty
// inside computed factories. The declarations below would not compile if that
// regressed — `db.indexes.<name>` would be an error.
// ============================================================================

function computedSeesOwnIndexes() {
    createPlugin({
        components: {
            email: { type: "string" },
            name: { type: "string" },
        },
        indexes: {
            byName: { key: "name" },
        },
        computed: {
            probe: (db) => {
                type Handle = typeof db.indexes.byName;
                type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], { readonly name: string }>>;
                return Observe.fromConstant(db.indexes.byName.find({ name: "x" }).length);
            },
        },
    });
}

function computedSeesImportedAndExtendedIndexes() {
    const base = createPlugin({
        components: { email: { type: "string" } },
        indexes: { uniqueByEmail: { key: "email", unique: true } },
    });
    const dep = createPlugin({
        components: { name: { type: "string" } },
        indexes: { byName: { key: "name" } },
    });

    createPlugin({
        extends: base,
        imports: dep,
        computed: {
            // Index from `extends` base...
            fromExtends: (db) => Observe.fromConstant(db.indexes.uniqueByEmail.get({ email: "x@y.z" })),
            // ...and index from `imports` dependency.
            fromImports: (db) => Observe.fromConstant(db.indexes.byName.find({ name: "x" }).length),
        },
    });
}

// ============================================================================
// `Database.Index<C>` as a `satisfies` target on a standalone declaration
//
// A common pattern is to declare an index literal in its own module and bind
// it to a plugin's components via `satisfies Database.Index<C>` before it is
// aggregated into `Database.Plugin.create({ indexes })`. `Database.Index<C>`
// therefore must constrain `key` to real columns of `C` — the `K` generic is
// defaulted to `IndexKey<C>` rather than erased to `any`.
// ============================================================================

function satisfiesIndexAcceptsRealKey() {
    type C = { name: string; complete: boolean };
    const byComplete = { key: "complete" } as const satisfies Database.Index<C>;
    const byName = { key: "name", unique: true } as const satisfies Database.Index<C>;
    const byBoth = { key: ["name", "complete"] } as const satisfies Database.Index<C>;
    void byComplete;
    void byName;
    void byBoth;
}

function satisfiesIndexRejectsBogusKey() {
    type C = { name: string; complete: boolean };
    // @ts-expect-error - "bogus" is not a column of C, so the key is invalid.
    const bad = { key: "bogus" } as const satisfies Database.Index<C>;
    // @ts-expect-error - "bogus" is not a column of C in a tuple key either.
    const badTuple = { key: ["name", "bogus"] } as const satisfies Database.Index<C>;
    void bad;
    void badTuple;
}
