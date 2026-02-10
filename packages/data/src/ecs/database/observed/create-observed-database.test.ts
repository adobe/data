// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from "vitest";
import { createObservedDatabase } from "./create-observed-database.js";
import { Store } from "../../store/index.js";
import { Schema } from "../../../schema/index.js";
import { Entity } from "../../entity.js";
import { Database } from "../database.js";

const positionSchema = {
    type: "object",
    properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
    },
    required: ["x", "y", "z"],
    additionalProperties: false,
} as const satisfies Schema;
type Position = Schema.ToType<typeof positionSchema>;

const healthSchema = {
    type: "object",
    properties: {
        current: { type: "number" },
        max: { type: "number" },
    },
    required: ["current", "max"],
    additionalProperties: false,
} as const satisfies Schema;
type Health = Schema.ToType<typeof healthSchema>;

const nameSchema = {
    type: "string",
    maxLength: 50,
} as const satisfies Schema;
type Name = Schema.ToType<typeof nameSchema>;

type ObservedFixture = ReturnType<typeof createObservedFixture>;

const createObservedFixture = () => {
    const store = Store.create({
        components: { position: positionSchema, health: healthSchema, name: nameSchema },
        resources: {
            time: { default: { delta: 0.016, elapsed: 0 } },
            generating: { type: "boolean", default: false },
        },
        archetypes: {
            Position: ["position"],
            Health: ["health"],
            PositionHealth: ["position", "health"],
            PositionName: ["position", "name"],
            Full: ["position", "health", "name"],
        } as const,
    });

    type TestStore = typeof store;

    const observed = createObservedDatabase(store);
    const run = (
        handler: (db: TestStore) => Entity | void,
        options?: { transient?: boolean },
    ) => observed.execute(handler, options);

    const actions = {
        createPositionEntity: (args: { position: Position }) => {
            const result = run(db => db.archetypes.Position.insert(args));
            return result.value as Entity;
        },
        createPositionHealthEntity: (args: { position: Position; health: Health }) => {
            const result = run(db => db.archetypes.PositionHealth.insert(args));
            return result.value as Entity;
        },
        createPositionNameEntity: (args: { position: Position; name: Name }) => {
            const result = run(db => db.archetypes.PositionName.insert(args));
            return result.value as Entity;
        },
        createFullEntity: (args: { position: Position; health: Health; name: Name }) => {
            const result = run(db => db.archetypes.Full.insert(args));
            return result.value as Entity;
        },
        updateEntity: (args: { entity: Entity; values: Partial<Record<string, unknown>> }) => {
            run(db => {
                db.update(args.entity, args.values);
            });
        },
        deleteEntity: (args: { entity: Entity }) => {
            run(db => {
                db.delete(args.entity);
            });
        },
        updateTime: (args: { delta: number; elapsed: number }) => {
            run(db => {
                db.resources.time = args;
            });
        },
        createEntityAndReturn: (args: { position: Position; name: Name }) => {
            const result = run(db => db.archetypes.PositionName.insert(args));
            return result.value as Entity;
        },
    };

    return { observed, transactions: actions };
};

describe("createObservedDatabase", () => {
    it("should notify component observers when components change", () => {
        const { observed, transactions: actions } = createObservedFixture();
        const positionObserver = vi.fn();
        const nameObserver = vi.fn();

        const unsubscribePosition = observed.observe.components.position(positionObserver);
        const unsubscribeName = observed.observe.components.name(nameObserver);

        const entity = actions.createFullEntity({
            position: { x: 1, y: 2, z: 3 },
            name: "Test",
            health: { current: 100, max: 100 },
        });

        expect(positionObserver).toHaveBeenCalledTimes(1);
        expect(nameObserver).toHaveBeenCalledTimes(1);

        actions.updateEntity({
            entity,
            values: { position: { x: 4, y: 5, z: 6 } },
        });

        expect(positionObserver).toHaveBeenCalledTimes(2);
        expect(nameObserver).toHaveBeenCalledTimes(1);

        unsubscribePosition();
        unsubscribeName();

        actions.updateEntity({
            entity,
            values: { position: { x: 7, y: 8, z: 9 }, name: "Updated" },
        });

        expect(positionObserver).toHaveBeenCalledTimes(2);
        expect(nameObserver).toHaveBeenCalledTimes(1);
    });

    it("should notify entity observers with correct values", () => {
        const { observed, transactions: actions } = createObservedFixture();

        const entity = actions.createFullEntity({
            position: { x: 1, y: 2, z: 3 },
            name: "Test",
            health: { current: 100, max: 100 },
        });

        const observer = vi.fn();
        const unsubscribe = observed.observe.entity(entity)(observer);

        expect(observer).toHaveBeenCalledWith(expect.objectContaining({
            position: { x: 1, y: 2, z: 3 },
            name: "Test",
            health: { current: 100, max: 100 },
        }));

        actions.updateEntity({
            entity,
            values: { name: "Updated", health: { current: 50, max: 100 } },
        });

        expect(observer).toHaveBeenCalledWith(expect.objectContaining({
            position: { x: 1, y: 2, z: 3 },
            name: "Updated",
            health: { current: 50, max: 100 },
        }));

        actions.deleteEntity({ entity });
        expect(observer).toHaveBeenCalledWith(null);

        unsubscribe();
    });

    it("should notify transaction observers with full transaction results", () => {
        const { observed, transactions: actions } = createObservedFixture();
        const transactionObserver = vi.fn();
        const unsubscribe = observed.observe.transactions(transactionObserver);

        actions.createFullEntity({
            position: { x: 1, y: 2, z: 3 },
            name: "Test",
            health: { current: 100, max: 100 },
        });

        expect(transactionObserver).toHaveBeenCalledTimes(1);
        const result = transactionObserver.mock.calls[0][0];
        expect(result.changedEntities.size).toBe(1);
        expect(result.changedComponents.has("position")).toBe(true);
        expect(result.changedComponents.has("name")).toBe(true);

        unsubscribe();
    });

    it("should notify archetype observers when entities change archetypes", () => {
        const { observed, transactions: actions } = createObservedFixture();

        const entity = actions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        const archetype = observed.locate(entity)?.archetype;
        expect(archetype).toBeDefined();

        const archetypeObserver = vi.fn();
        const unsubscribe = observed.observe.archetype(archetype!.id)(archetypeObserver);

        expect(archetypeObserver).toHaveBeenCalledTimes(0);

        actions.updateEntity({
            entity,
            values: { name: "Test" },
        });

        expect(archetypeObserver).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("should notify resource observers with immediate and update notifications", () => {
        const { observed, transactions: actions } = createObservedFixture();
        const timeObserver = vi.fn();
        const unsubscribe = observed.observe.resources.time(timeObserver);

        expect(timeObserver).toHaveBeenCalledWith({ delta: 0.016, elapsed: 0 });

        actions.updateTime({ delta: 0.032, elapsed: 1 });
        expect(timeObserver).toHaveBeenCalledWith({ delta: 0.032, elapsed: 1 });

        unsubscribe();
    });

    it("should support multiple observers for the same target", () => {
        const { observed, transactions: actions } = createObservedFixture();

        const observer1 = vi.fn();
        const observer2 = vi.fn();
        const observer3 = vi.fn();

        const unsubscribe1 = observed.observe.components.position(observer1);
        const unsubscribe2 = observed.observe.components.position(observer2);
        const unsubscribe3 = observed.observe.components.position(observer3);

        const entity = actions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        expect(observer1).toHaveBeenCalledTimes(1);
        expect(observer2).toHaveBeenCalledTimes(1);
        expect(observer3).toHaveBeenCalledTimes(1);

        unsubscribe2();

        actions.updateEntity({
            entity,
            values: { position: { x: 4, y: 5, z: 6 } },
        });

        expect(observer1).toHaveBeenCalledTimes(2);
        expect(observer2).toHaveBeenCalledTimes(1);
        expect(observer3).toHaveBeenCalledTimes(2);

        unsubscribe1();
        unsubscribe3();
    });

    it("should handle observer cleanup correctly", () => {
        const { observed, transactions: actions } = createObservedFixture();

        const observer = vi.fn();
        const unsubscribe = observed.observe.components.position(observer);

        const entity = actions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });
        expect(observer).toHaveBeenCalledTimes(1);

        unsubscribe();

        actions.updateEntity({
            entity,
            values: { position: { x: 4, y: 5, z: 6 } },
        });

        expect(observer).toHaveBeenCalledTimes(1);
    });

    it("should handle observing non-existent entities", () => {
        const { observed } = createObservedFixture();
        const observer = vi.fn();
        const unsubscribe = observed.observe.entity(999 as Entity)(observer);

        expect(observer).toHaveBeenCalledWith(null);
        unsubscribe();
    });

    it("should handle complex transaction scenarios with multiple observers", () => {
        const { observed, transactions: actions } = createObservedFixture();

        const positionObserver = vi.fn();
        const healthObserver = vi.fn();
        const transactionObserver = vi.fn();
        const entityObserver = vi.fn();

        const unsubscribePosition = observed.observe.components.position(positionObserver);
        const unsubscribeHealth = observed.observe.components.health(healthObserver);
        const unsubscribeTransaction = observed.observe.transactions(transactionObserver);

        const entity = actions.createPositionHealthEntity({
            position: { x: 1, y: 2, z: 3 },
            health: { current: 100, max: 100 },
        });

        const unsubscribeEntity = observed.observe.entity(entity)(entityObserver);

        expect(positionObserver).toHaveBeenCalledTimes(1);
        expect(healthObserver).toHaveBeenCalledTimes(1);
        expect(transactionObserver).toHaveBeenCalledTimes(1);
        expect(entityObserver).toHaveBeenCalledTimes(1);

        actions.updateEntity({
            entity,
            values: {
                position: { x: 4, y: 5, z: 6 },
                health: { current: 50, max: 100 },
            },
        });

        expect(positionObserver).toHaveBeenCalledTimes(2);
        expect(healthObserver).toHaveBeenCalledTimes(2);
        expect(transactionObserver).toHaveBeenCalledTimes(2);
        expect(entityObserver).toHaveBeenCalledTimes(2);
        expect(entityObserver).toHaveBeenCalledWith(expect.objectContaining({
            position: { x: 4, y: 5, z: 6 },
            health: { current: 50, max: 100 },
        }));

        unsubscribePosition();
        unsubscribeHealth();
        unsubscribeTransaction();
        unsubscribeEntity();
    });

    it("should handle rapid successive changes efficiently", () => {
        const { observed, transactions: actions } = createObservedFixture();
        const observer = vi.fn();
        const unsubscribe = observed.observe.components.position(observer);

        const entity = actions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        for (let i = 0; i < 5; i++) {
            actions.updateEntity({
                entity,
                values: { position: { x: i, y: i, z: i } },
            });
        }

        expect(observer).toHaveBeenCalledTimes(6);
        unsubscribe();
    });

    describe("entity observation with minArchetype filtering", () => {
        it("should observe entity when it matches minArchetype exactly", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionEntity({
                position: { x: 1, y: 2, z: 3 },
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.Position)(observer);

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
            }));

            unsubscribe();
        });

        it("should observe entity when it has more components than minArchetype", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionHealthEntity({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.Position)(observer);

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
            }));

            unsubscribe();
        });

        it("should return null when entity has fewer components than minArchetype", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionEntity({
                position: { x: 1, y: 2, z: 3 },
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.PositionHealth)(observer);

            expect(observer).toHaveBeenCalledWith(null);
            unsubscribe();
        });

        it("should return null when entity has different components than minArchetype", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionNameEntity({
                position: { x: 1, y: 2, z: 3 },
                name: "Test",
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.PositionHealth)(observer);

            expect(observer).toHaveBeenCalledWith(null);
            unsubscribe();
        });

        it("should update observation when entity gains required components", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionEntity({
                position: { x: 1, y: 2, z: 3 },
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.PositionHealth)(observer);

            expect(observer).toHaveBeenCalledWith(null);

            actions.updateEntity({
                entity,
                values: { health: { current: 100, max: 100 } },
            });

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            }));

            unsubscribe();
        });

        it("should update observation when entity loses required components", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionHealthEntity({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.PositionHealth)(observer);

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            }));

            actions.updateEntity({
                entity,
                values: { health: undefined },
            });

            expect(observer).toHaveBeenCalledWith(null);

            unsubscribe();
        });

        it("should handle entity deletion correctly with minArchetype", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionHealthEntity({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            });

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(entity, observed.archetypes.PositionHealth)(observer);

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
            }));

            actions.deleteEntity({ entity });
            expect(observer).toHaveBeenCalledWith(null);

            unsubscribe();
        });

        it("should handle non-existent entity with minArchetype", () => {
            const { observed } = createObservedFixture();

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(999 as Entity, observed.archetypes.Position)(observer);

            expect(observer).toHaveBeenCalledWith(null);
            unsubscribe();
        });

        it("should handle invalid entity ID with minArchetype", () => {
            const { observed } = createObservedFixture();

            const observer = vi.fn();
            const unsubscribe = observed.observe.entity(-1, observed.archetypes.Position)(observer);

            expect(observer).toHaveBeenCalledWith(null);
            unsubscribe();
        });

        it("should maintain separate observations for different minArchetypes", () => {
            const { observed, transactions: actions } = createObservedFixture();

            const entity = actions.createPositionHealthEntity({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            });

            const positionObserver = vi.fn();
            const healthObserver = vi.fn();
            const fullObserver = vi.fn();

            const unsubscribePosition = observed.observe.entity(entity, observed.archetypes.Position)(positionObserver);
            const unsubscribeHealth = observed.observe.entity(entity, observed.archetypes.Health)(healthObserver);
            const unsubscribeFull = observed.observe.entity(entity, observed.archetypes.PositionHealth)(fullObserver);

            expect(positionObserver).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
            }));
            expect(healthObserver).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                health: { current: 100, max: 100 },
            }));
            expect(fullObserver).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 },
            }));

            actions.updateEntity({
                entity,
                values: { health: undefined },
            });

            expect(positionObserver).toHaveBeenCalledWith(expect.objectContaining({
                id: entity,
                position: { x: 1, y: 2, z: 3 },
            }));
            expect(healthObserver).toHaveBeenCalledWith(null);
            expect(fullObserver).toHaveBeenCalledWith(null);

            unsubscribePosition();
            unsubscribeHealth();
            unsubscribeFull();
        });
    });

    it("should notify observers when database is restored from serialized data", () => {
        const original = createObservedFixture();
        const { observed: originalObserved, transactions: originalTx } = original;

        const entity = originalTx.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });
        originalTx.updateTime({ delta: 0.016, elapsed: 0 });

        const positionObserver = vi.fn();
        const timeObserver = vi.fn();
        const entityObserver = vi.fn();
        const transactionObserver = vi.fn();

        const unsubscribePosition = originalObserved.observe.components.position(positionObserver);
        const unsubscribeTime = originalObserved.observe.resources.time(timeObserver);
        const unsubscribeEntity = originalObserved.observe.entity(entity)(entityObserver);
        const unsubscribeTransaction = originalObserved.observe.transactions(transactionObserver);

        positionObserver.mockClear();
        timeObserver.mockClear();
        entityObserver.mockClear();
        transactionObserver.mockClear();

        const serialized = originalObserved.toData();

        const restored = createObservedFixture();
        const { observed: restoredObserved, transactions: restoredTx } = restored;
        const newEntity = restoredTx.createFullEntity({
            position: { x: 10, y: 20, z: 30 },
            health: { current: 50, max: 100 },
            name: "NewEntity",
        });
        restoredTx.updateTime({ delta: 0.025, elapsed: 2.0 });

        const newPositionObserver = vi.fn();
        const newTimeObserver = vi.fn();
        const newEntityObserver = vi.fn();
        const newTransactionObserver = vi.fn();

        const newUnsubscribePosition = restoredObserved.observe.components.position(newPositionObserver);
        const newUnsubscribeTime = restoredObserved.observe.resources.time(newTimeObserver);
        const newUnsubscribeEntity = restoredObserved.observe.entity(newEntity)(newEntityObserver);
        const newUnsubscribeTransaction = restoredObserved.observe.transactions(newTransactionObserver);

        newPositionObserver.mockClear();
        newTimeObserver.mockClear();
        newEntityObserver.mockClear();
        newTransactionObserver.mockClear();

        restoredObserved.fromData(serialized);

        expect(newPositionObserver).toHaveBeenCalledTimes(1);
        expect(newTimeObserver).toHaveBeenCalledTimes(1);
        expect(newEntityObserver).toHaveBeenCalledTimes(1);
        expect(newTransactionObserver).toHaveBeenCalledTimes(1);

        newUnsubscribePosition();
        newUnsubscribeTime();
        newUnsubscribeEntity();
        newUnsubscribeTransaction();

        unsubscribePosition();
        unsubscribeTime();
        unsubscribeEntity();
        unsubscribeTransaction();
    });

    it("should notify observers even when restoring empty data", () => {
        const original = createObservedFixture();
        const { observed: originalObserved, transactions: originalTx } = original;

        const positionObserver = vi.fn();
        const timeObserver = vi.fn();
        const transactionObserver = vi.fn();

        const unsubscribePosition = originalObserved.observe.components.position(positionObserver);
        const unsubscribeTime = originalObserved.observe.resources.time(timeObserver);
        const unsubscribeTransaction = originalObserved.observe.transactions(transactionObserver);

        positionObserver.mockClear();
        timeObserver.mockClear();
        transactionObserver.mockClear();

        const serialized = originalObserved.toData();

        const restored = createObservedFixture();
        const { observed: restoredObserved, transactions: restoredTx } = restored;
        restoredTx.createPositionEntity({ position: { x: 1, y: 2, z: 3 } });
        restoredTx.updateTime({ delta: 0.033, elapsed: 1.5 });

        const newPositionObserver = vi.fn();
        const newTimeObserver = vi.fn();
        const newTransactionObserver = vi.fn();

        const newUnsubscribePosition = restoredObserved.observe.components.position(newPositionObserver);
        const newUnsubscribeTime = restoredObserved.observe.resources.time(newTimeObserver);
        const newUnsubscribeTransaction = restoredObserved.observe.transactions(newTransactionObserver);

        newPositionObserver.mockClear();
        newTimeObserver.mockClear();
        newTransactionObserver.mockClear();

        restoredObserved.fromData(serialized);

        expect(newPositionObserver).toHaveBeenCalledTimes(1);
        expect(newTimeObserver).toHaveBeenCalledTimes(1);
        expect(newTransactionObserver).toHaveBeenCalledTimes(1);

        newUnsubscribePosition();
        newUnsubscribeTime();
        newUnsubscribeTransaction();

        unsubscribePosition();
        unsubscribeTime();
        unsubscribeTransaction();
    });

    it("should handle entity observers correctly during restoration", () => {
        const original = createObservedFixture();
        const { observed: originalObserved, transactions: originalTx } = original;

        const entity = originalTx.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        const entityObserver = vi.fn();
        const unsubscribe = originalObserved.observe.entity(entity)(entityObserver);
        entityObserver.mockClear();

        const serialized = originalObserved.toData();

        const restored = createObservedFixture();
        const { observed: restoredObserved, transactions: restoredTx } = restored;
        const newEntity = restoredTx.createFullEntity({
            position: { x: 10, y: 20, z: 30 },
            health: { current: 100, max: 100 },
            name: "NewEntity",
        });

        const newObserver = vi.fn();
        const newUnsubscribe = restoredObserved.observe.entity(newEntity)(newObserver);
        newObserver.mockClear();

        restoredObserved.fromData(serialized);

        expect(newObserver).toHaveBeenCalledTimes(1);
        expect(newObserver.mock.calls[0][0]).toEqual({
            id: newEntity,
            position: { x: 1, y: 2, z: 3 },
        });

        unsubscribe();
        newUnsubscribe();
    });

    it("should extend with new components, resources, and archetypes", () => {
        const { observed, transactions: actions } = createObservedFixture();

        const velocitySchema = {
            type: "object",
            properties: {
                vx: { type: "number" },
                vy: { type: "number" },
                vz: { type: "number" },
            },
            required: ["vx", "vy", "vz"],
            additionalProperties: false,
        } as const satisfies Schema;

        // Create an entity and observe position before extending
        const entity = actions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        const positionObserver = vi.fn();
        const unsubscribePosition = observed.observe.components.position(positionObserver);
        positionObserver.mockClear();

        const extended = observed.extend(Database.Plugin.create({
            components: { position: positionSchema, velocity: velocitySchema },
            archetypes: {
                MovingEntity: ["position", "velocity"],
            }
        }));

        expect(extended).toBe(observed);
        // Verify that extending triggers reload notification for observed components
        expect(positionObserver).toHaveBeenCalledTimes(1);

        // Verify that new components can be added to entities
        actions.updateEntity({
            entity,
            values: { velocity: { vx: 0.1, vy: 0.2, vz: 0.3 } },
        });

        // Verify that new components can be read back
        const entityData = observed.read(entity);
        expect(entityData).toEqual({
            id: entity,
            position: { x: 1, y: 2, z: 3 },
            velocity: { vx: 0.1, vy: 0.2, vz: 0.3 },
        });

        // Verify that new archetypes are available
        const movingEntity = (observed as any).archetypes.MovingEntity.insert({
            position: { x: 10, y: 20, z: 30 },
            velocity: { vx: 1, vy: 2, vz: 3 },
        });

        expect(movingEntity).toBeDefined();

        const movingEntityData = observed.read(movingEntity);
        expect(movingEntityData).toEqual({
            id: movingEntity,
            position: { x: 10, y: 20, z: 30 },
            velocity: { vx: 1, vy: 2, vz: 3 },
        });

        unsubscribePosition();
    });
});
