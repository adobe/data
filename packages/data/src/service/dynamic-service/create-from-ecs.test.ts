// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "../../ecs/index.js";
import { Observe } from "../../observe/index.js";
import { createFromEcs } from "./create-from-ecs.js";
import { createPlugin } from "../../ecs/database/create-plugin.js";

const testPlugin = createPlugin({
    resources: {
        health: { default: 100 as number },
        name: { default: "" as string },
        alive: { default: true as boolean },
    },
});

const createTestDb = () => Database.create(testPlugin);

describe("createFromEcs", () => {
    describe("type acceptance", () => {
        it("should accept matching state schema and value types", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    currentHealth: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        value: (db) => db.observe.resources.health,
                    },
                },
                actions: {},
            });
        });

        it("should accept string schema with string value", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    playerName: {
                        schema: { type: "string" },
                        enabled: (db) => db.observe.resources.alive,
                        value: (db) => db.observe.resources.name,
                    },
                },
                actions: {},
            });
        });

        it("should accept multiple states with different schemas", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    currentHealth: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        value: (db) => db.observe.resources.health,
                    },
                    playerName: {
                        schema: { type: "string" },
                        enabled: (db) => db.observe.resources.alive,
                        value: (db) => db.observe.resources.name,
                    },
                },
                actions: {},
            });
        });

        it("should accept action with schema-typed input", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {},
                actions: {
                    setHealth: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        execute: async (db, input) => {
                            const _check: number = input;
                        },
                    },
                },
            });
        });

        it("should accept action with schema: false (void execute)", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {},
                actions: {
                    reset: {
                        schema: false,
                        enabled: (db) => db.observe.resources.alive,
                        execute: async (db) => {},
                    },
                },
            });
        });

        it("should accept object schema with matching value type", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    stats: {
                        schema: {
                            type: "object",
                            properties: {
                                hp: { type: "number" },
                                label: { type: "string" },
                            },
                            required: ["hp"],
                            additionalProperties: false,
                        },
                        enabled: (db) => db.observe.resources.alive,
                        value: (db) => Observe.fromConstant({ hp: 50, label: "test" }),
                    },
                },
                actions: {},
            });
        });

        it("should accept action with object schema input", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {},
                actions: {
                    configure: {
                        schema: {
                            type: "object",
                            properties: {
                                hp: { type: "number" },
                                name: { type: "string" },
                            },
                            required: ["hp", "name"],
                            additionalProperties: false,
                        },
                        enabled: (db) => db.observe.resources.alive,
                        execute: async (db, input) => {
                            const _hp: number = input.hp;
                            const _name: string = input.name;
                        },
                    },
                },
            });
        });

        it("should accept mixed actions with and without schemas", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        execute: async (db, amount) => {
                            const _check: number = amount;
                        },
                    },
                    reset: {
                        schema: false,
                        enabled: (db) => db.observe.resources.alive,
                        execute: async (db) => {},
                    },
                },
            });
        });
    });

    describe("type rejection", () => {
        it("should reject mismatched state value type (number schema, string value)", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    currentHealth: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        // @ts-expect-error - string value does not match number schema
                        value: (db) => db.observe.resources.name,
                    },
                },
                actions: {},
            });
        });

        it("should reject mismatched state value type (string schema, number value)", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    playerName: {
                        schema: { type: "string" },
                        enabled: (db) => db.observe.resources.alive,
                        // @ts-expect-error - number value does not match string schema
                        value: (db) => db.observe.resources.health,
                    },
                },
                actions: {},
            });
        });

        it("should reject access to nonexistent db resource in state value", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    missing: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        // @ts-expect-error - nonExistent resource does not exist on db
                        value: (db) => db.observe.resources.nonExistent,
                    },
                },
                actions: {},
            });
        });

        it("should reject access to nonexistent db resource in enabled", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {
                    test: {
                        schema: { type: "number" },
                        // @ts-expect-error - nonExistent resource does not exist on db
                        enabled: (db) => db.observe.resources.nonExistent,
                        value: (db) => db.observe.resources.health,
                    },
                },
                actions: {},
            });
        });

        it("should reject action execute with wrong input type", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {},
                actions: {
                    setHealth: {
                        schema: { type: "number" },
                        enabled: (db) => db.observe.resources.alive,
                        // @ts-expect-error - execute receives string but schema requires number
                        execute: async (db, input: string) => {},
                    },
                },
            });
        });

        it("should reject void action that declares an input parameter", () => {
            const db = createTestDb();

            createFromEcs(db, {
                states: {},
                actions: {
                    reset: {
                        schema: false,
                        enabled: (db) => db.observe.resources.alive,
                        // @ts-expect-error - schema: false means no input parameter
                        execute: async (db, input: number) => {},
                    },
                },
            });
        });

        it("should reject access to nonexistent db resource in action", () => {
            const db = createTestDb();

            // Runtime throws because @ts-expect-error suppresses the type error
            // but the nonexistent resource produces undefined at runtime.
            // We only care that the type error is flagged at compile time.
            try {
                createFromEcs(db, {
                    states: {},
                    actions: {
                        doThing: {
                            schema: { type: "number" },
                            // @ts-expect-error - nonExistent resource does not exist on db
                            enabled: (db) => db.observe.resources.nonExistent,
                            execute: async (db, input) => {},
                        },
                    },
                });
            } catch (_) { /* expected runtime error from undefined observable */ }
        });
    });

    describe("serviceName", () => {
        it("should set serviceName for isService compatibility", () => {
            const db = createTestDb();
            const service = createFromEcs(db, { states: {}, actions: {} });
            expect(service.serviceName).toBe("dynamic-service");
        });
    });

    describe("states observable", () => {
        it("should emit enabled states with resolved values", async () => {
            const db = createTestDb();
            const service = createFromEcs(db, {
                states: {
                    currentHealth: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        value: (db) => db.observe.resources.health,
                    },
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
            const service = createFromEcs(db, {
                states: {
                    visible: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        value: (db) => db.observe.resources.health,
                    },
                    hidden: {
                        schema: { type: "string" },
                        enabled: () => Observe.fromConstant(false),
                        value: (db) => db.observe.resources.name,
                    },
                },
                actions: {},
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("visible");
            expect(states).not.toHaveProperty("hidden");
        });

        it("should update when enabled changes", async () => {
            const db = createTestDb();
            const [enabledObserve, setEnabled] = Observe.createState(true);

            const service = createFromEcs(db, {
                states: {
                    health: {
                        schema: { type: "number" },
                        enabled: () => enabledObserve,
                        value: (db) => db.observe.resources.health,
                    },
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

        it("should update when value changes", async () => {
            const db = createTestDb();
            const [healthObserve, setHealth] = Observe.createState(100);

            const service = createFromEcs(db, {
                states: {
                    health: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        value: () => healthObserve,
                    },
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
            const db = createTestDb();
            const service = createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db, amount) => {},
                    },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("heal");
            expect(actions.heal.schema).toEqual({ type: "number" });
            expect(typeof actions.heal.execute).toBe("function");
        });

        it("should omit disabled actions", async () => {
            const db = createTestDb();
            const service = createFromEcs(db, {
                states: {},
                actions: {
                    available: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db, input) => {},
                    },
                    unavailable: {
                        schema: false,
                        enabled: () => Observe.fromConstant(false),
                        execute: async (db) => {},
                    },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("available");
            expect(actions).not.toHaveProperty("unavailable");
        });

        it("should update when enabled changes", () => {
            const db = createTestDb();
            const [enabledObserve, setEnabled] = Observe.createState(true);

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: () => enabledObserve,
                        execute: async (db, input) => {},
                    },
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
            const db = createTestDb();
            let received: number | undefined;

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    setHealth: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db, input) => {
                            received = input;
                        },
                    },
                },
            });

            const result = await service.execute("setHealth", 42);
            expect(received).toBe(42);
            expect(result).toBeUndefined();
        });

        it("should dispatch void action (no input)", async () => {
            const db = createTestDb();
            let called = false;

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    reset: {
                        schema: false,
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db) => {
                            called = true;
                        },
                    },
                },
            });

            await service.execute("reset", undefined);
            expect(called).toBe(true);
        });

        it("should return error for unavailable action", async () => {
            const db = createTestDb();

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(false),
                        execute: async (db, input) => {},
                    },
                },
            });

            const result = await service.execute("heal", 10);
            expect(typeof result).toBe("string");
        });

        it("should return error for nonexistent action", async () => {
            const db = createTestDb();

            const service = createFromEcs(db, {
                states: {},
                actions: {},
            });

            const result = await service.execute("doesNotExist", undefined);
            expect(typeof result).toBe("string");
        });

        it("should propagate ActionError from execute", async () => {
            const db = createTestDb();

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    fail: {
                        schema: false,
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db) => "something went wrong",
                    },
                },
            });

            const result = await service.execute("fail", undefined);
            expect(result).toBe("something went wrong");
        });

        it("should reject action that was available but is now disabled", async () => {
            const db = createTestDb();
            const [enabledObserve, setEnabled] = Observe.createState(true);
            let called = false;

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: () => enabledObserve,
                        execute: async (db, input) => { called = true; },
                    },
                },
            });

            // Action is available, dispatch succeeds
            const ok = await service.execute("heal", 10);
            expect(called).toBe(true);
            expect(ok).toBeUndefined();

            // Disable the action
            called = false;
            setEnabled(false);

            // Action is now unavailable, dispatch returns error
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

            const service = createFromEcs(db, {
                states: {
                    health: {
                        schema: { type: "number" },
                        enabled: () => enableA,
                        value: (db) => db.observe.resources.health,
                    },
                    name: {
                        schema: { type: "string" },
                        enabled: () => enableB,
                        value: (db) => db.observe.resources.name,
                    },
                },
                actions: {},
            });

            const results: Record<string, unknown>[] = [];
            service.states((s) => results.push(s));

            // Both enabled initially
            expect(Object.keys(results[0])).toEqual(
                expect.arrayContaining(["health", "name"])
            );

            // Disable A only — B remains
            setEnableA(false);
            expect(results[1]).not.toHaveProperty("health");
            expect(results[1]).toHaveProperty("name");

            // Disable B too — empty
            setEnableB(false);
            expect(Object.keys(results[2])).toEqual([]);

            // Re-enable B only — A stays off
            setEnableB(true);
            expect(results[3]).not.toHaveProperty("health");
            expect(results[3]).toHaveProperty("name");
        });

        it("should toggle actions independently", () => {
            const db = createTestDb();
            const [enableHeal, setEnableHeal] = Observe.createState(true);
            const [enableReset, setEnableReset] = Observe.createState(true);

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: () => enableHeal,
                        execute: async (db, input) => {},
                    },
                    reset: {
                        schema: false,
                        enabled: () => enableReset,
                        execute: async (db) => {},
                    },
                },
            });

            const results: Record<string, unknown>[] = [];
            service.actions((a) => results.push(a));

            // Both enabled initially
            expect(Object.keys(results[0])).toEqual(
                expect.arrayContaining(["heal", "reset"])
            );

            // Disable heal only — reset remains
            setEnableHeal(false);
            expect(results[1]).not.toHaveProperty("heal");
            expect(results[1]).toHaveProperty("reset");

            // Re-enable heal, disable reset
            setEnableHeal(true);
            setEnableReset(false);
            // Two emissions: one for heal re-enabled, one for reset disabled
            const latest = results[results.length - 1];
            expect(latest).toHaveProperty("heal");
            expect(latest).not.toHaveProperty("reset");
        });
    });

    describe("bound action execute", () => {
        it("should execute bound action directly from actions observable", async () => {
            const db = createTestDb();
            let received: number | undefined;

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    heal: {
                        schema: { type: "number" },
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db, input) => { received = input; },
                    },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            await (actions.heal.execute as (input: unknown) => Promise<void>)(77);
            expect(received).toBe(77);
        });

        it("should execute bound void action directly from actions observable", async () => {
            const db = createTestDb();
            let called = false;

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    reset: {
                        schema: false,
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db) => { called = true; },
                    },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            await (actions.reset.execute as () => Promise<void>)();
            expect(called).toBe(true);
        });

        it("should propagate ActionError from bound action execute", async () => {
            const db = createTestDb();

            const service = createFromEcs(db, {
                states: {},
                actions: {
                    fail: {
                        schema: false,
                        enabled: () => Observe.fromConstant(true),
                        execute: async (db) => "bound error",
                    },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            const result = await (actions.fail.execute as () => Promise<unknown>)();
            expect(result).toBe("bound error");
        });
    });
});
