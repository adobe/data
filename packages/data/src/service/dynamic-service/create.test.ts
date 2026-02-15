// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "../../ecs/index.js";
import { Observe } from "../../observe/index.js";
import { create, state, action } from "./create.js";
import { createPlugin } from "../../ecs/database/create-plugin.js";
import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";

// ──────────────────────────────────────────────────────────────
// Compile-time type inference checks using Assert<Equal<...>>
// These verify that Schema.ToType resolves exactly—not `any`.
// ──────────────────────────────────────────────────────────────
{
    // number schema → input: number
    action({
        description: "Number",
        schema: { type: "number" },
        execute: (input) => {
            type _Check = Assert<Equal<typeof input, number>>;
        },
    });

    // string schema → input: string
    action({
        description: "String",
        schema: { type: "string" },
        execute: (input) => {
            type _Check = Assert<Equal<typeof input, string>>;
        },
    });

    // boolean schema → input: boolean
    action({
        description: "Boolean",
        schema: { type: "boolean" },
        execute: (input) => {
            type _Check = Assert<Equal<typeof input, boolean>>;
        },
    });

    // object schema → input: { readonly hp: number; readonly name: string }
    action({
        description: "Object",
        schema: {
            type: "object",
            properties: {
                hp: { type: "number" },
                name: { type: "string" },
            },
            required: ["hp", "name"],
            additionalProperties: false,
        },
        execute: (input) => {
            type _Check = Assert<Equal<typeof input, { readonly hp: number; readonly name: string }>>;
        },
    });

    // object schema with optional property
    action({
        description: "Object with optional",
        schema: {
            type: "object",
            properties: {
                hp: { type: "number" },
                label: { type: "string" },
            },
            required: ["hp"],
            additionalProperties: false,
        },
        execute: (input) => {
            type _Check = Assert<Equal<typeof input, { readonly hp: number; readonly label?: string }>>;
        },
    });

    // state value types
    state({
        schema: { type: "number" },
        value: Observe.fromConstant(42),
    });

    state({
        schema: {
            type: "object",
            properties: {
                x: { type: "number" },
                y: { type: "number" },
            },
            required: ["x", "y"],
            additionalProperties: false,
        },
        value: Observe.fromConstant({ x: 1, y: 2 }),
    });
}

// ──────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────

const testPlugin = createPlugin({
    resources: {
        health: { default: 100 as number },
        name: { default: "" as string },
        alive: { default: true as boolean },
    },
});

const createTestDb = () => Database.create(testPlugin);

describe("DynamicService.create", () => {
    describe("type acceptance", () => {
        it("should accept matching state schema and value types", () => {
            const db = createTestDb();

            create({
                states: {
                    currentHealth: state({
                        schema: { type: "number" },
                        enabled: db.observe.resources.alive,
                        value: db.observe.resources.health,
                    }),
                },
                actions: {},
            });
        });

        it("should accept string schema with string value", () => {
            const db = createTestDb();

            create({
                states: {
                    playerName: state({
                        schema: { type: "string" },
                        enabled: db.observe.resources.alive,
                        value: db.observe.resources.name,
                    }),
                },
                actions: {},
            });
        });

        it("should accept multiple states with different schemas", () => {
            const db = createTestDb();

            create({
                states: {
                    currentHealth: state({
                        schema: { type: "number" },
                        value: db.observe.resources.health,
                    }),
                    playerName: state({
                        schema: { type: "string" },
                        value: db.observe.resources.name,
                    }),
                },
                actions: {},
            });
        });

        it("should accept action with schema-typed input", () => {
            create({
                states: {},
                actions: {
                    setHealth: action({
                        description: "Set health value",
                        schema: { type: "number" },
                        execute: async (input) => {
                            type _Check = Assert<Equal<typeof input, number>>;
                        },
                    }),
                },
            });
        });

        it("should accept action with schema: false (void execute)", () => {
            create({
                states: {},
                actions: {
                    reset: action({
                        description: "Reset to defaults",
                        schema: false,
                        execute: async () => {},
                    }),
                },
            });
        });

        it("should accept object schema with matching value type", () => {
            create({
                states: {
                    stats: state({
                        schema: {
                            type: "object",
                            properties: {
                                hp: { type: "number" },
                                label: { type: "string" },
                            },
                            required: ["hp"],
                            additionalProperties: false,
                        },
                        value: Observe.fromConstant({ hp: 50, label: "test" }),
                    }),
                },
                actions: {},
            });
        });

        it("should accept action with object schema input", () => {
            create({
                states: {},
                actions: {
                    configure: action({
                        description: "Configure settings",
                        schema: {
                            type: "object",
                            properties: {
                                hp: { type: "number" },
                                name: { type: "string" },
                            },
                            required: ["hp", "name"],
                            additionalProperties: false,
                        },
                        execute: async (input) => {
                            type _Check = Assert<Equal<typeof input, { readonly hp: number; readonly name: string }>>;
                        },
                    }),
                },
            });
        });

        it("should accept mixed actions with and without schemas", () => {
            create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        execute: async (amount) => {
                            type _Check = Assert<Equal<typeof amount, number>>;
                        },
                    }),
                    reset: action({
                        description: "Reset to defaults",
                        schema: false,
                        execute: async () => {},
                    }),
                },
            });
        });

        it("should accept synchronous void-returning execute", () => {
            let called = false;

            create({
                states: {},
                actions: {
                    sync: action({
                        description: "Sync action",
                        schema: false,
                        execute: () => { called = true; },
                    }),
                    syncWithInput: action({
                        description: "Sync with input",
                        schema: { type: "number" },
                        execute: (input) => {
                            type _Check = Assert<Equal<typeof input, number>>;
                        },
                    }),
                },
            });
        });

        it("should accept omitted enabled (defaults to always true)", () => {
            const db = createTestDb();

            create({
                states: {
                    health: state({
                        schema: { type: "number" },
                        value: db.observe.resources.health,
                    }),
                },
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        execute: async (input) => {},
                    }),
                },
            });
        });
    });

    describe("type rejection", () => {
        it("should reject mismatched state value type (number schema, string value)", () => {
            const db = createTestDb();

            state({
                schema: { type: "number" },
                // @ts-expect-error - string value does not match number schema
                value: db.observe.resources.name,
            });
        });

        it("should reject mismatched state value type (string schema, number value)", () => {
            const db = createTestDb();

            state({
                schema: { type: "string" },
                // @ts-expect-error - number value does not match string schema
                value: db.observe.resources.health,
            });
        });

        it("should reject action execute with wrong input type", () => {
            action({
                description: "Set health value",
                schema: { type: "number" },
                // @ts-expect-error - execute receives string but schema requires number
                execute: async (input: string) => {},
            });
        });

        it("should reject void action that declares an input parameter", () => {
            // @ts-expect-error - schema: false means no input parameter
            action({
                description: "Reset to defaults",
                schema: false,
                execute: async (input: number) => {},
            });
        });
    });

    describe("serviceName", () => {
        it("should set serviceName for isService compatibility", () => {
            const service = create({ states: {}, actions: {} });
            expect(service.serviceName).toBe("dynamic-service");
        });
    });

    describe("enabled defaults", () => {
        it("should default state enabled to always true when omitted", async () => {
            const db = createTestDb();

            const service = create({
                states: {
                    health: state({
                        schema: { type: "number" },
                        value: db.observe.resources.health,
                    }),
                },
                actions: {},
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("health");
            expect(states.health.value).toBe(100);
        });

        it("should default action enabled to always true when omitted", async () => {
            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        execute: async (input) => {},
                    }),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("heal");
        });
    });

    describe("states observable", () => {
        it("should emit enabled states with resolved values", async () => {
            const db = createTestDb();

            const service = create({
                states: {
                    currentHealth: state({
                        schema: { type: "number" },
                        value: db.observe.resources.health,
                    }),
                },
                actions: {},
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("currentHealth");
            expect(states.currentHealth.schema).toEqual({ type: "number" });
            expect(states.currentHealth.value).toBe(100);
        });

        it("should omit disabled states", async () => {
            const db = createTestDb();

            const service = create({
                states: {
                    visible: state({
                        schema: { type: "number" },
                        enabled: Observe.fromConstant(true),
                        value: db.observe.resources.health,
                    }),
                    hidden: state({
                        schema: { type: "string" },
                        enabled: Observe.fromConstant(false),
                        value: db.observe.resources.name,
                    }),
                },
                actions: {},
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("visible");
            expect(states).not.toHaveProperty("hidden");
        });

        it("should update when enabled changes", () => {
            const db = createTestDb();
            const [enabledObserve, setEnabled] = Observe.createState(true);

            const service = create({
                states: {
                    health: state({
                        schema: { type: "number" },
                        enabled: enabledObserve,
                        value: db.observe.resources.health,
                    }),
                },
                actions: {},
            });

            const results: unknown[] = [];
            service.states((s) => results.push(s));

            expect(Object.keys(results[0] as object)).toContain("health");

            setEnabled(false);
            expect(Object.keys(results[1] as object)).not.toContain("health");

            setEnabled(true);
            expect(Object.keys(results[2] as object)).toContain("health");
        });

        it("should update when value changes", () => {
            const [healthObserve, setHealth] = Observe.createState(100);

            const service = create({
                states: {
                    health: state({
                        schema: { type: "number" },
                        value: healthObserve,
                    }),
                },
                actions: {},
            });

            const results: unknown[] = [];
            service.states((s) => results.push(s));

            expect((results[0] as any).health.value).toBe(100);

            setHealth(50);
            expect((results[1] as any).health.value).toBe(50);
        });
    });

    describe("actions observable", () => {
        it("should emit enabled actions with bound execute", async () => {
            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        execute: async (amount) => {},
                    }),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("heal");
            expect(actions.heal.description).toBe("Heal player");
            expect(actions.heal.schema).toEqual({ type: "number" });
            expect(typeof actions.heal.execute).toBe("function");
        });

        it("should omit disabled actions", async () => {
            const service = create({
                states: {},
                actions: {
                    available: action({
                        description: "Available action",
                        schema: { type: "number" },
                        enabled: Observe.fromConstant(true),
                        execute: async (input) => {},
                    }),
                    unavailable: action({
                        description: "Unavailable action",
                        schema: false,
                        enabled: Observe.fromConstant(false),
                        execute: async () => {},
                    }),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("available");
            expect(actions).not.toHaveProperty("unavailable");
        });

        it("should update when enabled changes", () => {
            const [enabledObserve, setEnabled] = Observe.createState(true);

            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        enabled: enabledObserve,
                        execute: async (input) => {},
                    }),
                },
            });

            const results: unknown[] = [];
            service.actions((a) => results.push(a));

            expect(Object.keys(results[0] as object)).toContain("heal");

            setEnabled(false);
            expect(Object.keys(results[1] as object)).not.toContain("heal");
        });
    });

    describe("execute", () => {
        it("should dispatch to the correct action with input", async () => {
            let received: number | undefined;

            const service = create({
                states: {},
                actions: {
                    setHealth: action({
                        description: "Set health value",
                        schema: { type: "number" },
                        execute: async (input) => { received = input; },
                    }),
                },
            });

            const result = await service.execute("setHealth", 42);
            expect(received).toBe(42);
            expect(result).toBeUndefined();
        });

        it("should dispatch void action (no input)", async () => {
            let called = false;

            const service = create({
                states: {},
                actions: {
                    reset: action({
                        description: "Reset to defaults",
                        schema: false,
                        execute: async () => { called = true; },
                    }),
                },
            });

            await service.execute("reset", undefined);
            expect(called).toBe(true);
        });

        it("should dispatch synchronous void action", async () => {
            let called = false;

            const service = create({
                states: {},
                actions: {
                    sync: action({
                        description: "Sync action",
                        schema: false,
                        execute: () => { called = true; },
                    }),
                },
            });

            await service.execute("sync", undefined);
            expect(called).toBe(true);
        });

        it("should return error for unavailable action", async () => {
            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        enabled: Observe.fromConstant(false),
                        execute: async (input) => {},
                    }),
                },
            });

            const result = await service.execute("heal", 10);
            expect(typeof result).toBe("string");
        });

        it("should return error for nonexistent action", async () => {
            const service = create({
                states: {},
                actions: {},
            });

            const result = await service.execute("doesNotExist", undefined);
            expect(typeof result).toBe("string");
        });

        it("should propagate ActionError from execute", async () => {
            const service = create({
                states: {},
                actions: {
                    fail: action({
                        description: "Failing action",
                        schema: false,
                        execute: async () => "something went wrong",
                    }),
                },
            });

            const result = await service.execute("fail", undefined);
            expect(result).toBe("something went wrong");
        });

        it("should reject action that was available but is now disabled", async () => {
            const [enabledObserve, setEnabled] = Observe.createState(true);
            let called = false;

            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        enabled: enabledObserve,
                        execute: async (input) => { called = true; },
                    }),
                },
            });

            const ok = await service.execute("heal", 10);
            expect(called).toBe(true);
            expect(ok).toBeUndefined();

            called = false;
            setEnabled(false);

            const err = await service.execute("heal", 10);
            expect(called).toBe(false);
            expect(typeof err).toBe("string");
        });
    });

    describe("independent conditional toggles", () => {
        it("should toggle states independently", () => {
            const db = createTestDb();
            const [enableA, setEnableA] = Observe.createState(true);
            const [enableB, setEnableB] = Observe.createState(true);

            const service = create({
                states: {
                    health: state({
                        schema: { type: "number" },
                        enabled: enableA,
                        value: db.observe.resources.health,
                    }),
                    name: state({
                        schema: { type: "string" },
                        enabled: enableB,
                        value: db.observe.resources.name,
                    }),
                },
                actions: {},
            });

            const results: Record<string, unknown>[] = [];
            service.states((s) => results.push(s));

            expect(Object.keys(results[0])).toEqual(
                expect.arrayContaining(["health", "name"])
            );

            setEnableA(false);
            expect(results[1]).not.toHaveProperty("health");
            expect(results[1]).toHaveProperty("name");

            setEnableB(false);
            expect(Object.keys(results[2])).toEqual([]);

            setEnableB(true);
            expect(results[3]).not.toHaveProperty("health");
            expect(results[3]).toHaveProperty("name");
        });

        it("should toggle actions independently", () => {
            const [enableHeal, setEnableHeal] = Observe.createState(true);
            const [enableReset, setEnableReset] = Observe.createState(true);

            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        enabled: enableHeal,
                        execute: async (input) => {},
                    }),
                    reset: action({
                        description: "Reset to defaults",
                        schema: false,
                        enabled: enableReset,
                        execute: async () => {},
                    }),
                },
            });

            const results: Record<string, unknown>[] = [];
            service.actions((a) => results.push(a));

            expect(Object.keys(results[0])).toEqual(
                expect.arrayContaining(["heal", "reset"])
            );

            setEnableHeal(false);
            expect(results[1]).not.toHaveProperty("heal");
            expect(results[1]).toHaveProperty("reset");

            setEnableHeal(true);
            setEnableReset(false);
            const latest = results[results.length - 1];
            expect(latest).toHaveProperty("heal");
            expect(latest).not.toHaveProperty("reset");
        });
    });

    describe("bound action execute", () => {
        it("should execute action directly from actions observable", async () => {
            let received: number | undefined;

            const service = create({
                states: {},
                actions: {
                    heal: action({
                        description: "Heal player",
                        schema: { type: "number" },
                        execute: async (input) => { received = input; },
                    }),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            await (actions.heal.execute as (input: unknown) => Promise<void>)(77);
            expect(received).toBe(77);
        });

        it("should execute void action directly from actions observable", async () => {
            let called = false;

            const service = create({
                states: {},
                actions: {
                    reset: action({
                        description: "Reset to defaults",
                        schema: false,
                        execute: async () => { called = true; },
                    }),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            await (actions.reset.execute as () => Promise<void>)();
            expect(called).toBe(true);
        });

        it("should propagate ActionError from bound action execute", async () => {
            const service = create({
                states: {},
                actions: {
                    fail: action({
                        description: "Failing action",
                        schema: false,
                        execute: async () => "bound error",
                    }),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            const result = await (actions.fail.execute as () => Promise<unknown>)();
            expect(result).toBe("bound error");
        });
    });
});
