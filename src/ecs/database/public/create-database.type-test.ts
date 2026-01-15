/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

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

    // Verify systems are inferred correctly
    type CheckSystemInput = Assert<Equal<
        typeof db.system.functions.input,
        SystemFunction
    >>;
    type CheckSystemRender = Assert<Equal<
        typeof db.system.functions.render,
        SystemFunction
    >>;

    // @ts-expect-error - invalid system type check (input has wrong return type)
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
