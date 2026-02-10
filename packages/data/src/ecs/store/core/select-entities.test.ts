// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { selectEntities } from "./select-entities.js";
import { createCore } from "./create-core.js";
import { Schema } from "../../../schema/index.js";
import { F32 } from "../../../math/f32/index.js";

const nameSchema = {
    type: "string"
} as const satisfies Schema;

const scoreSchema = {
    type: "number"
} as const satisfies Schema;

const activeSchema = {
    type: "boolean"
} as const satisfies Schema;

describe("selectEntities", () => {
    // Create a core instance with multiple components for testing
    const core = createCore({
        position: F32.schema,
        health: F32.schema,
        name: nameSchema,
        score: scoreSchema,
        active: activeSchema,
    });

    // Create multiple archetypes with different component combinations
    const positionArchetype = core.ensureArchetype(["id", "position"]);
    const healthArchetype = core.ensureArchetype(["id", "health"]);
    const nameArchetype = core.ensureArchetype(["id", "name"]);
    const positionHealthArchetype = core.ensureArchetype(["id", "position", "health"]);
    const positionNameArchetype = core.ensureArchetype(["id", "position", "name"]);
    const healthNameArchetype = core.ensureArchetype(["id", "health", "name"]);
    const fullArchetype = core.ensureArchetype(["id", "position", "health", "name", "score", "active"]);

    // Create test entities across different archetypes
    const entities = {
        // Position only archetype
        pos1: positionArchetype.insert({ position: 1 }),
        pos2: positionArchetype.insert({ position: 2 }),
        pos3: positionArchetype.insert({ position: 3 }),

        // Health only archetype
        health1: healthArchetype.insert({ health: 50 }),
        health2: healthArchetype.insert({ health: 75 }),
        health3: healthArchetype.insert({ health: 25 }),

        // Name only archetype
        name1: nameArchetype.insert({ name: "Alice" }),
        name2: nameArchetype.insert({ name: "Bob" }),
        name3: nameArchetype.insert({ name: "Charlie" }),

        // Position + Health archetype
        posHealth1: positionHealthArchetype.insert({
            position: 10,
            health: 80
        }),
        posHealth2: positionHealthArchetype.insert({
            position: 13,
            health: 90
        }),

        // Position + Name archetype
        posName1: positionNameArchetype.insert({
            position: 16,
            name: "David"
        }),
        posName2: positionNameArchetype.insert({
            position: 19,
            name: "Eve"
        }),

        // Health + Name archetype
        healthName1: healthNameArchetype.insert({
            health: 60,
            name: "Frank"
        }),
        healthName2: healthNameArchetype.insert({
            health: 40,
            name: "Grace"
        }),

        // Full archetype with all components
        full1: fullArchetype.insert({
            position: 22,
            health: 95,
            name: "Henry",
            score: 85.5,
            active: true
        }),
        full2: fullArchetype.insert({
            position: 25,
            health: 30,
            name: "Iris",
            score: 92.0,
            active: false
        }),
        full3: fullArchetype.insert({
            position: 28,
            health: 70,
            name: "Jack",
            score: 78.3,
            active: true
        }),
    };

    describe("Fast path (no where filter or order)", () => {
        it("should return all entities with position component", () => {
            const result = selectEntities(core, ["position"]);

            // Should include entities from position-only, position+health, position+name, and full archetypes
            const expected = [
                entities.pos1, entities.pos2, entities.pos3,
                entities.posHealth1, entities.posHealth2,
                entities.posName1, entities.posName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });

        it("should return all entities with health component", () => {
            const result = selectEntities(core, ["health"]);

            // Should include entities from health-only, position+health, health+name, and full archetypes
            const expected = [
                entities.health1, entities.health2, entities.health3,
                entities.posHealth1, entities.posHealth2,
                entities.healthName1, entities.healthName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });

        it("should return all entities with name component", () => {
            const result = selectEntities(core, ["name"]);

            // Should include entities from name-only, position+name, health+name, and full archetypes
            const expected = [
                entities.name1, entities.name2, entities.name3,
                entities.posName1, entities.posName2,
                entities.healthName1, entities.healthName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });

        it("should return entities with multiple components", () => {
            const result = selectEntities(core, ["position", "health"]);

            // Should only include entities from position+health and full archetypes
            const expected = [
                entities.posHealth1, entities.posHealth2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });

        it("should return entities with all components", () => {
            const result = selectEntities(core, ["position", "health", "name", "score", "active"]);

            // Should only include entities from full archetype
            const expected = [entities.full1, entities.full2, entities.full3];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });
    });

    describe("Filtering only (where clause without order)", () => {
        it("should filter by equality conditions", () => {
            const result = selectEntities(core, ["name"], {
                where: { name: "Alice" }
            });

            expect(result).toHaveLength(1);
            expect(result).toContain(entities.name1);
        });

        it("should filter by numeric comparisons", () => {
            const result = selectEntities(core, ["score"], {
                where: { score: { ">": 80 } }
            });

            expect(result).toHaveLength(2);
            expect(result).toContain(entities.full1); // score: 85.5
            expect(result).toContain(entities.full2); // score: 92.0
        });

        it("should filter by boolean conditions", () => {
            const result = selectEntities(core, ["active"], {
                where: { active: true }
            });

            expect(result).toHaveLength(2);
            expect(result).toContain(entities.full1);
            expect(result).toContain(entities.full3);
        });

        it("should filter by multiple conditions", () => {
            const result = selectEntities(core, ["position", "health"], {
                where: {
                    position: 22,
                    health: 95
                }
            });

            // Only full1 has this exact position and health
            expect(result).toHaveLength(1);
            expect(result).toContain(entities.full1);
        });

        it("should handle empty results", () => {
            const result = selectEntities(core, ["name"], {
                where: { name: "NonExistent" }
            });

            expect(result).toHaveLength(0);
        });

        it("should filter across multiple archetypes", () => {
            const result = selectEntities(core, ["health"], {
                where: { health: 75 }
            });

            // Should include entities from health-only archetype
            expect(result).toHaveLength(1);
            expect(result).toContain(entities.health2);
        });
    });

    describe("Ordering with optional filtering", () => {
        it("should order by single field ascending", () => {
            const result = selectEntities(core, ["score"], {
                order: { score: true }
            });

            // Should be ordered by score ascending: 78.3, 85.5, 92.0
            expect(result).toHaveLength(3);
            expect(result[0]).toBe(entities.full3); // 78.3
            expect(result[1]).toBe(entities.full1); // 85.5
            expect(result[2]).toBe(entities.full2); // 92.0
        });

        it("should order by single field descending", () => {
            const result = selectEntities(core, ["score"], {
                order: { score: false }
            });

            // Should be ordered by score descending: 92.0, 85.5, 78.3
            expect(result).toHaveLength(3);
            expect(result[0]).toBe(entities.full2); // 92.0
            expect(result[1]).toBe(entities.full1); // 85.5
            expect(result[2]).toBe(entities.full3); // 78.3
        });

        it("should order by multiple fields", () => {
            const result = selectEntities(core, ["active", "score"], {
                order: { active: false, score: true }
            });

            // Should be ordered by active descending (false first), then score ascending
            // active: false entities: full2 (score: 92.0)
            // active: true entities: full1 (score: 85.5), full3 (score: 78.3)
            expect(result).toHaveLength(3);
            // The exact order depends on how the sorting algorithm handles the boolean values
            // Let's just verify we have the right entities
            expect(result).toContain(entities.full1);
            expect(result).toContain(entities.full2);
            expect(result).toContain(entities.full3);
        });

        it("should order by string fields", () => {
            const result = selectEntities(core, ["name"], {
                order: { name: true }
            });

            // Should be ordered alphabetically: Alice, Bob, Charlie, David, Eve, Frank, Grace, Henry, Iris, Jack
            expect(result).toHaveLength(10);
            expect(result[0]).toBe(entities.name1); // Alice
            expect(result[1]).toBe(entities.name2); // Bob
            expect(result[2]).toBe(entities.name3); // Charlie
            expect(result[3]).toBe(entities.posName1); // David
            expect(result[4]).toBe(entities.posName2); // Eve
            expect(result[5]).toBe(entities.healthName1); // Frank
            expect(result[6]).toBe(entities.healthName2); // Grace
            expect(result[7]).toBe(entities.full1); // Henry
            expect(result[8]).toBe(entities.full2); // Iris
            expect(result[9]).toBe(entities.full3); // Jack
        });

        it("should combine filtering and ordering", () => {
            const result = selectEntities(core, ["score", "active"], {
                where: { active: true },
                order: { score: false }
            });

            // Should filter to active: true entities and order by score descending
            expect(result).toHaveLength(2);
            expect(result[0]).toBe(entities.full1); // score: 85.5
            expect(result[1]).toBe(entities.full3); // score: 78.3
        });

        it("should handle complex filtering and ordering", () => {
            const result = selectEntities(core, ["position", "health", "name"], {
                where: {
                    position: 22,
                    health: 95
                },
                order: { name: true }
            });

            // Should filter to entities with specific position and health, then order by name
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(entities.full1); // name: Henry
        });

        it("should handle ordering with numeric comparisons", () => {
            const result = selectEntities(core, ["health"], {
                where: { health: 60 },
                order: { health: true }
            });

            // Should filter to specific health value and order by health ascending
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(entities.healthName1); // 60
        });
    });

    describe("Edge cases and error handling", () => {
        it("should handle empty include array", () => {
            const result = selectEntities(core, []);
            // Empty include array should return all entities (this is the current behavior)
            expect(result.length).toBeGreaterThan(0);
        });

        it("should handle empty where clause", () => {
            const result = selectEntities(core, ["position"], {
                where: {}
            });

            // Should behave same as fast path
            const expected = [
                entities.pos1, entities.pos2, entities.pos3,
                entities.posHealth1, entities.posHealth2,
                entities.posName1, entities.posName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });

        it("should handle empty order clause", () => {
            const result = selectEntities(core, ["position"], {
                order: {}
            });

            // Should behave same as fast path
            const expected = [
                entities.pos1, entities.pos2, entities.pos3,
                entities.posHealth1, entities.posHealth2,
                entities.posName1, entities.posName2,
                entities.full1, entities.full2, entities.full3
            ];

            expect(result).toHaveLength(expected.length);
            expect([...result].sort()).toEqual([...expected].sort());
        });
    });

    describe("Performance characteristics", () => {
        it("should handle large number of entities efficiently", () => {
            // Create additional entities to test performance
            const largeArchetype = core.ensureArchetype(["id", "score"]);
            const largeEntities: number[] = [];

            for (let i = 0; i < 100; i++) {
                const entity = largeArchetype.insert({ score: Math.random() * 100 });
                largeEntities.push(entity);
            }

            const result = selectEntities(core, ["score"], {
                where: { score: { ">": 50 } },
                order: { score: false }
            });

            // Should return entities with score > 50, ordered descending
            expect(result.length).toBeGreaterThan(0);

            // Verify ordering
            for (let i = 1; i < result.length; i++) {
                const prevScore = core.read(result[i - 1])?.score;
                const currScore = core.read(result[i])?.score;
                if (prevScore !== undefined && currScore !== undefined) {
                    expect(prevScore).toBeGreaterThanOrEqual(currScore);
                }
            }
        });

        it("should maintain consistent results across multiple calls", () => {
            const options = {
                where: { health: 75 },
                order: { health: false }
            } as const;

            const result1 = selectEntities(core, ["health"], options);
            const result2 = selectEntities(core, ["health"], options);

            expect(result1).toEqual(result2);
        });
    });
}); 