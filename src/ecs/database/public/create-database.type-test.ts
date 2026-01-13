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
import { Database } from "../database.js";
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
 * The tests verify type correctness by:
 * - Assigning inferred types to variables with explicit type annotations (compiles if types match)
 * - Using the inferred types in function calls and property access (compiles if types are correct)
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

    // Verify resources are inferred correctly (type works, not exact equality)
    const timeResource: number = db.resources.time;

    // Verify transaction parameter types and return types
    const createPositionFn: (args: { position: number }) => number = db.transactions.createPosition;

    // Verify transaction can be called with correct parameter types and returns correct type
    const entityId: number = db.transactions.createPosition({ position: 1 });
    // Verify incorrect parameter types would fail (commented out - would cause compile error)
    // const _badCall = db.transactions.createPosition({ position: "wrong" }); // Should fail
    // const _badCall2 = db.transactions.createPosition({ wrong: 1 }); // Should fail
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
        extends: basePlugin,
    });

    const db = Database.create(extendedPlugin);

    // Verify merged resources are inferred correctly (type works, not exact equality)
    const timeResource: number = db.resources.time;
    const deltaTimeResource: number = db.resources.deltaTime;

    // Verify transaction parameter types and return types
    const createPositionFn: (args: { position: number }) => number = db.transactions.createPosition;
    const createMovingFn: (args: { position: number; velocity: number }) => number = db.transactions.createMoving;

    // Verify transactions can be called with correct parameter types and return correct types
    const posId: number = db.transactions.createPosition({ position: 1 });
    const movId: number = db.transactions.createMoving({ position: 2, velocity: 3 });
    // Verify incorrect parameter types would fail (commented out - would cause compile error)
    // const _badCall1 = db.transactions.createPosition({ position: "wrong" }); // Should fail
    // const _badCall2 = db.transactions.createMoving({ position: 1 }); // Missing velocity - should fail
    // const _badCall3 = db.transactions.createMoving({ position: 1, velocity: "wrong" }); // Wrong type - should fail
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
        components: {
            b: { type: "string" },
        },
        resources: {
            r2: { default: "" as string },
        },
        transactions: {
            t2: (store, arg: number) => {},
        },
        extends: level1,
    });

    const level3 = Database.Plugin.create({
        components: {
            c: { type: "boolean" },
        },
        resources: {
            r3: { default: false as boolean },
        },
        transactions: {
            t3: (store, args: boolean): Entity => 12,
        },
        extends: level2,
    });

    const db = Database.create(level3);

    // Verify all resources are inferred from deep nesting (type works, not exact equality)
    type CheckResources = Assert<Equal<typeof db.resources, {
        readonly r1: number;
        readonly r2: string;
        readonly r3: boolean;
    }>>;

    // Verify all transactions are inferred from deep nesting with correct parameter and return types
    type CheckTransactionT1 = Assert<Equal<typeof db.transactions.t1, () => void>>;
    type CheckTransactionT2 = Assert<Equal<typeof db.transactions.t2, (arg: number | AsyncArgsProvider<number>) => void>>;
    type CheckTransactionT3 = Assert<Equal<typeof db.transactions.t3, (args: boolean | AsyncArgsProvider<boolean>) => Entity>>;

    // @ts-expect-error - invalid transaction call (t4 does not exist)
    type ExpectErrorTransactionT2 = Assert<Equal<typeof db.transactions.t2, (arg: number | AsyncArgsProvider<number>) => number>>;1
}

// ============================================================================
// SYSTEMS AND ACTIONS TESTS
// ============================================================================
