// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database, IndexDeclarations } from "./database.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Entity } from "../entity/entity.js";

/**
 * Type-only tests for Database.Index / IndexDeclarations / db.indexes.
 *
 * These tests verify:
 * 1. Valid index declarations type-check and infer keys / unique.
 * 2. Invalid usage (unknown component key, wrong handle shape, get on
 *    non-unique) is rejected by the compiler.
 * 3. The Database<...> generic threads IX through extend() and
 *    Database.FromPlugin so that db.indexes is correctly typed.
 *
 * Each invalid test is isolated in its own plugin definition for the
 * same reason listed in create-plugin.type-test.ts (an error in one
 * property degrades inference for the rest).
 */

// ============================================================================
// VALID TYPE INFERENCE
// ============================================================================

function validSingleKeyIndex() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
            name: { type: "string" },
        },
        indexes: {
            byName: { components: ["name"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byName"];

    // find() exists on every handle.
    type _CheckFind = Assert<Equal<
        Parameters<Handle["find"]>[0],
        Pick<{ email: string; name: string }, "name">
    >>;
    type _CheckFindReturn = Assert<Equal<ReturnType<Handle["find"]>, readonly Entity[]>>;

    // findRange() exists on every handle.
    type _CheckRange = Assert<Equal<ReturnType<Handle["findRange"]>, readonly Entity[]>>;

    // get() must be absent for a non-unique index.
    type _CheckNoGet = Assert<Equal<"get" extends keyof Handle ? true : false, false>>;
}

function validCompoundIndex() {
    const plugin = createPlugin({
        components: {
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "number" },
        },
        indexes: {
            byXY: { components: ["x", "y"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byXY"];

    // find() needs both x and y, never z.
    type FindArg = Parameters<Handle["find"]>[0];
    type _CheckArgKeys = Assert<Equal<keyof FindArg, "x" | "y">>;
}

function validUniqueIndex() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
            name: { type: "string" },
        },
        indexes: {
            uniqueByEmail: { components: ["email"], unique: true },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["uniqueByEmail"];

    // get() is exposed for unique indexes and returns Entity | undefined.
    type _CheckGetReturn = Assert<Equal<
        ReturnType<Handle["get"]>,
        Entity | undefined
    >>;
    type _CheckGetArg = Assert<Equal<
        Parameters<Handle["get"]>[0],
        Pick<{ email: string; name: string }, "email">
    >>;
}

function validMixedUniqueAndNonUnique() {
    const plugin = createPlugin({
        components: {
            name: { type: "string" },
            email: { type: "string" },
        },
        indexes: {
            byName: { components: ["name"] },
            uniqueByEmail: { components: ["email"], unique: true },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type _UniqueHasGet = Assert<Equal<"get" extends keyof DB["indexes"]["uniqueByEmail"] ? true : false, true>>;
    type _NonUniqueNoGet = Assert<Equal<"get" extends keyof DB["indexes"]["byName"] ? true : false, false>>;
}

function validExtendedPluginCarriesIndexes() {
    const base = createPlugin({
        components: {
            email: { type: "string" },
        },
        indexes: {
            uniqueByEmail: { components: ["email"], unique: true },
        },
    });

    const extended = createPlugin({
        extends: base,
        components: {
            name: { type: "string" },
        },
        indexes: {
            byName: { components: ["name"] },
        },
    });

    type DB = Database.FromPlugin<typeof extended>;

    // Both indexes are present after extend.
    type _CheckByName = Assert<Equal<"byName" extends keyof DB["indexes"] ? true : false, true>>;
    type _CheckByEmail = Assert<Equal<"uniqueByEmail" extends keyof DB["indexes"] ? true : false, true>>;

    // The extended-plugin index still narrows get correctly.
    type _CheckGet = Assert<Equal<
        ReturnType<DB["indexes"]["uniqueByEmail"]["get"]>,
        Entity | undefined
    >>;
}

function validIndexUsesComponentFromExtendedPlugin() {
    const base = createPlugin({
        components: {
            email: { type: "string" },
        },
    });

    // An index in the extending plugin may reference a component declared
    // by the extended plugin.
    const extended = createPlugin({
        extends: base,
        indexes: {
            uniqueByEmail: { components: ["email"], unique: true },
        },
    });

    type DB = Database.FromPlugin<typeof extended>;
    type Handle = DB["indexes"]["uniqueByEmail"];
    type _CheckGet = Assert<Equal<ReturnType<Handle["get"]>, Entity | undefined>>;
}

function validIndexesEmptyByDefault() {
    const plugin = createPlugin({
        components: {
            a: { type: "number" },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type _CheckIndexesEmpty = Assert<Equal<keyof DB["indexes"], never>>;
}

function validIndexDeclarationsConstraint() {
    // IndexDeclarations<C> should accept literal maps whose components
    // tuples reference real keys of C.
    type C = { name: string; email: string };

    // Valid: "name" is a key of C, so the constraint is satisfied.
    const _validIxs: IndexDeclarations<C> = {
        byName: { components: ["name"] },
        uniqueByEmail: { components: ["email"], unique: true },
    };
    void _validIxs;

    // Invalid: "bogus" is not a key of C.
    const _invalidIxs: IndexDeclarations<C> = {
        // @ts-expect-error - "bogus" is not a key of C
        byBogus: { components: ["bogus"] },
    };
    void _invalidIxs;
}

// ============================================================================
// INVALID TYPE INFERENCE
// ============================================================================

// Index references an unknown component (single key).
function invalidUnknownComponentSingle() {
    createPlugin({
        components: {
            name: { type: "string" },
        },
        indexes: {
            // @ts-expect-error - "bogus" is not a declared component
            byBogus: { components: ["bogus"] },
        },
    });
}

// Index references an unknown component (one of compound).
function invalidUnknownComponentInCompound() {
    createPlugin({
        components: {
            x: { type: "number" },
        },
        indexes: {
            // @ts-expect-error - "y" is not a declared component
            byXY: { components: ["x", "y"] },
        },
    });
}

// Empty components tuple is rejected — index needs at least one key.
function invalidEmptyComponents() {
    createPlugin({
        components: {
            x: { type: "number" },
        },
        indexes: {
            // @ts-expect-error - components tuple must be non-empty
            empty: { components: [] },
        },
    });
}

// get() is not callable on a non-unique index.
function invalidGetOnNonUnique() {
    const plugin = createPlugin({
        components: {
            name: { type: "string" },
        },
        indexes: {
            byName: { components: ["name"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type Handle = DB["indexes"]["byName"];

    // The handle has no `get` member; key lookup is type `never`.
    type _CheckNoGet = Assert<Equal<"get" extends keyof Handle ? true : false, false>>;

    // Negative runtime callsite — Handle has no `get` so this should fail.
    const _bad = (h: Handle) => {
        // @ts-expect-error - get is only available on unique indexes
        h.get({ name: "x" });
    };
}

// find() rejects unknown property keys.
function invalidFindKey() {
    const plugin = createPlugin({
        components: {
            name: { type: "string" },
        },
        indexes: {
            byName: { components: ["name"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - "email" is not part of the index key
        db.indexes.byName.find({ email: "x" });

        // valid call still works
        db.indexes.byName.find({ name: "x" });
    };
}

// find() requires the full key tuple — partial keys belong on findRange.
function invalidPartialFindOnCompound() {
    const plugin = createPlugin({
        components: {
            x: { type: "number" },
            y: { type: "number" },
        },
        indexes: {
            byXY: { components: ["x", "y"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - missing "y" in the compound key
        db.indexes.byXY.find({ x: 1 });

        // valid call with both keys
        db.indexes.byXY.find({ x: 1, y: 2 });
    };
}

// findRange rejects operator on a key that is not part of the index.
function invalidRangeKey() {
    const plugin = createPlugin({
        components: {
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "number" },
        },
        indexes: {
            byXY: { components: ["x", "y"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - "z" is not in the index key tuple
        db.indexes.byXY.findRange({ z: { ">=": 1 } });

        // valid range across both indexed keys
        db.indexes.byXY.findRange({ x: 1, y: { ">=": 2, "<": 5 } });
    };
}

// findRange rejects an operator value of the wrong scalar type.
function invalidRangeOperatorType() {
    const plugin = createPlugin({
        components: {
            x: { type: "number" },
        },
        indexes: {
            byX: { components: ["x"] },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - operator value must match component type (number, not string)
        db.indexes.byX.findRange({ x: { ">=": "not a number" } });
    };
}

// `indexes` property is rejected when defined after `computed` (property order).
// Runtime validation in validatePropertyOrder also enforces this; we only
// assert the runtime ordering invariant here via a comment, because the
// type-level descriptor accepts any of the optional fields in any order at
// compile time. (This is preserved as a structural reminder for reviewers.)
//
// See create-plugin.ts -> validatePropertyOrder for the enforced order:
//   extends, services, components, resources, archetypes, indexes,
//   computed, transactions, actions, systems.

// ============================================================================
// PART C — t.indexes typing via Store IX generic
// ============================================================================

function tIndexesAvailableInsideTransactions() {
    const plugin = createPlugin({
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
            // `t` here is `TransactionContext<C, R, A, IX>` — `t.indexes` is
            // typed against the plugin's index map, so byName / uniqueByEmail
            // are accessible and `get` is narrowed to the unique one.
            ensureUnique: (t, args: { name: string; email: string }) => {
                const existing: Entity | undefined =
                    t.indexes.uniqueByEmail.get({ email: args.email });
                if (existing !== undefined) return existing;
                const sameName: readonly Entity[] = t.indexes.byName.find({ name: args.name });
                if (sameName.length > 0) return sameName[0];
                return t.archetypes.User.insert(args);
            },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    type DBHandles = DB["indexes"];
    // Both byName and uniqueByEmail must be exposed at the Database level.
    type _CheckByName = Assert<Equal<"byName" extends keyof DBHandles ? true : false, true>>;
    type _CheckByEmail = Assert<Equal<"uniqueByEmail" extends keyof DBHandles ? true : false, true>>;
}

function tIndexesRejectsBogusName() {
    createPlugin({
        components: { name: { type: "string" } },
        archetypes: { Named: ["name"] },
        indexes: { byName: { components: ["name"] } },
        transactions: {
            bogusLookup: (t) => {
                // @ts-expect-error - "bogus" is not a declared index
                t.indexes.bogus.find({ name: "x" });
            },
        },
    });
}

function tIndexesRejectsGetOnNonUnique() {
    createPlugin({
        components: { name: { type: "string" } },
        archetypes: { Named: ["name"] },
        indexes: { byName: { components: ["name"] } },
        transactions: {
            wrongGet: (t) => {
                // @ts-expect-error - byName is not unique; get is not on the handle
                t.indexes.byName.get({ name: "x" });
            },
        },
    });
}

function bareStoreWithoutIndexesStillTypechecks() {
    // Defaults: Store<C, R, A> with no IX still compiles for callers that
    // never declare indexes; `store.indexes` is `{}` and reads from it
    // are typed as `never`.
    type S = import("../store/store.js").Store<{ a: number }, {}, {}>;
    type _CheckEmpty = Assert<Equal<keyof S["indexes"], never>>;
}

// ============================================================================
// EXISTING NEGATIVE TESTS
// ============================================================================

// Unique handle's get rejects a wrong scalar type.
function invalidUniqueGetWrongType() {
    const plugin = createPlugin({
        components: {
            email: { type: "string" },
        },
        indexes: {
            uniqueByEmail: { components: ["email"], unique: true },
        },
    });

    type DB = Database.FromPlugin<typeof plugin>;
    const _bad = (db: DB) => {
        // @ts-expect-error - email is a string, not a number
        db.indexes.uniqueByEmail.get({ email: 42 });

        // valid call
        db.indexes.uniqueByEmail.get({ email: "x@y.z" });
    };
}
