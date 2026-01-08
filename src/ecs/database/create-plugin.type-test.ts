/*MIT License

© Copyright 2026 Adobe. All rights reserved.

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

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";

/**
 * Type-only tests for createPlugin type inference and constraints.
 * 
 * These tests verify that:
 * 1. Type inference works correctly for all valid plugin configurations
 * 2. Invalid property usage is properly blocked by TypeScript
 * 
 * Note: These are compile-time type checks only - they don't need to execute.
 */

// ============================================================================
// VALID TYPE INFERENCE TESTS
// ============================================================================

function validTypeInferenceTests() {
    // Test: Empty plugin inference
    const emptyPlugin = createPlugin({});
    // type CheckEmptyPlugin = Assert<Equal<typeof emptyPlugin, Database.Plugin<{}, {}, {}, {}, never, {}>>>;

    // Test: Valid archetype component references
    const validArchetypePlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        },
        archetypes: {
            A: ["a", "b"],
            ABTransient: ["a", "b", "transient"],
            Transient: ["transient"],
        }
    });

    // Test: Valid transactions with components, resources, and archetypes
    const validTransactionPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        },
        resources: {
            c: { default: false as boolean }
        },
        archetypes: {
            A: ["a", "b"],
            ABTransient: ["a", "b", "transient"],
        },
        transactions: {
            testChanges: (store) => {
                // valid resource assignment
                store.resources.c = true;
                // valid archetype 
                store.archetypes.A.insert({ a: 1, b: "2" });
                // valid update
                store.update(0, { a: 2 });
            }
        },
    });

    // Test: Valid systems with transactions
    const validSystemPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        },
        resources: {
            c: { default: false as boolean }
        },
        archetypes: {
            A: ["a", "b"],
        },
        transactions: {
            testChanges: (store) => {
                store.resources.c = true;
            }
        },
        systems: {
            update: {
                create: (db) => () => {
                    db.transactions.testChanges();
                }
            },
            render: {
                create: (db) => () => {},
                schedule: {
                    after: ["update"],
                }
            }
        },
    });

    // Test: Valid base plugin with all properties
    const basePlugin = createPlugin({
        components: {
            alpha: { type: "number" },
            beta: { type: "string" }
        },
        resources: {
            charlie: { default: false as boolean }
        },
        archetypes: {
            Foo: ["alpha", "beta"],
            FooTransient: ["alpha", "beta", "transient"],
        },
        transactions: {
            doAlpha: (store, input: { a: number, b: string }) => {},
            doBeta: (store) => {}
        },
        actions: {
            doAction: (db) => {
                db.transactions.doAlpha({ a: 1, b: "2" });
                db.transactions.doBeta();
            },
            doOtherAction: (db) => {
            }
        },
        systems: {
            input: {
                create: (db) => () => {
                    db.transactions.doAlpha({ a: 1, b: "2" });
                    db.transactions.doBeta();
                }
            },
            output: {
                create: (db) => () => {
                    db.actions.doAction();
                    db.actions.doOtherAction();
                }
            }
        },
    });
    type ActionsType = typeof basePlugin extends Database.Plugin<any, any, any, any, any, infer A> ? A : never;

    // Test: Valid extended plugin accessing base plugin properties
    const extendedPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" },
        },
        resources: {
            c: { default: false as boolean }
        },
        archetypes: {
            A: ["a", "b", "alpha", "beta"],
            ABTransient: ["a", "b", "alpha", "beta", "transient"],
        },
        transactions: {
            testChanges: (store) => {
                // assign to resources from this plugin
                store.resources.c = true;
                type CheckResources = Assert<Equal<typeof store.resources, {
                    c: boolean;
                    charlie: boolean;
                }>>;
                // valid archetype 
                store.archetypes.A.insert({ a: 1, b: "2", alpha: 3, beta: "4" });
                // valid update using base components
                store.update(0, { a: 2, alpha: 3 });
            }
        },
        systems: {
            update: {
                create: (db) => () => {
                    db.transactions.doAlpha({ a: 1, b: "2" });
                    db.transactions.doBeta();
                    db.transactions.testChanges();
                },
                schedule: {},
            },
            render: {
                create: (db) => () => {
                    db.transactions.testChanges();
                },
                schedule: {},
            }
        },
        actions: {
            doExtendedAction: (db) => {
                db.transactions.doAlpha({ a: 1, b: "2" });
                db.transactions.doBeta();
                db.transactions.testChanges();
            },
            doOtherExtendedAction: (db) => {
            }
        },
        extends: basePlugin
    });
}

// ============================================================================
// INVALID TYPE INFERENCE TESTS
// ============================================================================

/**
 * ⚠️ CRITICAL: Why Invalid Tests Must Be Isolated
 * 
 * Invalid type tests (those using @ts-expect-error) MUST be in separate
 * plugin definitions from valid tests. This is because:
 * 
 * 1. **Type Inference Failure Propagation**: When TypeScript encounters a type
 *    error in a plugin definition, it can cause the entire plugin's type
 *    inference to fail or degrade. This means that if you have both valid and
 *    invalid usage in the same plugin, the invalid errors can break the
 *    inference for the valid parts, making it impossible to verify that valid
 *    code actually works correctly.
 * 
 * 2. **Constraint Satisfaction**: The createPlugin function uses complex
 *    generic constraints that depend on all properties being valid. If one
 *    property has an error, TypeScript may fail to satisfy the constraints
 *    for other properties, even if those other properties are themselves valid.
 * 
 * 3. **Type Narrowing**: Errors in one part of a plugin can cause TypeScript
 *    to narrow types incorrectly or give up on inference entirely, leading to
 *    `any` types or overly permissive types that don't actually test what we
 *    want to test.
 * 
 * 4. **Test Isolation**: By isolating invalid tests, we ensure that:
 *    - Each test verifies exactly one constraint
 *    - Valid inference tests aren't affected by invalid ones
 *    - We can verify that our type system actually blocks invalid usage
 *      rather than just allowing `any` types
 * 
 * Therefore, each invalid test below is in its own isolated plugin definition
 * that only tests the specific invalid usage pattern.
 */

// Test: Invalid archetype component reference (no components defined)
function invalidArchetypeComponentReference() {
    createPlugin({
        archetypes: {
            // @ts-expect-error - invalid archetype reference (component "bar" does not exist)
            InvalidArchetype: ["bar"],
        }
    });
}

// Test: Invalid archetype component reference (component not in schema)
function invalidArchetypeComponentReference2() {
    createPlugin({
        components: {
            a: { type: "number" }
        },
        archetypes: {
            // @ts-expect-error - invalid archetype reference (component "b" does not exist)
            InvalidArchetype: ["b"],
        }
    });
}

// Test: Invalid resource access in transaction
function invalidResourceAccessInTransaction() {
    createPlugin({
        resources: {
            c: { default: false as boolean }
        },
        transactions: {
            testChanges: (store) => {
                // @ts-expect-error - invalid resource assignment (resource "d" does not exist)
                store.resources.d = true;
            }
        },
    });
}

// Test: Invalid archetype access in transaction
function invalidArchetypeAccessInTransaction() {
    createPlugin({
        components: {
            a: { type: "number" }
        },
        archetypes: {
            A: ["a"],
        },
        transactions: {
            testChanges: (store) => {
                // @ts-expect-error - invalid archetype reference (archetype "foo" does not exist)
                store.archetypes.foo;
            }
        },
    });
}

// Test: Invalid component update in transaction
function invalidComponentUpdateInTransaction() {
    createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        },
        transactions: {
            testChanges: (store) => {
                // @ts-expect-error - invalid update (component "d" does not exist)
                store.update(0, { d: 10 });
            }
        },
    });
}

// Test: Invalid system self-reference in schedule
function invalidSystemSelfReference() {
    createPlugin({
        systems: {
            render: {
                create: (db) => () => {},
                schedule: {
                    // @ts-expect-error - render would be a self-reference (prevented by Exclude<S | SX, K>)
                    before: ["render"],
                }
            }
        },
    });
}

// Test: Invalid system reference in schedule
function invalidSystemReference() {
    createPlugin({
        systems: {
            update: {
                create: (db) => () => {},
            },
            render: {
                create: (db) => () => {},
                schedule: {
                    // @ts-expect-error - invalid system reference (system "invalid" does not exist)
                    during: ["invalid"],
                }
            }
        },
    });
}

// Test: Invalid transaction call in action
function invalidTransactionCallInAction() {
    createPlugin({
        transactions: {
            validTransaction: (store) => {},
        },
        actions: {
            doAction: (db) => {
                // @ts-expect-error - invalid transaction call (transaction "doesNotExist" does not exist)
                db.transactions.doesNotExist();
            }
        },
    });
}

// Test: Invalid action call in system
function invalidActionCallInSystem() {
    createPlugin({
        actions: {
            validAction: (db) => {},
        },
        systems: {
            testSystem: {
                create: (db) => () => {
                    // @ts-expect-error - invalid action call (action "doesNotExist" does not exist)
                    db.actions.doesNotExist();
                }
            }
        },
    });
}

// Test: Invalid resource access in system
function invalidResourceAccessInSystem() {
    createPlugin({
        resources: {
            validResource: { default: 0 as number }
        },
        systems: {
            testSystem: {
                create: (db) => () => {
                    // @ts-expect-error - invalid resource access (resource "invalidResource" does not exist)
                    const value = db.resources.invalidResource;
                }
            }
        },
    });
}

// Test: Invalid archetype access in system
function invalidArchetypeAccessInSystem() {
    createPlugin({
        components: {
            a: { type: "number" }
        },
        archetypes: {
            A: ["a"],
        },
        systems: {
            testSystem: {
                create: (db) => () => {
                    // @ts-expect-error - invalid archetype access (archetype "invalid" does not exist)
                    db.archetypes.invalid;
                }
            }
        },
    });
}

// Test: Invalid extended plugin - invalid resource access
function invalidExtendedPluginResourceAccess() {
    const basePlugin = createPlugin({
        resources: {
            charlie: { default: false as boolean }
        },
    });

    createPlugin({
        resources: {
            c: { default: false as boolean }
        },
        transactions: {
            testChanges: (store) => {
                // @ts-expect-error - invalid resource assignment (resource "delta" does not exist in base or current)
                store.resources.delta = true;
            }
        },
        extends: basePlugin
    });
}

// Test: Invalid extended plugin - invalid archetype access
function invalidExtendedPluginArchetypeAccess() {
    const basePlugin = createPlugin({
        components: {
            alpha: { type: "number" }
        },
        archetypes: {
            Foo: ["alpha"],
        },
    });

    createPlugin({
        components: {
            a: { type: "number" }
        },
        transactions: {
            testChanges: (store) => {
                // @ts-expect-error - invalid archetype reference (archetype "foo" does not exist in base or current)
                store.archetypes.foo;
            }
        },
        extends: basePlugin
    });
}

// Test: Invalid extended plugin - invalid system reference in schedule
function invalidExtendedPluginSystemReference() {
    const basePlugin = createPlugin({
        systems: {
            input: {
                create: (db) => () => {},
            }
        },
    });

    createPlugin({
        systems: {
            render: {
                create: (db) => () => {},
                schedule: {
                    // @ts-expect-error - invalid system reference (system "invalid" does not exist in base or current)
                    after: ["invalid"],
                }
            }
        },
        extends: basePlugin
    });
}

// Test: Invalid extended plugin - invalid transaction call
function invalidExtendedPluginTransactionCall() {
    const basePlugin = createPlugin({
        transactions: {
            doAlpha: (store) => {},
        },
    });

    createPlugin({
        systems: {
            testSystem: {
                create: (db) => () => {
                    // @ts-expect-error - invalid transaction call (transaction "doesNotExist" does not exist)
                    db.transactions.doesNotExist();

                    db.transactions.doAlpha();

                    // @ts-expect-error - invalid transaction call (transaction "doAlpha" does not takes input)
                    db.transactions.doAlpha({ a: 1, b: "2" });
                }
            }
        },
        extends: basePlugin
    });
}

// Test: Invalid extended plugin - invalid action call
function invalidExtendedPluginActionCall() {
    const basePlugin = createPlugin({
        actions: {
            doAction: (db) => {},
        },
    });

    createPlugin({
        systems: {
            testSystem: {
                create: (db) => () => {
                    // @ts-expect-error - invalid action call (action "doesNotExist" does not exist)
                    db.actions.doesNotExist();

                    db.actions.doAction();

                    // @ts-expect-error - invalid action call (action "doAction" does not take input)
                    db.actions.doAction({ a: 1, b: "2" });
                }
            }
        },
        extends: basePlugin
    });
}

// Test: Invalid action call in action (same plugin) - actions can only call actions from extended plugin
function invalidActionCallInActionSamePlugin() {
    createPlugin({
        actions: {
            action1: (db) => {
                // @ts-expect-error - actions cannot call other actions from same plugin (only from extended plugin)
                db.actions.action2();
            },
            action2: (db) => {},
        },
    });
}

// Test: Invalid component access in transaction (component doesn't exist)
function invalidComponentAccessInTransaction() {
    createPlugin({
        components: {
            a: { type: "number" }
        },
        transactions: {
            testChanges: (store) => {
                // @ts-expect-error - invalid component access (component "b" does not exist)
                const value = store.components.b;
            }
        },
    });
}

// Test: Invalid component access in system (component doesn't exist)
function invalidComponentAccessInSystem() {
    createPlugin({
        components: {
            a: { type: "number" }
        },
        systems: {
            testSystem: {
                create: (db) => () => {
                    // @ts-expect-error - invalid component access (component "b" does not exist)
                    const value = db.components.b;
                }
            }
        },
    });
}

// Test: Valid action call in action (from extended plugin)
function validActionCallInActionFromExtended() {
    const basePlugin = createPlugin({
        actions: {
            baseAction: (db) => {},
        },
    });

    createPlugin({
        actions: {
            extendedAction: (db) => {
                // Valid - can call actions from extended plugin
                db.actions.baseAction();
            }
        },
        extends: basePlugin
    });
}

// Test: Valid use of return types from inherited actions in new actions
function validInheritedActionReturnTypes() {
    const basePlugin = createPlugin({
        actions: {
            getUserId: (db) => {
                return 42 as number;
            },
            getUserName: (db) => {
                return "Alice" as string;
            },
            getUserData: (db) => {
                return { id: 1, name: "Bob" } as { id: number; name: string };
            },
        },
    });

    createPlugin({
        actions: {
            extendedAction: (db) => {
                // Valid - can use return types from inherited actions
                const userId: number = db.actions.getUserId();
                const userName: string = db.actions.getUserName();
                const userData: { id: number; name: string } = db.actions.getUserData();
                
                // Valid - can use return values in expressions
                const combined = `${userName} (${userId})`;
                const isValid = userData.id > 0;
                
                return { userId, userName, userData, combined, isValid };
            },
            anotherExtendedAction: (db) => {
                // Valid - can chain return values
                const id = db.actions.getUserId();
                const name = db.actions.getUserName();
                return { id, name };
            }
        },
        extends: basePlugin
    });
}

// Test: Valid async actions that await inherited async actions with return types
function validAsyncInheritedActionReturnTypes() {
    const basePlugin = createPlugin({
        actions: {
            async fetchUserData(db) {
                return { id: 1, name: "Alice" };
            },
            async fetchUserId(db) {
                return 42;
            },
            async fetchUserName(db) {
                return "Bob";
            },
        },
    });

    createPlugin({
        actions: {
            async extendedAsyncAction(db): Promise<{ user: { id: number; name: string }; combined: string }> {
                // Valid - can await inherited async actions and use their return types
                const userData: { id: number; name: string } = await db.actions.fetchUserData();
                const userId: number = await db.actions.fetchUserId();
                const userName: string = await db.actions.fetchUserName();
                
                // Valid - can use awaited return values in expressions
                const combined = `${userName} (${userId})`;
                
                return { user: userData, combined };
            },
            async anotherExtendedAsyncAction(db): Promise<number> {
                // Valid - can await and chain async actions
                const user = await db.actions.fetchUserData();
                const id = await db.actions.fetchUserId();
                return user.id + id;
            },
            async mixedAsyncAction(db): Promise<string> {
                // Valid - can mix async and sync inherited actions
                const userData = await db.actions.fetchUserData();
                return userData.name;
            }
        },
        extends: basePlugin
    });
}

// Test: Valid mixed sync and async inherited actions with return types
function validMixedSyncAsyncInheritedActions() {
    const basePlugin = createPlugin({
        actions: {
            syncAction: (db) => {
                return "sync" as string;
            },
            async asyncAction(db): Promise<number> {
                return 100;
            },
        },
    });

    createPlugin({
        actions: {
            async extendedMixedAction(db): Promise<{ sync: string; async: number }> {
                // Valid - can use sync inherited action return type
                const syncValue: string = db.actions.syncAction();
                
                // Valid - can await async inherited action and use return type
                const asyncValue: number = await db.actions.asyncAction();
                
                return { sync: syncValue, async: asyncValue };
            },
            syncExtendedAction: (db) => {
                // Valid - can use sync inherited action return type in sync action
                const syncValue: string = db.actions.syncAction();
                return syncValue.toUpperCase();
            }
        },
        extends: basePlugin
    });
}

