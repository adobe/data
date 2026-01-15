// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Store } from "../store/index.js";
import { Database } from "./database.js";
import { F32 } from "../../math/f32/index.js";
import { Boolean } from "../../schema/index.js";

describe("observeSelectEntities", () => {
    let database: ReturnType<typeof createTestDatabase>;
    let entities: Record<string, number>;

    function createTestDatabase() {
        const store = Store.create({
            components: {
                position: F32.schema,
                health: F32.schema,
                name: { type: "string" },
                score: F32.schema,
                active: Boolean.schema
            },
            resources: {},
            archetypes: {
                Position: ["position"],
                Health: ["health"],
                Name: ["name"],
                PositionHealth: ["position", "health"],
                PositionName: ["position", "name"],
                HealthName: ["health", "name"],
                Full: ["position", "health", "name", "score", "active"]
            }
        });

        return Database.create(store, {
            createPositionEntity(store, args: { position: number }) {
                return store.archetypes.Position.insert(args);
            },
            createHealthEntity(store, args: { health: number }) {
                return store.archetypes.Health.insert(args);
            },
            createNameEntity(store, args: { name: string }) {
                return store.archetypes.Name.insert(args);
            },
            createPositionHealthEntity(store, args: { position: number, health: number }) {
                return store.archetypes.PositionHealth.insert(args);
            },
            createPositionNameEntity(store, args: { position: number, name: string }) {
                return store.archetypes.PositionName.insert(args);
            },
            createHealthNameEntity(store, args: { health: number, name: string }) {
                return store.archetypes.HealthName.insert(args);
            },
            createFullEntity(store, args: { position: number, health: number, name: string, score: number, active: boolean }) {
                return store.archetypes.Full.insert(args);
            },
            updateEntity(store, args: { entity: number, values: any }) {
                return store.update(args.entity, args.values);
            },
            deleteEntity(store, args: { entity: number }) {
                return store.delete(args.entity);
            }
        });
    }

    beforeEach(() => {
        database = createTestDatabase();

        // Create test entities across different archetypes
        entities = {
            // Position only archetype
            pos1: database.transactions.createPositionEntity({ position: 1 }),
            pos2: database.transactions.createPositionEntity({ position: 2 }),
            pos3: database.transactions.createPositionEntity({ position: 3 }),

            // Health only archetype
            health1: database.transactions.createHealthEntity({ health: 50 }),
            health2: database.transactions.createHealthEntity({ health: 75 }),
            health3: database.transactions.createHealthEntity({ health: 25 }),

            // Name only archetype
            name1: database.transactions.createNameEntity({ name: "Alice" }),
            name2: database.transactions.createNameEntity({ name: "Bob" }),
            name3: database.transactions.createNameEntity({ name: "Charlie" }),

            // Position + Health archetype
            posHealth1: database.transactions.createPositionHealthEntity({
                position: 10,
                health: 80
            }),
            posHealth2: database.transactions.createPositionHealthEntity({
                position: 13,
                health: 90
            }),

            // Position + Name archetype
            posName1: database.transactions.createPositionNameEntity({
                position: 16,
                name: "David"
            }),
            posName2: database.transactions.createPositionNameEntity({
                position: 19,
                name: "Eve"
            }),

            // Health + Name archetype
            healthName1: database.transactions.createHealthNameEntity({
                health: 60,
                name: "Frank"
            }),
            healthName2: database.transactions.createHealthNameEntity({
                health: 40,
                name: "Grace"
            }),

            // Full archetype with all components
            full1: database.transactions.createFullEntity({
                position: 22,
                health: 95,
                name: "Henry",
                score: 85.5,
                active: true
            }),
            full2: database.transactions.createFullEntity({
                position: 25,
                health: 30,
                name: "Iris",
                score: 92.0,
                active: false
            }),
            full3: database.transactions.createFullEntity({
                position: 28,
                health: 70,
                name: "Jack",
                score: 78.3,
                active: true
            }),
        };
    });

    describe("Basic functionality", () => {
        it("should observe entities with position component", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Should include entities from position-only, position+health, position+name, and full archetypes
            const expected = [
                entities.pos1, entities.pos2, entities.pos3,
                entities.posHealth1, entities.posHealth2,
                entities.posName1, entities.posName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(observer).toHaveBeenCalledWith(expect.arrayContaining(expected));
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should observe entities with health component", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["health"])(observer);

            // Should include entities from health-only, position+health, health+name, and full archetypes
            const expected = [
                entities.health1, entities.health2, entities.health3,
                entities.posHealth1, entities.posHealth2,
                entities.healthName1, entities.healthName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(observer).toHaveBeenCalledWith(expect.arrayContaining(expected));
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should observe entities with name component", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["name"])(observer);

            // Should include entities from name-only, position+name, health+name, and full archetypes
            const expected = [
                entities.name1, entities.name2, entities.name3,
                entities.posName1, entities.posName2,
                entities.healthName1, entities.healthName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(observer).toHaveBeenCalledWith(expect.arrayContaining(expected));
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should observe entities with multiple components", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position", "health"])(observer);

            // Should only include entities from position+health and full archetypes
            const expected = [
                entities.posHealth1, entities.posHealth2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(observer).toHaveBeenCalledWith(expect.arrayContaining(expected));
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should observe entities with all components", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position", "health", "name", "score", "active"])(observer);

            // Should only include entities from full archetype
            const expected = [entities.full1, entities.full2, entities.full3];

            expect(observer).toHaveBeenCalledWith(expect.arrayContaining(expected));
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });
    });

    describe("Reactive updates", () => {
        it("should notify when relevant components change", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialCall = observer.mock.calls[0][0];
            expect(initialCall).toContain(entities.pos1);

            // Update position component - should NOT trigger new notification since entity stays in result set
            database.transactions.updateEntity({
                entity: entities.pos1,
                values: { position: 999 }
            });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should still only be called once (no new notification since only values changed)
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should not notify when irrelevant components change", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);

            // Update health component - should NOT trigger notification for position query
            database.transactions.updateEntity({
                entity: entities.health1,
                values: { health: 999 }
            });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should still only be called once (no new notification)
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should handle entity creation", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialCount = observer.mock.calls[0][0].length;

            // Create new entity with position component
            const newEntity = database.transactions.createPositionEntity({ position: 100 });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should get new notification with additional entity
            expect(observer).toHaveBeenCalledTimes(2);
            const updatedCall = observer.mock.calls[1][0];
            expect(updatedCall).toContain(newEntity);
            expect(updatedCall.length).toBe(initialCount + 1);

            unsubscribe();
        });

        it("should handle entity deletion", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialCall = observer.mock.calls[0][0];
            expect(initialCall).toContain(entities.pos1);

            // Delete entity with position component
            database.transactions.deleteEntity({ entity: entities.pos1 });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should get new notification without the deleted entity
            expect(observer).toHaveBeenCalledTimes(2);
            const updatedCall = observer.mock.calls[1][0];
            expect(updatedCall).not.toContain(entities.pos1);

            unsubscribe();
        });

        it("should handle entity updates", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position", "health"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            expect(observer.mock.calls[0][0]).toContain(entities.posHealth1);

            // Update both position and health components - should NOT trigger new notification since entity stays in result set
            database.transactions.updateEntity({
                entity: entities.posHealth1,
                values: { position: 999, health: 888 }
            });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should still only be called once (no new notification since only values changed)
            expect(observer).toHaveBeenCalledTimes(1);

            unsubscribe();
        });
    });

    describe("Caching behavior", () => {
        it("should cache observe functions for identical queries", () => {
            const observer1 = vi.fn();
            const observer2 = vi.fn();

            // Create two observers with identical queries
            const unsubscribe1 = database.observe.select(["position"])(observer1);
            const unsubscribe2 = database.observe.select(["position"])(observer2);

            // Both should be called with the same initial data
            expect(observer1).toHaveBeenCalledTimes(1);
            expect(observer2).toHaveBeenCalledTimes(1);
            expect(observer1.mock.calls[0][0]).toEqual(observer2.mock.calls[0][0]);

            // Verify they're the same function reference (cached)
            const observe1 = database.observe.select(["position"]);
            const observe2 = database.observe.select(["position"]);
            expect(observe1).toBe(observe2);

            unsubscribe1();
            unsubscribe2();
        });

        it("should create new observe functions for different queries", () => {
            const observer1 = vi.fn();
            const observer2 = vi.fn();

            // Create observers with different queries
            const unsubscribe1 = database.observe.select(["position"])(observer1);
            const unsubscribe2 = database.observe.select(["health"])(observer2);

            // Both should be called with different initial data
            expect(observer1).toHaveBeenCalledTimes(1);
            expect(observer2).toHaveBeenCalledTimes(1);
            expect(observer1.mock.calls[0][0]).not.toEqual(observer2.mock.calls[0][0]);

            // Verify they're different function references
            const observe1 = database.observe.select(["position"]);
            const observe2 = database.observe.select(["health"]);
            expect(observe1).not.toBe(observe2);

            unsubscribe1();
            unsubscribe2();
        });

        it("should batch multiple synchronous actions into single notification", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialCount = observer.mock.calls[0][0].length;

            // Execute multiple actions synchronously
            const entity1 = database.transactions.createPositionEntity({ position: 100 });
            const entity2 = database.transactions.createPositionEntity({ position: 200 });
            const entity3 = database.transactions.createPositionEntity({ position: 300 });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should only get one additional notification (not three)
            expect(observer).toHaveBeenCalledTimes(2);
            const updatedCall = observer.mock.calls[1][0];
            expect(updatedCall).toContain(entity1);
            expect(updatedCall).toContain(entity2);
            expect(updatedCall).toContain(entity3);
            expect(updatedCall.length).toBe(initialCount + 3);

            unsubscribe();
        });

        it("should handle mixed synchronous and asynchronous actions", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position"])(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialCount = observer.mock.calls[0][0].length;

            // First synchronous transaction
            const entity1 = database.transactions.createPositionEntity({ position: 100 });

            // Wait for microtask
            await Promise.resolve();

            // Second synchronous transaction
            const entity2 = database.transactions.createPositionEntity({ position: 200 });

            // Wait for microtask
            await Promise.resolve();

            // Should get two additional notifications (one for each batch)
            expect(observer).toHaveBeenCalledTimes(3);

            const firstUpdate = observer.mock.calls[1][0];
            expect(firstUpdate).toContain(entity1);
            expect(firstUpdate.length).toBe(initialCount + 1);

            const secondUpdate = observer.mock.calls[2][0];
            expect(secondUpdate).toContain(entity2);
            expect(secondUpdate.length).toBe(initialCount + 2);

            unsubscribe();
        });
    });

    describe("Filtering and ordering", () => {
        it("should support where clause filtering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["name"], {
                where: { name: "Alice" }
            })(observer);

            // Should only include the entity with name "Alice"
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(1);
            expect(result).toContain(entities.name1);

            unsubscribe();
        });

        it("should support numeric comparison filtering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["score"], {
                where: { score: { ">": 80 } }
            })(observer);

            // Should only include entities with score > 80
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(2);
            expect(result).toContain(entities.full1); // score: 85.5
            expect(result).toContain(entities.full2); // score: 92.0

            unsubscribe();
        });

        it("should support boolean filtering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["active"], {
                where: { active: true }
            })(observer);

            // Should only include entities with active: true
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(2);
            expect(result).toContain(entities.full1);
            expect(result).toContain(entities.full3);

            unsubscribe();
        });

        it("should support multiple condition filtering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["position", "health"], {
                where: {
                    position: 22,
                    health: 95
                }
            })(observer);

            // Should only include entities with exact position and health values
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(1);
            expect(result).toContain(entities.full1);

            unsubscribe();
        });

        it("should support order clause sorting", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["score"], {
                order: { score: true }
            })(observer);

            // Should be ordered by score ascending
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(3);
            expect(result[0]).toBe(entities.full3); // 78.3
            expect(result[1]).toBe(entities.full1); // 85.5
            expect(result[2]).toBe(entities.full2); // 92.0

            unsubscribe();
        });

        it("should support descending order", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["score"], {
                order: { score: false }
            })(observer);

            // Should be ordered by score descending
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(3);
            expect(result[0]).toBe(entities.full2); // 92.0
            expect(result[1]).toBe(entities.full1); // 85.5
            expect(result[2]).toBe(entities.full3); // 78.3

            unsubscribe();
        });

        it("should support string ordering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["name"], {
                order: { name: true }
            })(observer);

            // Should be ordered alphabetically
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(10);
            expect(result[0]).toBe(entities.name1); // Alice
            expect(result[1]).toBe(entities.name2); // Bob
            expect(result[2]).toBe(entities.name3); // Charlie

            unsubscribe();
        });

        it("should support combined filtering and ordering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["score"], {
                where: { score: { ">": 80 } },
                order: { score: true }
            })(observer);

            // Should filter to score > 80 and order ascending
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(2);
            expect(result[0]).toBe(entities.full1); // 85.5
            expect(result[1]).toBe(entities.full2); // 92.0

            unsubscribe();
        });

        it("should handle empty results from filtering", () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["name"], {
                where: { name: "NonExistent" }
            })(observer);

            // Should return empty array for non-existent name
            expect(observer).toHaveBeenCalledTimes(1);
            const result = observer.mock.calls[0][0];
            expect(result).toHaveLength(0);

            unsubscribe();
        });

        it("should reactively update filtered results", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["score"], {
                where: { score: { ">": 80 } }
            })(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialResult = observer.mock.calls[0][0];
            expect(initialResult).toHaveLength(2);

            // Update score to make it eligible for the filter
            database.transactions.updateEntity({
                entity: entities.full3,
                values: { score: 95.0 }
            });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should get new notification with updated results
            expect(observer).toHaveBeenCalledTimes(2);
            const updatedResult = observer.mock.calls[1][0];
            expect(updatedResult).toHaveLength(3);
            expect(updatedResult).toContain(entities.full3);

            unsubscribe();
        });

        it("should reactively update ordered results", async () => {
            const observer = vi.fn();
            const unsubscribe = database.observe.select(["score"], {
                order: { score: true }
            })(observer);

            // Initial notification
            expect(observer).toHaveBeenCalledTimes(1);
            const initialResult = observer.mock.calls[0][0];
            expect(initialResult[0]).toBe(entities.full3); // 78.3

            // Update score to change the order
            database.transactions.updateEntity({
                entity: entities.full3,
                values: { score: 100.0 }
            });

            // Wait for microtask to complete
            await Promise.resolve();

            // Should get new notification with reordered results
            expect(observer).toHaveBeenCalledTimes(2);
            const updatedResult = observer.mock.calls[1][0];
            expect(updatedResult[2]).toBe(entities.full3); // Now last (100.0)

            unsubscribe();
        });
    });

}); 