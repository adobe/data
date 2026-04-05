// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "../../ecs/index.js";
import { Observe } from "../../observe/index.js";
import { create } from "./create.js";
import { createPlugin } from "../../ecs/database/create-plugin.js";

const testPlugin = createPlugin({
    resources: {
        health: { default: 100 as number },
        name: { default: "" as string },
        alive: { default: true as boolean },
    },
});

const createTestDb = () => Database.create(testPlugin);

describe("AgenticService.create", () => {
    describe("type acceptance", () => {
        it("should accept matching state schema and value types", () => {
            const db = createTestDb();

            create({
                interface: {
                    currentHealth: { type: "state", schema: { type: "number" }, description: "Health" },
                },
                implementation: {
                    currentHealth: db.observe.resources.health,
                },
                conditional: { currentHealth: db.observe.resources.alive },
            });
        });

        it("should accept string schema with string value", () => {
            const db = createTestDb();

            create({
                interface: {
                    playerName: { type: "state", schema: { type: "string" }, description: "Name" },
                },
                implementation: {
                    playerName: db.observe.resources.name,
                },
                conditional: { playerName: db.observe.resources.alive },
            });
        });

        it("should accept multiple states with different schemas", () => {
            const db = createTestDb();

            create({
                interface: {
                    currentHealth: { type: "state", schema: { type: "number" }, description: "Health" },
                    playerName: { type: "state", schema: { type: "string" }, description: "Name" },
                },
                implementation: {
                    currentHealth: db.observe.resources.health,
                    playerName: db.observe.resources.name,
                },
            });
        });

        it("should accept action with schema-typed input", () => {
            create({
                interface: {
                    setHealth: {
                        type: "action",
                        description: "Set health",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    setHealth: async (_input: number) => {},
                },
            });
        });

        it("should accept action with schema: false (void execute)", () => {
            create({
                interface: {
                    reset: {
                        type: "action",
                        description: "Reset to defaults",
                        parameters: [],
                    },
                },
                implementation: {
                    reset: async () => {},
                },
            });
        });

        it("should accept object schema with matching value type", () => {
            create({
                interface: {
                    stats: {
                        type: "state",
                        schema: {
                            type: "object",
                            properties: {
                                hp: { type: "number" },
                                label: { type: "string" },
                            },
                            required: ["hp"],
                            additionalProperties: false,
                        },
                        description: "Stats",
                    },
                },
                implementation: {
                    stats: Observe.fromConstant({ hp: 50, label: "test" }),
                },
            });
        });

        it("should accept action with object schema input", () => {
            create({
                interface: {
                    configure: {
                        type: "action",
                        description: "Configure",
                        parameters: [
                            {
                                type: "object",
                                properties: {
                                    hp: { type: "number" },
                                    name: { type: "string" },
                                },
                                required: ["hp", "name"],
                                additionalProperties: false,
                            },
                        ],
                    },
                },
                implementation: {
                    configure: async (_input: { hp: number; name: string }) => {},
                },
            });
        });

        it("should accept mixed actions with and without schemas", () => {
            create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                    reset: {
                        type: "action",
                        description: "Reset",
                        parameters: [],
                    },
                },
                implementation: {
                    heal: async (_amount: number) => {},
                    reset: async () => {},
                },
            });
        });

        it("should accept synchronous void-returning execute", () => {
            create({
                interface: {
                    sync: {
                        type: "action",
                        description: "Sync",
                        parameters: [],
                    },
                    syncWithInput: {
                        type: "action",
                        description: "Sync with input",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    sync: () => {},
                    syncWithInput: (_input: number) => {},
                },
            });
        });

        it("should accept omitted conditional (defaults to always true)", () => {
            const db = createTestDb();

            create({
                interface: {
                    health: { type: "state", schema: { type: "number" }, description: "Health" },
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    health: db.observe.resources.health,
                    heal: async () => {},
                },
            });
        });
    });

    describe("serviceName", () => {
        it("should set serviceName for isService compatibility", () => {
            const service = create({
                interface: {},
                implementation: {},
            });
            expect(service.serviceName).toBe("agentic-service");
        });
    });

    describe("links", () => {
        it("should expose links observable when link is declared in interface", () => {
            const child = create({
                interface: {},
                implementation: {},
            });
            const service = create({
                interface: { child: { type: "link", description: "Child service" } },
                implementation: { child },
            });
            expect(service.links).toBeDefined();
            const received: { [key: string]: unknown }[] = [];
            service.links!((l) => received.push({ ...l }));
            expect(received).toHaveLength(1);
            expect(received[0]).toEqual({ child });
        });

        it("should omit links when links config is omitted", () => {
            const service = create({
                interface: {},
                implementation: {},
            });
            expect(service.links).toBeUndefined();
        });

        it("should support Observe<AgenticService> per link for dynamic link target", () => {
            const child = create({
                interface: {},
                implementation: {},
            });
            const service = create({
                interface: { child: { type: "link" } },
                implementation: { child: Observe.fromConstant(child) },
            });
            expect(service.links).toBeDefined();
            const received: { [key: string]: unknown }[] = [];
            service.links!((l) => received.push({ ...l }));
            expect(received).toHaveLength(1);
            expect(received[0]).toEqual({ child });
        });

        it("should omit link when conditional is false", () => {
            const child = create({
                interface: {},
                implementation: {},
            });
            const service = create({
                interface: { child: { type: "link" } },
                implementation: { child },
                conditional: { child: Observe.fromConstant(false) },
            });
            expect(service.links).toBeDefined();
            const received: { [key: string]: unknown }[] = [];
            service.links!((l) => received.push({ ...l }));
            expect(received).toHaveLength(1);
            expect(received[0]).toEqual({});
        });

        it("should update links when conditional changes", () => {
            const child = create({
                interface: {},
                implementation: {},
            });
            const [enabledObs, setEnabled] = Observe.createState(true);
            const service = create({
                interface: { child: { type: "link" } },
                implementation: { child },
                conditional: { child: enabledObs },
            });
            const received: { [key: string]: unknown }[] = [];
            service.links!((l) => received.push({ ...l }));
            expect(received).toHaveLength(1);
            expect(received[0]).toEqual({ child });
            setEnabled(false);
            expect(received).toHaveLength(2);
            expect(received[1]).toEqual({});
            setEnabled(true);
            expect(received).toHaveLength(3);
            expect(received[2]).toEqual({ child });
        });

        it("should have links undefined when no link keys in interface", () => {
            const service = create({
                interface: {},
                implementation: {},
            });
            expect(service.links).toBeUndefined();
        });
    });

    describe("conditional defaults", () => {
        it("should default state enabled to always true when omitted", async () => {
            const db = createTestDb();

            const service = create({
                interface: {
                    health: { type: "state", schema: { type: "number" }, description: "Health" },
                },
                implementation: {
                    health: db.observe.resources.health,
                },
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("health");
            expect(states.health.value).toBe(100);
        });

        it("should default action enabled to always true when omitted", async () => {
            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    heal: async () => {},
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
                interface: {
                    currentHealth: { type: "state", schema: { type: "number" }, description: "Health" },
                    refresh: {
                        type: "action",
                        description: "Refresh",
                        parameters: [],
                    },
                },
                implementation: {
                    currentHealth: db.observe.resources.health,
                    refresh: async () => {},
                },
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("currentHealth");
            expect(states.currentHealth.schema).toEqual({ type: "number" });
            expect(states.currentHealth.value).toBe(100);
        });

        it("should omit disabled states", async () => {
            const db = createTestDb();

            const service = create({
                interface: {
                    visible: { type: "state", schema: { type: "number" }, description: "Visible" },
                    hidden: { type: "state", schema: { type: "string" }, description: "Hidden" },
                },
                implementation: {
                    visible: db.observe.resources.health,
                    hidden: db.observe.resources.name,
                },
                conditional: {
                    visible: Observe.fromConstant(true),
                    hidden: Observe.fromConstant(false),
                },
            });

            const states = await Observe.toPromise(service.states);
            expect(states).toHaveProperty("visible");
            expect(states).not.toHaveProperty("hidden");
        });

        it("should update when conditional changes", () => {
            const db = createTestDb();
            const [enabledObserve, setEnabled] = Observe.createState(true);

            const service = create({
                interface: {
                    health: { type: "state", schema: { type: "number" }, description: "Health" },
                },
                implementation: {
                    health: db.observe.resources.health,
                },
                conditional: { health: enabledObserve },
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
                interface: {
                    health: { type: "state", schema: { type: "number" }, description: "Health" },
                },
                implementation: {
                    health: healthObserve,
                },
            });

            const results: unknown[] = [];
            service.states((s) => results.push(s));

            expect((results[0] as { health: { value: number } }).health.value).toBe(100);

            setHealth(50);
            expect((results[1] as { health: { value: number } }).health.value).toBe(50);
        });
    });

    describe("actions observable", () => {
        it("should emit enabled actions with bound execute", async () => {
            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal player",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    heal: async (_amount: number) => {},
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("heal");
            expect(actions.heal.description).toBe("Heal player");
            expect(actions.heal.parameters).toEqual([{ type: "number" }]);
            expect(typeof actions.heal.execute).toBe("function");
        });

        it("should omit disabled actions", async () => {
            const service = create({
                interface: {
                    available: {
                        type: "action",
                        description: "Available",
                        parameters: [{ type: "number" }],
                    },
                    unavailable: {
                        type: "action",
                        description: "Unavailable",
                        parameters: [],
                    },
                },
                implementation: {
                    available: async () => {},
                    unavailable: async () => {},
                },
                conditional: {
                    available: Observe.fromConstant(true),
                    unavailable: Observe.fromConstant(false),
                },
            });

            const actions = await Observe.toPromise(service.actions);
            expect(actions).toHaveProperty("available");
            expect(actions).not.toHaveProperty("unavailable");
        });

        it("should update when conditional changes", () => {
            const [enabledObserve, setEnabled] = Observe.createState(true);

            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    heal: async () => {},
                },
                conditional: { heal: enabledObserve },
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
                interface: {
                    setHealth: {
                        type: "action",
                        description: "Set health",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    setHealth: async (input: number) => { received = input; },
                },
            });

            const result = await service.execute("setHealth", 42);
            expect(received).toBe(42);
            expect(result).toBeUndefined();
        });

        it("should dispatch void action (no input)", async () => {
            let called = false;

            const service = create({
                interface: {
                    reset: {
                        type: "action",
                        description: "Reset",
                        parameters: [],
                    },
                },
                implementation: {
                    reset: async () => { called = true; },
                },
            });

            await service.execute("reset", undefined);
            expect(called).toBe(true);
        });

        it("should dispatch synchronous void action", async () => {
            let called = false;

            const service = create({
                interface: {
                    sync: {
                        type: "action",
                        description: "Sync",
                        parameters: [],
                    },
                },
                implementation: {
                    sync: () => { called = true; },
                },
            });

            await service.execute("sync", undefined);
            expect(called).toBe(true);
        });

        it("should return error for unavailable action", async () => {
            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    heal: async () => {},
                },
                conditional: { heal: Observe.fromConstant(false) },
            });

            const result = await service.execute("heal", 10);
            expect(typeof result).toBe("string");
        });

        it("should return error for nonexistent action", async () => {
            const service = create({
                interface: {},
                implementation: {},
            });

            const result = await service.execute("doesNotExist", undefined);
            expect(typeof result).toBe("string");
        });

        it("should propagate ActionError from execute", async () => {
            const service = create({
                interface: {
                    fail: {
                        type: "action",
                        description: "Fail",
                        parameters: [],
                    },
                },
                implementation: {
                    fail: async () => "something went wrong",
                },
            });

            const result = await service.execute("fail", undefined);
            expect(result).toBe("something went wrong");
        });

        it("should reject action that was available but is now disabled", async () => {
            const [enabledObserve, setEnabled] = Observe.createState(true);
            let called = false;

            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    heal: async () => { called = true; },
                },
                conditional: { heal: enabledObserve },
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
                interface: {
                    health: { type: "state", schema: { type: "number" }, description: "Health" },
                    name: { type: "state", schema: { type: "string" }, description: "Name" },
                },
                implementation: {
                    health: db.observe.resources.health,
                    name: db.observe.resources.name,
                },
                conditional: { health: enableA, name: enableB },
            });

            const results: Record<string, unknown>[] = [];
            service.states((s) => results.push(s));

            expect(Object.keys(results[0] as object)).toEqual(
                expect.arrayContaining(["health", "name"])
            );

            setEnableA(false);
            expect(results[1] as object).not.toHaveProperty("health");
            expect(results[1] as object).toHaveProperty("name");

            setEnableB(false);
            expect(Object.keys(results[2] as object)).toEqual([]);

            setEnableB(true);
            expect(results[3] as object).not.toHaveProperty("health");
            expect(results[3] as object).toHaveProperty("name");
        });

        it("should toggle actions independently", () => {
            const [enableHeal, setEnableHeal] = Observe.createState(true);
            const [enableReset, setEnableReset] = Observe.createState(true);

            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                    reset: {
                        type: "action",
                        description: "Reset",
                        parameters: [],
                    },
                },
                implementation: {
                    heal: async () => {},
                    reset: async () => {},
                },
                conditional: { heal: enableHeal, reset: enableReset },
            });

            const results: Record<string, unknown>[] = [];
            service.actions((a) => results.push(a));

            expect(Object.keys(results[0] as object)).toEqual(
                expect.arrayContaining(["heal", "reset"])
            );

            setEnableHeal(false);
            expect(results[1] as object).not.toHaveProperty("heal");
            expect(results[1] as object).toHaveProperty("reset");

            setEnableHeal(true);
            setEnableReset(false);
            const latest = results[results.length - 1] as object;
            expect(latest).toHaveProperty("heal");
            expect(latest).not.toHaveProperty("reset");
        });
    });

    describe("bound action execute", () => {
        it("should execute action directly from actions observable", async () => {
            let received: number | undefined;

            const service = create({
                interface: {
                    heal: {
                        type: "action",
                        description: "Heal",
                        parameters: [{ type: "number" }],
                    },
                },
                implementation: {
                    heal: async (input: number) => { received = input; },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            await (actions.heal.execute as (input: unknown) => Promise<void>)(77);
            expect(received).toBe(77);
        });

        it("should execute void action directly from actions observable", async () => {
            let called = false;

            const service = create({
                interface: {
                    reset: {
                        type: "action",
                        description: "Reset",
                        parameters: [],
                    },
                },
                implementation: {
                    reset: async () => { called = true; },
                },
            });

            const actions = await Observe.toPromise(service.actions);
            await (actions.reset.execute as () => Promise<void>)();
            expect(called).toBe(true);
        });

        it("should propagate ActionError from bound action execute", async () => {
            const service = create({
                interface: {
                    fail: {
                        type: "action",
                        description: "Fail",
                        parameters: [],
                    },
                },
                implementation: {
                    fail: async () => "bound error",
                },
            });

            const actions = await Observe.toPromise(service.actions);
            const result = await (actions.fail.execute as () => Promise<unknown>)();
            expect(result).toBe("bound error");
        });
    });
});
