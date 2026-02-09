// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../../types/assert.js";
import { Equal } from "../../../types/equal.js";
import { Database, SystemFunction } from "../database.js";
import { Store } from "../../store/index.js";
import { Entity } from "../../entity.js";
import { AsyncArgsProvider } from "../../store/transaction-functions.js";

/**
 * Type-only tests for Database.create type inference from plugins.
 * 
 * These tests verify that:
 * 1. Database.create can infer Database types from simple plugins
 * 2. Database.create can infer Database types from plugins with extends (Combine2)
 * 3. Database.create can infer Database types from deeply nested plugins (Combine2<Combine2<...>>)
 * 
 * These tests verify that Database.create correctly infers types from plugins, including
 * complex nested plugin declarations created by the `extends` clause (which uses Combine2).
 * 
 * The tests verify type correctness using Assert<Equal<...>> to catch type-breaking changes early.
 * 
 * Note: These are compile-time type checks only - they don't need to execute.
 * These tests would fail with the old type system that couldn't handle Combine2 nested types.
 */

// ============================================================================
// SIMPLE PLUGIN TESTS (no extends)
// ============================================================================

function testSimplePluginInference() {
    const plugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
        },
        resources: {
            time: { default: 0 as number },
        },
        archetypes: {
            Position: ["position"],
        },
        transactions: {
            createPosition: (store: Store<any, any, any>, args: { position: number }) => {
                return store.archetypes.Position.insert(args);
            },
        },
    });

    const db = Database.create(plugin);

    // Verify resources are inferred correctly
    type CheckResources = Assert<Equal<typeof db.resources, {
        readonly time: number;
    }>>;

    // Verify transaction parameter types and return types
    type CheckTransactionCreatePosition = Assert<Equal<
        typeof db.transactions.createPosition,
        (args: { position: number } | AsyncArgsProvider<{ position: number }>) => number
    >>;

    // @ts-expect-error - invalid transaction type check (wrong return type)
    type ExpectErrorTransactionCreatePosition = Assert<Equal<
        typeof db.transactions.createPosition,
        (args: { position: number } | AsyncArgsProvider<{ position: number }>) => string
    >>;
}

// ============================================================================
// SINGLE EXTENDS TESTS (one level of Combine2)
// ============================================================================

function testSingleExtendsInference() {
    const basePlugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
        },
        resources: {
            time: { default: 0 as number },
        },
        archetypes: {
            Position: ["position"],
        },
        transactions: {
            createPosition: (store: Store<any, any, any>, args: { position: number }) => {
                return store.archetypes.Position.insert(args);
            },
        },
    });

    const extendedPlugin = Database.Plugin.create({
        extends: basePlugin,
        components: {
            velocity: { type: "number" },
        },
        resources: {
            deltaTime: { default: 0.016 as number },
        },
        archetypes: {
            Moving: ["position", "velocity"],
        },
        transactions: {
            createMoving: (store: Store<any, any, any>, args: { position: number; velocity: number }) => {
                return store.archetypes.Moving.insert(args);
            },
        },
    });

    const db = Database.create(extendedPlugin);

    // Verify merged resources are inferred correctly
    type CheckResources = Assert<Equal<typeof db.resources, {
        readonly time: number;
        readonly deltaTime: number;
    }>>;

    // Verify merged transactions are inferred correctly with parameter and return types
    type CheckTransactionCreatePosition = Assert<Equal<
        typeof db.transactions.createPosition,
        (args: { position: number } | AsyncArgsProvider<{ position: number }>) => number
    >>;
    type CheckTransactionCreateMoving = Assert<Equal<
        typeof db.transactions.createMoving,
        (args: { position: number; velocity: number } | AsyncArgsProvider<{ position: number; velocity: number }>) => number
    >>;

    // @ts-expect-error - invalid transaction type check (createPosition has wrong parameter type)
    type ExpectErrorTransactionCreatePosition = Assert<Equal<
        typeof db.transactions.createPosition,
        (args: { position: string } | AsyncArgsProvider<{ position: string }>) => number
    >>;
}

// ============================================================================
// DEEP NESTING TESTS (multiple levels of Combine2)
// ============================================================================

function testDeepNestingInference() {
    const level1 = Database.Plugin.create({
        components: {
            a: { type: "number" },
        },
        resources: {
            r1: { default: 0 as number },
        },
        transactions: {
            t1: (store) => {},
        },
    });

    const level2 = Database.Plugin.create({
        extends: level1,
        components: {
            b: { type: "string" },
        },
        resources: {
            r2: { default: "" as string },
        },
        transactions: {
            t2: (store, arg: number) => {},
        },
    });

    const level3 = Database.Plugin.create({
        extends: level2,
        components: {
            c: { type: "boolean" },
        },
        resources: {
            r3: { default: false as boolean },
        },
        transactions: {
            t3: (store, args: boolean): Entity => 12,
        },
    });

    const db = Database.create(level3);

    // Verify all resources are inferred from deep nesting
    type CheckResources = Assert<Equal<typeof db.resources, {
        readonly r1: number;
        readonly r2: string;
        readonly r3: boolean;
    }>>;

    // Verify all transactions are inferred from deep nesting with correct parameter and return types
    type CheckTransactionT1 = Assert<Equal<typeof db.transactions.t1, () => void>>;
    type CheckTransactionT2 = Assert<Equal<typeof db.transactions.t2, (arg: number | AsyncArgsProvider<number>) => void>>;
    type CheckTransactionT3 = Assert<Equal<typeof db.transactions.t3, (args: boolean | AsyncArgsProvider<boolean>) => Entity>>;

    // @ts-expect-error - invalid transaction type check (t2 has wrong return type)
    type ExpectErrorTransactionT2 = Assert<Equal<
        typeof db.transactions.t2,
        (arg: number | AsyncArgsProvider<number>) => number
    >>;
}

// ============================================================================
// SYSTEMS AND ACTIONS TESTS
// ============================================================================

function testSystemsAndActionsInference() {
    const basePlugin = Database.Plugin.create({
        extends: undefined,
        components: {},
        resources: {},
        archetypes: {},
        transactions: {},
        actions: {
            baseAction: (db) => {},
            baseActionWithInput: (db, input: { value: number }) => {},
        },
        systems: {
            input: {
                create: (db) => () => {},
            },
        },
    });

    const extendedPlugin = Database.Plugin.create({
        extends: basePlugin,
        components: {},
        resources: {},
        archetypes: {},
        transactions: {},
        actions: {
            extendedAction: (db) => {},
            extendedActionWithInput: (db, input: { name: string }) => {},
        },
        systems: {
            render: {
                create: (db) => () => {},
                schedule: { after: ["input"] },
            },
        },
    });

    const db = Database.create(extendedPlugin);

    // Verify systems are inferred correctly (null when create() returns void)
    type CheckSystemInput = Assert<Equal<
        typeof db.system.functions.input,
        SystemFunction | null
    >>;
    type CheckSystemRender = Assert<Equal<
        typeof db.system.functions.render,
        SystemFunction | null
    >>;

    // @ts-expect-error - invalid system type check (input is SystemFunction | null, not () => number)
    type ExpectErrorSystemInput = Assert<Equal<
        typeof db.system.functions.input,
        () => number
    >>;

    // Verify actions are inferred correctly with parameter and return types
    // Actions without input: (db) => {} becomes () => any
    type CheckActionBaseAction = Assert<Equal<
        typeof db.actions.baseAction,
        () => void
    >>;
    // Actions with input: (db, input: T) => {} becomes (arg: T) => any
    type CheckActionBaseActionWithInput = Assert<Equal<
        typeof db.actions.baseActionWithInput,
        (arg: { value: number }) => void
    >>;
    type CheckActionExtendedAction = Assert<Equal<
        typeof db.actions.extendedAction,
        () => void
    >>;
    type CheckActionExtendedActionWithInput = Assert<Equal<
        typeof db.actions.extendedActionWithInput,
        (arg: { name: string }) => void
    >>;

    // @ts-expect-error - invalid action type check (baseActionWithInput has wrong parameter type)
    type ExpectErrorActionBaseActionWithInput = Assert<Equal<
        typeof db.actions.baseActionWithInput,
        (arg: { value: string }) => any
    >>;

    // @ts-expect-error - invalid action type check (extendedActionWithInput has wrong parameter type)
    type ExpectErrorActionExtendedActionWithInput = Assert<Equal<
        typeof db.actions.extendedActionWithInput,
        (arg: { name: number }) => any
    >>;
}

// ============================================================================
// EXTENDED DB ASSIGNABLE TO BASE DB (computed type)
// ============================================================================

/**
 * Verifies that db from an extended plugin's system create callback can be passed
 * to a function expecting the base database type. This catches the "computed:
 * unknown" bug where system create's db lacked the 8th Database parameter.
 * We use Pick to test only resources and computed (the structural assignment).
 */
function testExtendedDbAssignableToBaseDb() {
    const basePlugin = Database.Plugin.create({
        components: { pos: { type: "number" } },
        resources: { scale: { default: 1 as number } },
        archetypes: { Entity: ["pos"] },
        transactions: {},
        actions: {},
        systems: {},
    });

    type BaseDb = Database.FromPlugin<typeof basePlugin>;

    const extendedPlugin = Database.Plugin.create({
        extends: basePlugin,
        components: { vel: { type: "number" } },
        resources: {},
        archetypes: { Moving: ["pos", "vel"] },
        transactions: {},
        actions: {},
        systems: {
            update: {
                create: (db) => {
                    fnExpectingBaseResourcesAndComputed(db);
                    return () => {};
                },
            },
        },
    });

    function fnExpectingBaseResourcesAndComputed(db: Pick<BaseDb, "resources" | "computed">): number {
        return db.resources.scale;
    }
}

// ============================================================================
// EXTENDED DB ASSIGNABLE TO BASE DB (system.functions)
// ============================================================================

/**
 * Verifies that db from an extended plugin's system create callback has
 * system.functions with specific keys (not { [x: string]: ... }). This catches
 * the "S = string" bug where system create's db had an index signature.
 * We test resources + system.functions.input (avoids system.order variance).
 */
function testExtendedDbAssignableToBaseDbWithSystems() {
    const basePlugin = Database.Plugin.create({
        components: { pos: { type: "number" } },
        resources: { scale: { default: 1 as number } },
        archetypes: { Entity: ["pos"] },
        transactions: {},
        actions: {},
        systems: {
            input: { create: (db) => () => {} },
        },
    });

    type BaseDb = Database.FromPlugin<typeof basePlugin>;

    const extendedPlugin = Database.Plugin.create({
        extends: basePlugin,
        components: { vel: { type: "number" } },
        resources: {},
        archetypes: { Moving: ["pos", "vel"] },
        transactions: {},
        actions: {},
        systems: {
            update: {
                create: (db) => {
                    fnExpectingBaseResourcesAndInputSystem(db);
                    return () => {};
                },
            },
        },
    });

    type BaseResourcesAndInputSystem = Pick<BaseDb, "resources"> & {
        system: { functions: Pick<BaseDb["system"]["functions"], "input"> };
    };

    function fnExpectingBaseResourcesAndInputSystem(db: BaseResourcesAndInputSystem): number {
        return db.resources.scale + (db.system.functions.input ? 1 : 0);
    }
}
