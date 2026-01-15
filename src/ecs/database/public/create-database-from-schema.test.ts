// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "../database.js";
import { Store } from "../../store/index.js";
import { F32 } from "../../../math/f32/index.js";

describe("Database.create from plugin", () => {
    it("should create and use database from Database.Plugin", () => {
        const databasePlugin = Database.Plugin.create({
            components: {
                position: {
                    type: "object",
                    properties: {
                        x: F32.schema,
                        y: F32.schema,
                        z: F32.schema,
                    },
                    required: ["x", "y", "z"],
                    additionalProperties: false,
                } as const,
            },
            resources: {
                time: { default: { delta: 0.016, elapsed: 0 } as { delta: number; elapsed: number } },
            },
            archetypes: {
                PositionEntity: ["position"],
            },
            transactions: {
                createPositionEntity(t: Store<any, any, any>, args: { position: { x: number; y: number; z: number } }) {
                    return t.archetypes.PositionEntity.insert(args);
                },
                updateTime(t: Store<any, any, any>, args: { delta: number; elapsed: number }) {
                    t.resources.time = args;
                }
            }
        });

        const database = Database.create(databasePlugin);

        const entity = database.transactions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        expect(entity).toBeDefined();
        expect(typeof entity).toBe("number");

        const entityData = database.read(entity);
        expect(entityData).toEqual({
            id: entity,
            position: { x: 1, y: 2, z: 3 },
        });

        database.transactions.updateTime({ delta: 0.033, elapsed: 1.5 });
        expect(database.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });

        const entities = database.select(["position"]);
        expect(entities).toHaveLength(1);
        expect(entities[0]).toBe(entity);
    });

    it("should extend database with new actions", () => {
        const databasePlugin = Database.Plugin.create({
            components: {
                position: {
                    type: "object",
                    properties: {
                        x: F32.schema,
                        y: F32.schema,
                        z: F32.schema,
                    },
                    required: ["x", "y", "z"],
                    additionalProperties: false,
                } as const,
            },
            resources: {
                foo: { default: 0 as number }
            },
            archetypes: {
                PositionEntity: ["position"]
            },
            transactions: {
                createPositionEntity(t: Store<any, any, any>, args: { position: { x: number; y: number; z: number } }) {
                    return t.archetypes.PositionEntity.insert(args);
                }
            }
        });

        const database = Database.create(databasePlugin);

        const extensionPlugin = Database.Plugin.create({
            components: {
                velocity: {
                    type: "object",
                    properties: {
                        x: F32.schema,
                        y: F32.schema,
                        z: F32.schema,
                    },
                    required: ["x", "y", "z"],
                    additionalProperties: false,
                } as const
            },
            archetypes: {
                MovingEntity: ["position", "velocity"] as any
            },
            transactions: {
                createMovingEntity(t: Store<any, any, any>, args: { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } }) {
                    return (t.archetypes as any).MovingEntity.insert(args);
                },
                updatePosition(t: Store<any, any, any>, args: { entity: number; position: { x: number; y: number; z: number } }) {
                    t.update(args.entity, { position: args.position });
                }
            }
        });

        const extendedDatabase = database.extend(extensionPlugin) as unknown as typeof database & {
            transactions: typeof database.transactions & {
                createMovingEntity: (args: { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } }) => number;
                updatePosition: (args: { entity: number; position: { x: number; y: number; z: number } }) => void;
            }
        };

        // Verify original transaction still exists
        const staticEntity = extendedDatabase.transactions.createPositionEntity({
            position: { x: 1, y: 2, z: 3 },
        });

        expect(staticEntity).toBeDefined();
        expect(typeof staticEntity).toBe("number");

        // Verify new transaction exists and works
        const movingEntity = extendedDatabase.transactions.createMovingEntity({
            position: { x: 10, y: 20, z: 30 },
            velocity: { x: 1, y: 2, z: 3 },
        });

        expect(movingEntity).toBeDefined();
        expect(typeof movingEntity).toBe("number");

        const movingEntityData = extendedDatabase.read(movingEntity);
        expect(movingEntityData).toEqual({
            id: movingEntity,
            position: { x: 10, y: 20, z: 30 },
            velocity: { x: 1, y: 2, z: 3 },
        });

        // Verify extended updatePosition transaction works
        extendedDatabase.transactions.updatePosition({
            entity: movingEntity,
            position: { x: 15, y: 25, z: 35 },
        });

        const updatedEntityData = extendedDatabase.read(movingEntity);
        expect(updatedEntityData?.position).toEqual({ x: 15, y: 25, z: 35 });
    });
});

