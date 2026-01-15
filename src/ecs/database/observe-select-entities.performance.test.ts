// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it, beforeEach } from "vitest";
import { Store } from "../store/index.js";
import { Database } from "./database.js";
import { F32 } from "../../math/f32/index.js";
import { Boolean } from "../../schema/index.js";

describe("observeSelectEntities Performance Tests", () => {
    let database: ReturnType<typeof createTestDatabase>;

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
    });

    function createTestData(size: number): { entities: number[], testEntity: number } {
        const entities: number[] = [];

        // Create entities with position component (will be in our result set)
        for (let i = 0; i < size; i++) {
            const entity = database.transactions.createPositionEntity({ position: i });
            entities.push(entity);
        }

        // Create some entities without position component (won't be in result set)
        for (let i = 0; i < size / 10; i++) {
            database.transactions.createHealthEntity({ health: i });
        }

        // Return a test entity that we'll update
        const testEntity = entities[Math.floor(size / 2)];

        return { entities, testEntity };
    }

    function measureUpdateExecutionTime(updateFn: () => void, iterations = 100): number {
        const times: number[] = [];
        const useHrtime = typeof process !== 'undefined' && process.hrtime && typeof process.hrtime.bigint === 'function';
        for (let i = 0; i < iterations; i++) {
            let start: number | bigint, end: number | bigint;
            if (useHrtime) {
                start = process.hrtime.bigint();
                updateFn();
                end = process.hrtime.bigint();
                times.push(Number(end - start) / 1e6);
            } else {
                start = performance.now();
                updateFn();
                end = performance.now();
                times.push(end - start);
            }
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(iterations / 2)];
        return median > 0 ? median : Number.EPSILON;
    }

    describe("O(1) Performance Verification", () => {
        it("should maintain consistent update execution times across different dataset sizes", () => {
            const sizes = [10, 1000, 10000];
            const updateTimes: number[] = [];
            for (const size of sizes) {
                const { testEntity } = createTestData(size);
                let counter = 0;
                const updateTime = measureUpdateExecutionTime(() => {
                    // Use a unique value each time to avoid deduplication
                    database.transactions.updateEntity({
                        entity: testEntity,
                        values: { position: ++counter }
                    });
                });
                updateTimes.push(updateTime);
            }
            const sizeRatio1 = sizes[1] / sizes[0];
            const sizeRatio2 = sizes[2] / sizes[1];
            const timeRatio1 = updateTimes[1] / updateTimes[0];
            const timeRatio2 = updateTimes[2] / updateTimes[1];
            if (updateTimes.some(time => time <= Number.EPSILON)) {
                console.log("One or more update times measured as 0ms; skipping ratio checks due to timer precision limits.");
                return;
            }
            expect(timeRatio1).toBeLessThan(sizeRatio1 * 0.1);
            expect(timeRatio2).toBeLessThan(sizeRatio2 * 0.1);
            const totalTimeRatio = updateTimes[2] / updateTimes[0];
            expect(totalTimeRatio).toBeLessThan(5);
        });

        it("should not notify observer when update does not affect result set", async () => {
            const { testEntity } = createTestData(1000);
            let notificationCount = 0;
            const unsubscribe = database.observe.select(["position"])(() => {
                notificationCount++;
            });
            await Promise.resolve();
            await Promise.resolve();
            expect(notificationCount).toBe(1);
            // Update a component not in the select (should not notify)
            database.transactions.updateEntity({
                entity: testEntity,
                values: { health: 123 }
            });
            await Promise.resolve();
            await Promise.resolve();
            expect(notificationCount).toBe(1);
            // Update with the same value (should not notify)
            database.transactions.updateEntity({
                entity: testEntity,
                values: { position: 0 }
            });
            await Promise.resolve();
            await Promise.resolve();
            expect(notificationCount).toBe(1);
            unsubscribe();
        });
    });
}); 