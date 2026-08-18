// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from "vitest";
import { createStore } from "./create-store.js";
import { serialize, deserialize } from "../../../functions/serialization/serialize.js";
import { ECS_SNAPSHOT_VERSION } from "../core/create-core.js";
import { createCoreTestSuite, positionSchema, healthSchema, nameSchema } from "../core/create-core.test.js";
import { Schema } from "../../../schema/index.js";
import { F32 } from "../../../math/f32/index.js";
import { Time } from "../../../schema/index.js";

describe("createStore", () => {
    // Test that store passes all core functionality tests
    createCoreTestSuite("Store core functionality", (componentSchemas) =>
        createStore({ components: componentSchemas, resources: {}, archetypes: {} }) as any
    );

    describe("reserved names", () => {
        it("throws when a schema defines a reserved component name", () => {
            for (const reserved of ["id", "nonPersistent", "nonShared"]) {
                expect(() =>
                    createStore({ components: { [reserved]: positionSchema }, resources: {}, archetypes: {} } as any),
                ).toThrow(/reserved/);
            }
        });

        it("throws when a schema defines a reserved resource name", () => {
            for (const reserved of ["id", "nonPersistent", "nonShared"]) {
                expect(() =>
                    createStore({
                        components: {},
                        resources: { [reserved]: { default: { x: 0, y: 0, z: 0 } } },
                        archetypes: {},
                    } as any),
                ).toThrow(/reserved/);
            }
        });
    });

    // Select function tests
    describe("Select functionality", () => {
        const velocitySchema = {
            type: "object",
            properties: {
                x: F32.schema,
                y: F32.schema,
                z: F32.schema,
            }
        } as const satisfies Schema;

        it("should select entities from single archetype", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
                name: nameSchema,
            }, resources: {}, archetypes: {} });

            // Create entities in a single archetype
            const archetype = store.ensureArchetype(["position", "health"]);
            const entity1 = archetype.insert({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 }
            });
            const entity2 = archetype.insert({
                position: { x: 4, y: 5, z: 6 },
                health: { current: 50, max: 100 }
            });

            // Select entities with position and health
            const entities = store.select(["position", "health"]);
            expect(entities).toHaveLength(2);
            expect(entities).toContain(entity1);
            expect(entities).toContain(entity2);
        });

        it("should select entities spanning multiple archetypes", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
                name: nameSchema,
                velocity: velocitySchema,
            }, resources: {}, archetypes: {} });

            // Create entities in different archetypes
            const positionOnlyArchetype = store.ensureArchetype(["position"]);
            const entity1 = positionOnlyArchetype.insert({
                position: { x: 1, y: 2, z: 3 }
            });
            const entity2 = positionOnlyArchetype.insert({
                position: { x: 4, y: 5, z: 6 }
            });

            const healthOnlyArchetype = store.ensureArchetype(["health"]);
            const entity3 = healthOnlyArchetype.insert({
                health: { current: 100, max: 100 }
            });

            const positionHealthArchetype = store.ensureArchetype(["position", "health"]);
            const entity4 = positionHealthArchetype.insert({
                position: { x: 0, y: 0, z: 0 },
                health: { current: 50, max: 100 }
            });

            const velocityArchetype = store.ensureArchetype(["velocity"]);
            const entity5 = velocityArchetype.insert({
                velocity: { x: 1, y: 0, z: 0 }
            });

            // Select all entities with position component (should span 2 archetypes)
            const positionEntities = store.select(["position"]);
            expect(positionEntities).toHaveLength(3);
            expect(positionEntities).toContain(entity1);
            expect(positionEntities).toContain(entity2);
            expect(positionEntities).toContain(entity4);
            expect(positionEntities).not.toContain(entity3);
            expect(positionEntities).not.toContain(entity5);

            // Select all entities with health component (should span 2 archetypes)
            const healthEntities = store.select(["health"]);
            expect(healthEntities).toHaveLength(2);
            expect(healthEntities).toContain(entity3);
            expect(healthEntities).toContain(entity4);
            expect(healthEntities).not.toContain(entity1);
            expect(healthEntities).not.toContain(entity2);
            expect(healthEntities).not.toContain(entity5);

            // Select entities with both position and health (should be only 1 archetype)
            const bothEntities = store.select(["position", "health"]);
            expect(bothEntities).toHaveLength(1);
            expect(bothEntities).toContain(entity4);
            expect(bothEntities).not.toContain(entity1);
            expect(bothEntities).not.toContain(entity2);
            expect(bothEntities).not.toContain(entity3);
            expect(bothEntities).not.toContain(entity5);
        });

        it("should select entities with exclude option", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
                name: nameSchema,
            }, resources: {}, archetypes: {} });

            // Create entities in different archetypes
            const positionOnlyArchetype = store.ensureArchetype(["position"]);
            const entity1 = positionOnlyArchetype.insert({
                position: { x: 1, y: 2, z: 3 }
            });

            const positionHealthArchetype = store.ensureArchetype(["position", "health"]);
            const entity2 = positionHealthArchetype.insert({
                position: { x: 0, y: 0, z: 0 },
                health: { current: 50, max: 100 }
            });

            // Select entities with position but exclude health
            const positionOnlyEntities = store.select(["position"], { exclude: ["health"] });
            expect(positionOnlyEntities).toHaveLength(1);
            expect(positionOnlyEntities).toContain(entity1);
            expect(positionOnlyEntities).not.toContain(entity2);
        });

        it("should return empty array when no entities match", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
            }, resources: {}, archetypes: {} });

            // Create entity with only position
            const archetype = store.ensureArchetype(["position"]);
            archetype.insert({ position: { x: 1, y: 2, z: 3 } });

            // Select entities with health (should be empty)
            const entities = store.select(["health"]);
            expect(entities).toHaveLength(0);
        });

        it("should handle complex multi-archetype scenarios", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
                name: nameSchema,
                velocity: velocitySchema,
            }, resources: {}, archetypes: {} });

            // Create entities across many different archetypes
            const archetype1 = store.ensureArchetype(["position"]);
            const entity1 = archetype1.insert({ position: { x: 1, y: 2, z: 3 } });
            const entity2 = archetype1.insert({ position: { x: 4, y: 5, z: 6 } });

            const archetype2 = store.ensureArchetype(["health"]);
            const entity3 = archetype2.insert({ health: { current: 100, max: 100 } });

            const archetype3 = store.ensureArchetype(["position", "health"]);
            const entity4 = archetype3.insert({
                position: { x: 0, y: 0, z: 0 },
                health: { current: 50, max: 100 }
            });
            const entity5 = archetype3.insert({
                position: { x: 10, y: 20, z: 30 },
                health: { current: 75, max: 100 }
            });

            const archetype4 = store.ensureArchetype(["name"]);
            const entity6 = archetype4.insert({ name: "Player1" });

            const archetype5 = store.ensureArchetype(["position", "name"]);
            const entity7 = archetype5.insert({
                position: { x: 100, y: 200, z: 300 },
                name: "Player2"
            });

            const archetype6 = store.ensureArchetype(["position", "health", "name"]);
            const entity8 = archetype6.insert({
                position: { x: 500, y: 600, z: 700 },
                health: { current: 25, max: 100 },
                name: "Player3"
            });

            // Test various selection scenarios
            const positionEntities = store.select(["position"]);
            expect(positionEntities).toHaveLength(6);
            expect(positionEntities).toContain(entity1);
            expect(positionEntities).toContain(entity2);
            expect(positionEntities).toContain(entity4);
            expect(positionEntities).toContain(entity5);
            expect(positionEntities).toContain(entity7);
            expect(positionEntities).toContain(entity8);

            const nameEntities = store.select(["name"]);
            expect(nameEntities).toHaveLength(3);
            expect(nameEntities).toContain(entity6);
            expect(nameEntities).toContain(entity7);
            expect(nameEntities).toContain(entity8);

            const positionNameEntities = store.select(["position", "name"]);
            expect(positionNameEntities).toHaveLength(2);
            expect(positionNameEntities).toContain(entity7);
            expect(positionNameEntities).toContain(entity8);

            const allThreeEntities = store.select(["position", "health", "name"]);
            expect(allThreeEntities).toHaveLength(1);
            expect(allThreeEntities).toContain(entity8);

            // Test exclusion
            const positionWithoutHealth = store.select(["position"], { exclude: ["health"] });
            expect(positionWithoutHealth).toHaveLength(3);
            expect(positionWithoutHealth).toContain(entity1);
            expect(positionWithoutHealth).toContain(entity2);
            expect(positionWithoutHealth).toContain(entity7);
            expect(positionWithoutHealth).not.toContain(entity4);
            expect(positionWithoutHealth).not.toContain(entity5);
            expect(positionWithoutHealth).not.toContain(entity8);
        });

        it("should maintain entity order across archetypes", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
            }, resources: {}, archetypes: {} });

            // Create entities in different archetypes
            const archetype1 = store.ensureArchetype(["position"]);
            const entity1 = archetype1.insert({ position: { x: 1, y: 2, z: 3 } });
            const entity2 = archetype1.insert({ position: { x: 4, y: 5, z: 6 } });

            const archetype2 = store.ensureArchetype(["health"]);
            const entity3 = archetype2.insert({ health: { current: 100, max: 100 } });

            const archetype3 = store.ensureArchetype(["position", "health"]);
            const entity4 = archetype3.insert({
                position: { x: 0, y: 0, z: 0 },
                health: { current: 50, max: 100 }
            });

            // Select all entities with position
            const entities = store.select(["position"]);
            expect(entities).toHaveLength(3);

            // Verify all expected entities are present (order may vary)
            expect(entities).toContain(entity1);
            expect(entities).toContain(entity2);
            expect(entities).toContain(entity4);
            expect(entities).not.toContain(entity3);
        });

        it("should handle empty store", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
            }, resources: {}, archetypes: {} });

            const entities = store.select(["position"]);
            expect(entities).toHaveLength(0);
        });

        it("should work with resources as components", () => {
            const store = createStore({ components: {
                position: positionSchema,
                health: healthSchema,
            }, resources: {
                time: { default: { delta: 0.016, elapsed: 0 } }
            }, archetypes: {} });

            // Create some entities
            const archetype = store.ensureArchetype(["position"]);
            const entity = archetype.insert({ position: { x: 1, y: 2, z: 3 } });

            // Select entities with time component (should include the resource entity)
            const timeEntities = store.select(["time" as any]);
            expect(timeEntities).toHaveLength(1);

            // The resource entity should be included in time queries
            const timeArchetypes = store.queryArchetypes(["time" as any]);
            expect(timeArchetypes).toHaveLength(1);
        });
    });

    // Store-specific resource tests
    describe("Resource functionality", () => {
        const timeSchema = {
            type: "object",
            properties: {
                delta: F32.schema,
                elapsed: F32.schema,
            }
        } as const satisfies Schema;

        it("should create store with resources", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } }
                }, archetypes: {} });

            expect(store).toBeDefined();
            expect(store.resources).toBeDefined();
            expect(store.resources.time).toBeDefined();
            expect(store.resources.config).toBeDefined();
        });

        it("should initialize resources with default values", () => {
            const defaultTime = { delta: 0.016, elapsed: 0 };
            const defaultConfig = { debug: false, volume: 1.0 };

            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: defaultTime },
                    config: { default: defaultConfig }
                }, archetypes: {} });

            expect(store.resources.time).toEqual(defaultTime);
            expect(store.resources.config).toEqual(defaultConfig);
        });

        it("should allow reading resource values", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } }
                }, archetypes: {} });

            expect(store.resources.time.delta).toBe(0.016);
            expect(store.resources.time.elapsed).toBe(0);
            expect(store.resources.config.debug).toBe(false);
            expect(store.resources.config.volume).toBe(1.0);
        });

        it("should allow updating resource values", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } }
                }, archetypes: {} });

            // Update time
            store.resources.time = { delta: 0.033, elapsed: 1.5 };
            expect(store.resources.time.delta).toBe(0.033);
            expect(store.resources.time.elapsed).toBe(1.5);

            // Update config
            store.resources.config = { debug: true, volume: 0.5 };
            expect(store.resources.config.debug).toBe(true);
            expect(store.resources.config.volume).toBe(0.5);
        });

        it("should maintain resource values across updates", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } }
                }, archetypes: {} });

            // Update multiple times
            store.resources.time = { delta: 0.033, elapsed: 1.5 };
            store.resources.time = { delta: 0.025, elapsed: 2.0 };
            store.resources.config = { debug: true, volume: 0.5 };

            // Verify final values
            expect(store.resources.time).toEqual({ delta: 0.025, elapsed: 2.0 });
            expect(store.resources.config).toEqual({ debug: true, volume: 0.5 });
        });

        it("should handle nested resource updates", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Update individual properties
            const newTime = { delta: 0.033, elapsed: 1.5 };
            store.resources.time = newTime;

            expect(store.resources.time.delta).toBe(newTime.delta);
            expect(store.resources.time.elapsed).toBe(newTime.elapsed);
        });

        it("should work with empty resource object", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {}, archetypes: {} });

            expect(store.resources).toBeDefined();
            expect(Object.keys(store.resources)).toHaveLength(0);
        });

        it("should handle multiple resources independently", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } },
                    score: { default: 0 }
                }, archetypes: {} });

            // Update each resource independently
            store.resources.time = { delta: 0.033, elapsed: 1.5 };
            store.resources.config = { debug: true, volume: 0.5 };
            store.resources.score = 100;

            // Verify all resources maintain their values
            expect(store.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });
            expect(store.resources.config).toEqual({ debug: true, volume: 0.5 });
            expect(store.resources.score).toBe(100);
        });

        it("should allow querying resources as components", () => {
            const store = createStore({ components: {
                    position: positionSchema,
                    time: timeSchema
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Resources should be queryable as components
            const timeArchetypes = store.queryArchetypes(["time"]);
            expect(timeArchetypes).toHaveLength(1);
            expect(timeArchetypes[0].components.has("time")).toBe(true);
        });

        it("should maintain resource singleton behavior", () => {
            const store = createStore({ components: {
                    position: positionSchema,
                    time: timeSchema
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Resources should be queryable as components
            const timeArchetypes = store.queryArchetypes(["time"]);
            expect(timeArchetypes).toHaveLength(1);

            // Resources should maintain their values
            expect(store.resources.time).toEqual({ delta: 0.016, elapsed: 0 });

            // Update and verify
            store.resources.time = { delta: 0.033, elapsed: 1.5 };
            expect(store.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });
        });

        it("should handle primitive resource values", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    score: { default: 0 },
                    name: { default: "Player1" },
                    active: { default: true }
                }, archetypes: {} });

            expect(store.resources.score).toBe(0);
            expect(store.resources.name).toBe("Player1");
            expect(store.resources.active).toBe(true);

            // Update primitive values
            store.resources.score = 100;
            store.resources.name = "Player2";
            store.resources.active = false;

            expect(store.resources.score).toBe(100);
            expect(store.resources.name).toBe("Player2");
            expect(store.resources.active).toBe(false);
        });

        it("should handle complex resource objects", () => {
            const complexResource = {
                nested: {
                    deep: {
                        value: 42,
                        array: [1, 2, 3],
                        flag: true
                    }
                },
                count: 0
            };

            const store = createStore({ components: { position: positionSchema }, resources: { complex: { default: complexResource } }, archetypes: {} });

            expect(store.resources.complex).toEqual(complexResource);

            // Update complex resource
            const updatedComplex = {
                nested: {
                    deep: {
                        value: 100,
                        array: [4, 5, 6],
                        flag: false
                    }
                },
                count: 10
            };

            store.resources.complex = updatedComplex;
            expect(store.resources.complex).toEqual(updatedComplex);
        });

        it("should handle array resource schemas", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        default: ["player", "active"]
                    }
                }, archetypes: {} });

            expect(store.resources.tags).toEqual(["player", "active"]);

            // Update array resource
            store.resources.tags = ["enemy", "boss", "elite"];
            expect(store.resources.tags).toEqual(["enemy", "boss", "elite"]);
        });
    });

    describe("Archetype functionality", () => {
        it("should create store with archetypes", () => {
            const store = createStore({ components: {
                    name: { type: "string" },
                    health: { type: "number" },
                    enabled: { type: "boolean" },
                }, resources: {}, archetypes: {
                    Player: ["name", "health"],
                } });

            const entity = store.archetypes.Player.insert({
                name: "test",
                health: 100,
            });

            expect(store.archetypes.Player.columns.name.get(entity)).toEqual("test");
            expect(store.archetypes.Player.columns.health.get(entity)).toEqual(100);
        });
    });

    // TimeSchema round-trip test
    describe("TimeSchema functionality", () => {
        it("should store and retrieve Date.now() value correctly", () => {
            const store = createStore({ components: {
                    timestamp: Time.schema,
                }, resources: {}, archetypes: {} });

            // Create entity with current timestamp
            const now = Date.now();
            const archetype = store.ensureArchetype(["timestamp"]);
            const entity = archetype.insert({ timestamp: now });

            // Query for the entity
            const entities = store.select(["timestamp"]);
            expect(entities).toHaveLength(1);
            expect(entities[0]).toBe(entity);

            // Read the stored value and verify it matches original
            const storedData = store.read(entity);
            expect(storedData).not.toBeNull();
            expect(storedData!.timestamp).toBe(now);
        });
    });

    // Serialization/Deserialization tests
    describe("toData/fromData functionality", () => {
        it("should serialize and deserialize store with resources correctly", () => {
            const store = createStore({ components: {
                    position: positionSchema,
                    health: healthSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } }
                }, archetypes: {} });

            // Add some entities
            const archetype = store.ensureArchetype(["position", "health"]);
            const entity1 = archetype.insert({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 }
            });
            const entity2 = archetype.insert({
                position: { x: 4, y: 5, z: 6 },
                health: { current: 50, max: 100 }
            });

            // Update resources
            store.resources.time = { delta: 0.033, elapsed: 1.5 };
            store.resources.config = { debug: true, volume: 0.5 };

            // Serialize the store
            const serializedData = store.toData();

            // Create a new store with the same schemas and restore
            const newStore = createStore({ components: {
                    position: positionSchema,
                    health: healthSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } }
                }, archetypes: {} });
            newStore.fromData(serializedData);

            // Verify entities are restored
            const restoredEntities = newStore.select(["position", "health"]);
            expect(restoredEntities).toHaveLength(2);

            // Verify entity data is correct
            const restoredData1 = newStore.read(restoredEntities[0]);
            const restoredData2 = newStore.read(restoredEntities[1]);
            expect(restoredData1).toEqual({
                position: { x: 1, y: 2, z: 3 },
                health: { current: 100, max: 100 }
            });
            expect(restoredData2).toEqual({
                position: { x: 4, y: 5, z: 6 },
                health: { current: 50, max: 100 }
            });

            // Verify resources are restored
            expect(newStore.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });
            expect(newStore.resources.config).toEqual({ debug: true, volume: 0.5 });
        });

        it("should exclude nonPersistent resource row data from serialized data", () => {
            const schema = {
                components: {},
                resources: {
                    score: { default: 0 as number, nonPersistent: true },
                    persistentScore: { default: 0 as number },
                },
                archetypes: {},
            } as const;

            const store = createStore(schema as any);
            (store.resources as any).score = 999;
            (store.resources as any).persistentScore = 123;

            const serializedData: any = store.toData({ copy: true });

            // The nonPersistent resource's value must never appear in the
            // snapshot: its entity lives in a non-persistent quadrant, whose
            // location table is never serialized either. Its archetype slot
            // is still present (to keep archetype ids stable) but carries no
            // `data` — only its component names.
            const scoreEntry = serializedData.archetypesData.find(
                (a: any) => a.componentNames.includes("score")
            );
            expect(scoreEntry).toBeDefined();
            expect(scoreEntry.data).toBeUndefined();
            const anyDataHoldsScore = serializedData.archetypesData.some(
                (a: any) => a.data && "score" in a.data.columns
            );
            expect(anyDataHoldsScore).toBe(false);

            const newStore = createStore(schema as any);
            newStore.fromData(serializedData);

            // Persistent resource restored from the snapshot.
            expect((newStore.resources as any).persistentScore).toBe(123);
            // nonPersistent resource is never restored; the fresh store keeps its default.
            expect((newStore.resources as any).score).toBe(0);
        });

        it("round-trips through the encoded (serialize/deserialize) form without leaking or corrupting a nonPersistent resource", () => {
            const schema = {
                components: {},
                resources: {
                    score: { default: 0 as number, nonPersistent: true },
                    persistentScore: { default: 0 as number },
                },
                archetypes: {},
            } as const;

            const store = createStore(schema as any);
            (store.resources as any).score = 999;
            (store.resources as any).persistentScore = 123;

            const encoded = serialize(store.toData({ copy: true }));
            // The nonPersistent value must not survive into the encoded bytes.
            expect(encoded.json).not.toContain("999");
            expect(encoded.json).toContain("123");

            const newStore = createStore(schema as any);
            newStore.fromData(deserialize(encoded));

            // Persistent resource restored; nonPersistent resource back at its
            // default (never undefined, never the leaked 999).
            expect((newStore.resources as any).persistentScore).toBe(123);
            expect((newStore.resources as any).score).toBe(0);
        });

        it("reverts a nonPersistent resource to its default when loading into a populated (non-fresh) store", () => {
            const schema = {
                components: {},
                resources: {
                    score: { default: 0 as number, nonPersistent: true },
                    persistentScore: { default: 0 as number },
                },
                archetypes: {},
            } as const;

            // Save a snapshot from a source store.
            const source = createStore(schema as any);
            (source.resources as any).persistentScore = 123;
            const snapshot = source.toData({ copy: true });

            // Load into a store that ALREADY holds non-default state — the
            // same-instance Save-As -> Load path. The nonPersistent resource
            // is never captured by toData, so the only correct post-load value
            // is its default. Leaving the pre-load live value in place would
            // leak it across the load (the stale-blob-URL bug). This must match
            // reset()'s treatment of the nonPersistent space.
            const target = createStore(schema as any);
            (target.resources as any).score = 999;
            (target.resources as any).persistentScore = 456;
            target.fromData(snapshot);

            expect((target.resources as any).score).toBe(0);
            expect((target.resources as any).persistentScore).toBe(123);
        });

        it("clears a nonPersistent entity present before the load when loading into a populated store", () => {
            const selectionSchema = { type: "boolean", default: false } as const satisfies Schema;
            const makeStore = () => createStore({
                components: { selection: selectionSchema },
                resources: {},
                archetypes: {},
            });

            const source = makeStore();
            const snapshot = source.toData({ copy: true });

            // Target holds a nonPersistent entity (non-persistent quadrant) before
            // the load. fromData must clear it — the non-persistent quadrants are
            // never serialized, so a load resets them exactly as reset() would.
            const target = makeStore();
            const selectionArchetype = target.ensureArchetype(["selection", "nonPersistent"]);
            const selectionEntity = selectionArchetype.insert({ selection: true, nonPersistent: true });
            expect(target.read(selectionEntity)).not.toBeNull();

            target.fromData(snapshot);

            expect(target.read(selectionEntity)).toBeNull();
        });

        it("preserves archetype ids across serialization when a nonPersistent archetype precedes a persistent one", () => {
            const selectionSchema = { type: "boolean", default: false } as const satisfies Schema;
            const positionScalarSchema = { type: "number", default: 0 } as const satisfies Schema;
            const makeStore = () => createStore({
                components: { selection: selectionSchema, position: positionScalarSchema },
                resources: {},
                archetypes: {},
            });

            const store = makeStore();

            // Ad-hoc nonPersistent entity archetype created FIRST → lower id.
            const selectionArchetype = store.ensureArchetype(["selection", "nonPersistent"]);
            selectionArchetype.insert({ selection: true, nonPersistent: true });

            // Persistent entity archetype created AFTER → higher id, referenced
            // by the persistent entity-location table by that id.
            const positionArchetype = store.ensureArchetype(["position"]);
            const positionEntity = positionArchetype.insert({ position: 42 });

            const serializedData = store.toData({ copy: true });

            const newStore = makeStore();
            newStore.fromData(serializedData);

            // The persistent entity must still resolve to the right archetype
            // after reload — it would not if the nonPersistent archetype's slot
            // were dropped and later ids shifted down.
            expect(newStore.read(positionEntity)).toEqual({ position: 42 });
        });

        it("BUG: corrupts entity reads when a schema-declared archetype is added ahead of an existing one", () => {
            // v1: a single named archetype "A", declared alone -> gets id 0.
            const v1 = createStore({
                components: { health: healthSchema },
                resources: {},
                archetypes: { A: ["health"] },
            });
            const entity = v1.archetypes.A.insert({ health: { current: 100, max: 100 } });
            const snapshot = v1.toData({ copy: true });

            // v2: schema evolves by adding a new archetype "B" declared BEFORE
            // "A" in the schema object. createStore's own extend() pre-creates
            // archetypes for every schema-declared entry (in declaration order)
            // before fromData ever runs, so on the fresh v2 store, B claims id 0
            // and A is pushed to id 1 -- one slot later than it occupied when
            // the snapshot was taken.
            const v2 = createStore({
                components: { name: nameSchema, health: healthSchema },
                resources: {},
                archetypes: { B: ["name"], A: ["health"] },
            });
            v2.fromData(snapshot);

            // The entity's location table entry still says "archetype 0" (A's
            // OLD position), but archetype 0 in v2 is now B, not A. The entity
            // must still read back as itself.
            expect(v2.read(entity)).toEqual({ health: { current: 100, max: 100 } });
        });

        it("stamps a version and skips (warns, does not throw) snapshots of an incompatible or legacy format", () => {
            const store = createStore({ components: { position: positionSchema }, resources: {}, archetypes: {} });
            const entity = store.ensureArchetype(["position"]).insert({ position: { x: 1, y: 2, z: 3 } });
            const snapshot: any = store.toData({ copy: true });
            expect(snapshot.version).toBe(ECS_SNAPSHOT_VERSION);

            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            try {
                // A future/incompatible version is skipped with a warning — no
                // throw, and nothing from the snapshot is loaded.
                const future = createStore({ components: { position: positionSchema }, resources: {}, archetypes: {} });
                expect(() => future.fromData({ ...snapshot, version: ECS_SNAPSHOT_VERSION + 1 })).not.toThrow();
                expect(future.select(["position"])).toHaveLength(0);
                expect(warn).toHaveBeenCalledWith(expect.stringMatching(/version/i));

                // A legacy snapshot predating the version field is likewise skipped.
                const { version: _omit, ...legacy } = snapshot;
                const stale = createStore({ components: { position: positionSchema }, resources: {}, archetypes: {} });
                expect(() => stale.fromData(legacy)).not.toThrow();
                expect(stale.select(["position"])).toHaveLength(0);

                // The correctly-versioned snapshot loads normally.
                const target = createStore({ components: { position: positionSchema }, resources: {}, archetypes: {} });
                target.fromData(snapshot);
                expect(target.read(entity)).toEqual({ position: { x: 1, y: 2, z: 3 } });
            } finally {
                warn.mockRestore();
            }
        });

        it("toData(true) detaches the snapshot from later store mutation; toData() references live buffers", () => {
            const makePopulatedStore = () => {
                const store = createStore({ components: { health: healthSchema }, resources: {}, archetypes: {} });
                const archetype = store.ensureArchetype(["health"]);
                const entity = archetype.insert({ health: { current: 100, max: 100 } });
                return { store, entity };
            };
            const restore = (snapshot: unknown) => {
                const fresh = createStore({ components: { health: healthSchema }, resources: {}, archetypes: {} });
                fresh.fromData(snapshot);
                const restored = fresh.select(["health"]);
                return fresh.read(restored[0])?.health?.current;
            };

            // Detached: mutating after the snapshot must NOT change it.
            const detached = makePopulatedStore();
            const detachedSnapshot = detached.store.toData({ copy: true });
            detached.store.update(detached.entity, { health: { current: 1, max: 100 } });
            expect(restore(detachedSnapshot)).toBe(100);

            // Live (default): the snapshot references live buffers, so a later
            // mutation is visible through it — the behavior the `copy` flag fixes.
            const live = makePopulatedStore();
            const liveSnapshot = live.store.toData();
            live.store.update(live.entity, { health: { current: 1, max: 100 } });
            expect(restore(liveSnapshot)).toBe(1);
        });

        it("should create new resources when restoring to store with additional resources", () => {
            // Create original store with only one resource
            const originalStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Add some entities and update resource
            const archetype = originalStore.ensureArchetype(["position"]);
            archetype.insert({ position: { x: 1, y: 2, z: 3 } });
            originalStore.resources.time = { delta: 0.033, elapsed: 1.5 };

            // Serialize the store
            const serializedData = originalStore.toData();

            // Create new store with additional resources
            // Note: This is a limitation - when restoring to a store with different archetype structure,
            // entity locations may not be preserved correctly due to archetype ID shifts.
            // In practice, stores should be restored to compatible configurations.
            const newStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } },
                    score: { default: 0 }
                }, archetypes: {} });

            // Restore from serialized data
            newStore.fromData(serializedData);

            // Verify original resource is restored
            expect(newStore.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });

            // Verify new resources are created with default values
            expect(newStore.resources.config).toEqual({ debug: false, volume: 1.0 });
            expect(newStore.resources.score).toBe(0);

            // Verify new resources are writable
            newStore.resources.config = { debug: true, volume: 0.5 };
            newStore.resources.score = 100;
            expect(newStore.resources.config).toEqual({ debug: true, volume: 0.5 });
            expect(newStore.resources.score).toBe(100);

            // Note: Due to archetype ID shifts when adding new resources,
            // the original entity may not be preserved correctly.
            // This is a limitation of the current serialization approach.
            // In practice, stores should be restored to compatible configurations.
        });

        it("should handle restoring to store with fewer resources", () => {
            // Create original store with multiple resources
            const originalStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } },
                    config: { default: { debug: false, volume: 1.0 } },
                    score: { default: 0 }
                }, archetypes: {} });

            // Add entities and update resources
            const archetype = originalStore.ensureArchetype(["position"]);
            const entity = archetype.insert({ position: { x: 1, y: 2, z: 3 } });
            originalStore.resources.time = { delta: 0.033, elapsed: 1.5 };
            originalStore.resources.config = { debug: true, volume: 0.5 };
            originalStore.resources.score = 100;

            // Serialize the store
            const serializedData = originalStore.toData();

            // Create new store with only one resource
            const newStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Restore from serialized data
            newStore.fromData(serializedData);

            // Verify the remaining resource is restored
            expect(newStore.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });

            // Verify only the time resource exists
            expect(newStore.resources).toHaveProperty('time');
            expect(newStore.resources).not.toHaveProperty('config');
            expect(newStore.resources).not.toHaveProperty('score');

            // Verify entity is still there
            const restoredEntities = newStore.select(["position"]);
            expect(restoredEntities).toHaveLength(1);
            const restoredData = newStore.read(restoredEntities[0]);
            expect(restoredData).toEqual({
                position: { x: 1, y: 2, z: 3 }
            });
        });

        it("should preserve resource getter/setter functionality after restoration", () => {
            const store = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Update resource
            store.resources.time = { delta: 0.033, elapsed: 1.5 };

            // Serialize and deserialize
            const serializedData = store.toData();
            const newStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });
            newStore.fromData(serializedData);

            // Verify resource is restored
            expect(newStore.resources.time).toEqual({ delta: 0.033, elapsed: 1.5 });

            // Verify getter/setter still works
            newStore.resources.time = { delta: 0.025, elapsed: 2.0 };
            expect(newStore.resources.time).toEqual({ delta: 0.025, elapsed: 2.0 });

            // Verify the underlying archetype is updated
            const timeArchetypes = newStore.queryArchetypes(["time" as any]);
            expect(timeArchetypes).toHaveLength(1);
            expect(timeArchetypes[0].rowCount).toBe(1);
            expect(timeArchetypes[0].columns.time.get(0)).toEqual({ delta: 0.025, elapsed: 2.0 });
        });

        it("should handle complex resource objects during serialization", () => {
            const complexResource = {
                nested: {
                    deep: {
                        value: 42,
                        array: [1, 2, 3],
                        flag: true
                    }
                },
                count: 0
            };

            const store = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    complex: { default: complexResource }
                }, archetypes: {} });

            // Update complex resource
            const updatedComplex = {
                nested: {
                    deep: {
                        value: 100,
                        array: [4, 5, 6],
                        flag: false
                    }
                },
                count: 10
            };
            store.resources.complex = updatedComplex;

            // Add some entities
            const archetype = store.ensureArchetype(["position"]);
            archetype.insert({ position: { x: 1, y: 2, z: 3 } });

            // Serialize and deserialize
            const serializedData = store.toData();
            const newStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    complex: { default: complexResource }
                }, archetypes: {} });
            newStore.fromData(serializedData);

            // Verify complex resource is restored correctly
            expect(newStore.resources.complex).toEqual(updatedComplex);

            // Verify it's still writable
            const newComplex = { ...updatedComplex, count: 20 };
            newStore.resources.complex = newComplex;
            expect(newStore.resources.complex).toEqual(newComplex);
        });

        it("should handle empty resource schemas during restoration", () => {
            // Create store with resources
            const store = createStore({ components: {
                    position: positionSchema,
                }, resources: {
                    time: { default: { delta: 0.016, elapsed: 0 } }
                }, archetypes: {} });

            // Add entities and update resource
            const archetype = store.ensureArchetype(["position"]);
            archetype.insert({ position: { x: 1, y: 2, z: 3 } });
            store.resources.time = { delta: 0.033, elapsed: 1.5 };

            // Serialize
            const serializedData = store.toData();

            // Create new store with no resources
            const newStore = createStore({ components: {
                    position: positionSchema,
                }, resources: {}, archetypes: {} });

            // Restore - should not crash and should preserve entities
            newStore.fromData(serializedData);

            // Verify entities are preserved
            const restoredEntities = newStore.select(["position"]);
            expect(restoredEntities).toHaveLength(1);
            const restoredData = newStore.read(restoredEntities[0]);
            expect(restoredData).toEqual({
                position: { x: 1, y: 2, z: 3 }
            });

            // Verify no resources exist
            expect(Object.keys(newStore.resources)).toHaveLength(0);
        });
    });

    it("should return the same instance when extended", () => {
        const store = createStore({ components: { position: positionSchema }, resources: {}, archetypes: {} });
        const extended = store.extend({ components: {}, resources: {}, archetypes: {} });
        expect(extended).toBe(store);
    });

    describe("fromData sheds empty structural residue", () => {
        const num = { type: "number", default: 0 } as const satisfies Schema;

        it("does not recreate an empty archetype, nor adopt a schema no restored data uses", () => {
            const source = createStore({ components: { a: num, ghost: num }, resources: {}, archetypes: {} });
            const eA = source.ensureArchetype(["a"]).insert({ a: 1 });
            // An empty archetype (created, never populated) + its schema — the exact
            // residue a prior prune, or a since-removed feature, leaves behind.
            source.ensureArchetype(["ghost"]);
            const snap = source.toData({ copy: true }) as {
                componentSchemas: Record<string, unknown>;
                archetypesData: readonly { componentNames: readonly string[] }[];
            };
            // Sanity: the source snapshot really does carry the empty ghost residue.
            expect("ghost" in snap.componentSchemas).toBe(true);
            expect(snap.archetypesData.some((x) => x.componentNames.includes("ghost"))).toBe(true);

            // Loading it (even into a store that also declares ghost) neither
            // recreates the empty archetype nor keeps the unused schema.
            const target = createStore({ components: { a: num }, resources: {}, archetypes: {} });
            target.fromData(snap);
            expect(target.read(eA)).toEqual({ a: 1 });
            const reserialized = target.toData({ copy: true }) as {
                componentSchemas: Record<string, unknown>;
                archetypesData: readonly { componentNames: readonly string[] }[];
            };
            expect("ghost" in reserialized.componentSchemas).toBe(false);
            expect(reserialized.archetypesData.some((x) => x.componentNames.includes("ghost"))).toBe(false);
        });

        it("preserves an unknown component that still carries data (lossless) — only empty structure is shed", () => {
            const source = createStore({ components: { a: num, b: num }, resources: {}, archetypes: {} });
            const e = source.ensureArchetype(["a", "b"]).insert({ a: 1, b: 2 });
            const snap = source.toData({ copy: true });

            // `target` doesn't declare `b`, but the snapshot's `b` data is populated,
            // so it must survive the load untouched (unknown-but-populated ⇒ kept).
            const target = createStore({ components: { a: num }, resources: {}, archetypes: {} });
            target.fromData(snap);
            expect(target.read(e)).toEqual({ a: 1, b: 2 });
            const re = target.toData({ copy: true }) as { componentSchemas: Record<string, unknown> };
            expect("b" in re.componentSchemas).toBe(true);
        });

        it("does not let a snapshot schema override the loading store's own declared schema", () => {
            const source = createStore({
                components: { a: { type: "number", default: 0 } as const satisfies Schema },
                resources: {}, archetypes: {},
            });
            const e = source.ensureArchetype(["a"]).insert({ a: 5 });
            const snap = source.toData({ copy: true });

            const targetSchema = { type: "number", default: 99 } as const satisfies Schema;
            const target = createStore({ components: { a: targetSchema }, resources: {}, archetypes: {} });
            target.fromData(snap);
            // The live schema stays the target's (default 99), not the snapshot's (0).
            expect((target.componentSchemas as Record<string, { default?: number }>).a!.default).toBe(99);
            // Data still restores through the declared schema.
            expect(target.read(e)).toEqual({ a: 5 });
        });
    });

    describe("pruneToSchema (data prune + deferred structural shed)", () => {
        const num = { type: "number", default: 0 } as const satisfies Schema;

        const makeFullStore = () =>
            createStore({
                components: { a: num, b: num, c: num },
                resources: {
                    keptRes: { default: 0 as number },
                    foreignRes: { default: 0 as number },
                },
                archetypes: { AB: ["a", "b"], ABC: ["a", "b", "c"], COnly: ["c"] },
            });

        it("strips foreign component data, deletes only-foreign entities, drops foreign resources, and leaves zero foreign trace in toData", () => {
            const store = makeFullStore();
            const eAB = store.archetypes.AB.insert({ a: 1, b: 2 });
            const eABC = store.archetypes.ABC.insert({ a: 3, b: 4, c: 5 });
            const eCOnly = store.archetypes.COnly.insert({ c: 9 });
            store.resources.keptRes = 7;
            store.resources.foreignRes = 99;

            // Keep set = the "target schema": declared components + resources.
            store.pruneToSchema(new Set(["a", "b", "keptRes"]));

            // Declared entity untouched; mixed entity keeps declared data, loses c;
            // an entity whose every component is foreign is removed entirely.
            expect(store.read(eAB)).toEqual({ a: 1, b: 2 });
            expect(store.read(eABC)).toEqual({ a: 3, b: 4 });
            expect(store.read(eCOnly)).toBeNull();

            // Declared resource preserved; foreign resource gone (value + accessor).
            expect(store.resources.keptRes).toBe(7);
            expect((store.resources as Record<string, unknown>).foreignRes).toBeUndefined();

            // The foreign entity DATA is gone immediately. The empty foreign
            // archetypes / unused schemas may still be present as inert residue in
            // this store's own snapshot — by design they are shed on the next load,
            // not by an in-place structural rebuild.
            const prunedSnap = store.toData({ copy: true });

            // Loading the pruned document into a store that declares only the target
            // schema sheds the empty foreign archetypes and unused foreign schemas:
            // the reloaded, re-serialized document carries zero foreign trace, while
            // entity ids and declared data survive.
            const target = createStore({
                components: { a: num, b: num },
                resources: { keptRes: { default: 0 as number } },
                archetypes: { AB: ["a", "b"] },
            });
            target.fromData(prunedSnap);
            expect(target.read(eAB)).toEqual({ a: 1, b: 2 });
            expect(target.read(eABC)).toEqual({ a: 3, b: 4 });
            expect(target.resources.keptRes).toBe(7);

            const reserialized = target.toData({ copy: true }) as {
                componentSchemas: Record<string, unknown>;
                archetypesData: readonly { componentNames: readonly string[] }[];
            };
            expect("c" in reserialized.componentSchemas).toBe(false);
            expect("foreignRes" in reserialized.componentSchemas).toBe(false);
            for (const arch of reserialized.archetypesData) {
                expect(arch.componentNames).not.toContain("c");
                expect(arch.componentNames).not.toContain("foreignRes");
            }
        });
    });

}); 