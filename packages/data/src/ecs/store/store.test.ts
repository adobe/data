// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Store } from "./store.js";

describe("Store.Schema.create", () => {
    describe("partial schema creation", () => {
        it("should create a schema with all properties defaulting to empty objects when given empty schema", () => {
            const schema = Store.Schema.create({});

            expect(schema.components).toEqual({});
            expect(schema.resources).toEqual({});
            expect(schema.archetypes).toEqual({});
        });

        it("should create a schema with components and default empty objects for other properties when given only components", () => {
            const schema = Store.Schema.create({
                components: {
                    position: { type: "number" },
                    velocity: { type: "number" }
                }
            });

            expect(schema.components).toHaveProperty("position");
            expect(schema.components).toHaveProperty("velocity");
            expect(Object.keys(schema.resources)).toHaveLength(0);
            expect(Object.keys(schema.archetypes)).toHaveLength(0);
        });

        it("should create a schema with resources and default empty objects for other properties when given only resources", () => {
            const schema = Store.Schema.create({
                resources: {
                    time: { default: 0 },
                    score: { default: 100 }
                }
            });

            expect(schema.resources).toHaveProperty("time");
            expect(schema.resources).toHaveProperty("score");
            expect(Object.keys(schema.components)).toHaveLength(0);
            expect(Object.keys(schema.archetypes)).toHaveLength(0);
        });

        it("should create a schema with archetypes and default empty objects for other properties when given only archetypes", () => {
            const schema = Store.Schema.create({
                archetypes: {
                    Player: ["position", "health"] as any,
                    Enemy: ["position", "health", "ai"] as any
                }
            });

            expect(schema.archetypes).toHaveProperty("Player");
            expect(schema.archetypes).toHaveProperty("Enemy");
            expect(Object.keys(schema.components)).toHaveLength(0);
            expect(Object.keys(schema.resources)).toHaveLength(0);
        });

        it("should create a schema with specified properties and defaults for omitted ones when given multiple partial properties", () => {
            const schema = Store.Schema.create({
                components: {
                    health: { type: "number" }
                },
                resources: {
                    time: { default: 0 }
                }
            });

            expect(schema.components).toHaveProperty("health");
            expect(schema.resources).toHaveProperty("time");
            expect(Object.keys(schema.archetypes)).toHaveLength(0);
        });
    });

    describe("schema merging with dependencies", () => {
        it("should merge both schemas with all properties preserved when given partial schema with dependencies", () => {
            const baseSchema = Store.Schema.create({
                components: {
                    position: { type: "number" }
                },
                resources: {
                    time: { default: 0 }
                }
            });

            const extendedSchema = Store.Schema.create({
                components: {
                    velocity: { type: "number" }
                }
            }, [baseSchema]);

            expect(extendedSchema.components).toHaveProperty("position");
            expect(extendedSchema.components).toHaveProperty("velocity");
            expect(extendedSchema.resources).toHaveProperty("time");
            expect(Object.keys(extendedSchema.components)).toHaveLength(2);
            expect(Object.keys(extendedSchema.resources)).toHaveLength(1);
        });

        it("should create a schema containing only the dependency properties when given empty schema with dependencies", () => {
            const baseSchema = Store.Schema.create({
                components: {
                    transform: { type: "number" }
                },
                archetypes: {
                    Transformable: ["transform"]
                }
            });

            const emptyExtension = Store.Schema.create({}, [baseSchema]);

            expect(emptyExtension.components).toHaveProperty("transform");
            expect(emptyExtension.archetypes).toHaveProperty("Transformable");
            expect(Object.keys(emptyExtension.components)).toHaveLength(1);
            expect(Object.keys(emptyExtension.archetypes)).toHaveLength(1);
        });

        it("should merge all schemas together with properties from all dependencies when given multiple dependencies", () => {
            const schemaA = Store.Schema.create({
                components: { a: { type: "number" } }
            });

            const schemaB = Store.Schema.create({
                components: { b: { type: "number" } }
            });

            const schemaC = Store.Schema.create({
                components: { c: { type: "number" } }
            });

            const merged = Store.Schema.create({
                components: { d: { type: "number" } }
            }, [schemaA, schemaB, schemaC]);

            expect(merged.components).toHaveProperty("a");
            expect(merged.components).toHaveProperty("b");
            expect(merged.components).toHaveProperty("c");
            expect(merged.components).toHaveProperty("d");
            expect(Object.keys(merged.components)).toHaveLength(4);
        });

        it("should merge archetypes from dependencies", () => {
            const baseSchema = Store.Schema.create({
                archetypes: {
                    BaseEntity: ["id"] as any
                }
            });

            const extendedSchema = Store.Schema.create({
                archetypes: {
                    ExtendedEntity: ["id", "name"] as any
                }
            }, [baseSchema]);

            expect(extendedSchema.archetypes).toHaveProperty("BaseEntity");
            expect(extendedSchema.archetypes).toHaveProperty("ExtendedEntity");
            expect(Object.keys(extendedSchema.archetypes)).toHaveLength(2);
        });
    });

    describe("edge cases", () => {
        it("should merge schemas with dependencies taking precedence for overlapping properties", () => {
            const baseSchema = Store.Schema.create({
                components: {
                    position: { type: "number" },
                    velocity: { type: "number" }
                }
            });

            const extendedSchema = Store.Schema.create({
                components: {
                    position: { type: "number" },
                    mass: { type: "number" }
                }
            }, [baseSchema]);

            // All components should be present
            expect(extendedSchema.components).toHaveProperty("position");
            expect(extendedSchema.components).toHaveProperty("velocity");
            expect(extendedSchema.components).toHaveProperty("mass");
            expect(Object.keys(extendedSchema.components)).toHaveLength(3);
        });

        it("should handle archetypes that reference components from dependencies", () => {
            const baseSchema = Store.Schema.create({
                components: {
                    position: { type: "number" },
                    health: { type: "number" }
                }
            });

            const extendedSchema = Store.Schema.create({
                components: {
                    velocity: { type: "number" }
                },
                archetypes: {
                    DynamicEntity: ["position", "velocity"],
                    LivingEntity: ["position", "health"]
                }
            }, [baseSchema]);

            expect(extendedSchema.archetypes).toHaveProperty("DynamicEntity");
            expect(extendedSchema.archetypes).toHaveProperty("LivingEntity");
            expect(extendedSchema.archetypes.DynamicEntity).toEqual(["position", "velocity"]);
            expect(extendedSchema.archetypes.LivingEntity).toEqual(["position", "health"]);
        });

        it("should handle complex multi-level dependency chains", () => {
            const level1 = Store.Schema.create({
                components: { a: { type: "number" } }
            });

            const level2 = Store.Schema.create({
                components: { b: { type: "number" } }
            }, [level1]);

            const level3 = Store.Schema.create({
                components: { c: { type: "number" } }
            }, [level2]);

            expect(level3.components).toHaveProperty("a");
            expect(level3.components).toHaveProperty("b");
            expect(level3.components).toHaveProperty("c");
            expect(Object.keys(level3.components)).toHaveLength(3);
        });
    });
});

