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

    // Single-string key → find takes the scalar value of that column.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], string>>;
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

    // get returns Entity | null (null = known absent).
    type _GetArg = Assert<Equal<Parameters<Handle["get"]>[0], string>>;
    type _GetRet = Assert<Equal<ReturnType<Handle["get"]>, Entity | null>>;
}

function validComputedScalarFind() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
        },
        indexes: {
            byEmailCi: { key: (email: string) => email.toLowerCase() },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byEmailCi"];

    // Function key → find takes the function's return type.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], string>>;
}

function validComputedMultiValueFanout() {
    const plugin = createPlugin({
        components: {
            body: { type: "string" },
        },
        indexes: {
            byKeyword: { key: (body: string) => body.split(/\s+/) },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byKeyword"];

    // Array-returning function → find takes the element type.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], string>>;
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
    // Order doesn't change find's argument shape — still the scalar parent value.
    type _FindArg = Assert<Equal<Parameters<Handle["find"]>[0], number>>;
    // `observe` mirrors `find`'s argument shape and yields an Observe of the
    // sorted bucket.
    type _ObserveArg = Assert<Equal<Parameters<Handle["observe"]>[0], number>>;
    type _ObserveRet = Assert<Equal<ReturnType<Handle["observe"]>, Observe<readonly Entity[]>>>;
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
                const existing: Entity | null = t.indexes.uniqueByEmail.get(args.email);
                if (existing !== null) return existing;
                const sameName: readonly Entity[] = t.indexes.byName.find(args.name);
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

function invalidFindWrongScalarType() {
    const plugin = createPlugin({
        components: { team: { type: "number" } },
        indexes: { byTeam: { key: "team" } },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - team is a number, not a string
        db.indexes.byTeam.find("not a number");
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
        // @ts-expect-error - email is a string, not a number
        db.indexes.uniqueByEmail.get(42);
        // valid call
        db.indexes.uniqueByEmail.get("x@y.z");
    };
}
