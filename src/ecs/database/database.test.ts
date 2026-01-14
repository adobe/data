/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";

describe("Database.create", () => {
    it("should create an empty database without errors when called with no arguments", () => {
        const db = Database.create();

        expect(db).toBeDefined();
        expect(db.store).toBeDefined();
        expect(db.transactions).toBeDefined();
    });
});

describe("Database.Plugin.create", () => {
    describe("partial schema creation", () => {
        it("should create a schema with all properties defaulting to empty objects when given empty schema", () => {
            const schema = Database.Plugin.create({});

            expect(schema.components).toEqual({});
            expect(schema.resources).toEqual({});
            expect(schema.archetypes).toEqual({});
            expect(schema.transactions).toEqual({});
        });

        it("should create a schema with components and default empty objects for other properties when given only components", () => {
            const schema = Database.Plugin.create({
                components: {
                    position: { type: "number" },
                    velocity: { type: "number" }
                }
            });

            expect(schema.components).toHaveProperty("position");
            expect(schema.components).toHaveProperty("velocity");
            expect(Object.keys(schema.resources)).toHaveLength(0);
            expect(Object.keys(schema.archetypes)).toHaveLength(0);
            expect(Object.keys(schema.transactions)).toHaveLength(0);
        });

        it("should create a schema with transactions and default empty objects for other properties when given only transactions", () => {
            const testTransaction = () => { };
            const schema = Database.Plugin.create({
                transactions: {
                    updateEntity: testTransaction
                }
            });

            expect(schema.transactions).toHaveProperty("updateEntity");
            expect(schema.transactions.updateEntity).toBe(testTransaction);
            expect(Object.keys(schema.components)).toHaveLength(0);
            expect(Object.keys(schema.resources)).toHaveLength(0);
            expect(Object.keys(schema.archetypes)).toHaveLength(0);
        });

        it("should create a schema with specified properties and defaults for omitted ones when given multiple partial properties", () => {
            const schema = Database.Plugin.create({
                components: {
                    health: { type: "number" }
                },
                resources: {
                    time: { default: 0 }
                },
                transactions: {
                    updateHealth: () => { }
                }
            });

            expect(schema.components).toHaveProperty("health");
            expect(schema.resources).toHaveProperty("time");
            expect(schema.transactions).toHaveProperty("updateHealth");
            expect(Object.keys(schema.archetypes)).toHaveLength(0);
        });
    });

    describe("schema merging with dependencies", () => {
        it("should merge both schemas with all properties preserved when given partial schema with dependencies", () => {
            const baseSchema = Database.Plugin.create({
                components: {
                    position: { type: "number" }
                },
                resources: {
                    time: { default: 0 }
                }
            });

            const extendedSchema = Database.Plugin.create({
                extends: baseSchema,
                components: {
                    velocity: { type: "number" }
                },
            });

            expect(extendedSchema.components).toHaveProperty("position");
            expect(extendedSchema.components).toHaveProperty("velocity");
            expect(extendedSchema.resources).toHaveProperty("time");
            expect(Object.keys(extendedSchema.components)).toHaveLength(2);
            expect(Object.keys(extendedSchema.resources)).toHaveLength(1);
        });

        it("should create a schema containing only the dependency properties when given empty schema with dependencies", () => {
            const baseSchema = Database.Plugin.create({
                components: {
                    transform: { type: "number" }
                },
                transactions: {
                    updateTransform: () => { }
                }
            });

            const emptyExtension = Database.Plugin.create({ extends: baseSchema });

            expect(emptyExtension.components).toHaveProperty("transform");
            expect(emptyExtension.transactions).toHaveProperty("updateTransform");
            expect(Object.keys(emptyExtension.components)).toHaveLength(1);
            expect(Object.keys(emptyExtension.transactions)).toHaveLength(1);
        });

        it("should merge all plugins together with properties from all dependencies when given multiple dependencies", () => {
            const pluginA = Database.Plugin.create({
                components: { a: { type: "number" } }
            });

            const pluginB = Database.Plugin.create({
                components: { b: { type: "number" } }
            });

            const pluginC = Database.Plugin.create({
                components: { c: { type: "number" } }
            });

            const combinedBase = Database.Plugin.combine(pluginA, pluginB, pluginC) as any;
            const merged = Database.Plugin.create({
                extends: combinedBase,
                components: { d: { type: "number" } },
            });

            expect(merged.components).toHaveProperty("a");
            expect(merged.components).toHaveProperty("b");
            expect(merged.components).toHaveProperty("c");
            expect(merged.components).toHaveProperty("d");
            expect(Object.keys(merged.components)).toHaveLength(4);
        });

        it("should merge transactions from dependencies", () => {
            const baseSchema = Database.Plugin.create({
                transactions: {
                    baseAction: () => { }
                }
            });

            const extendedSchema = Database.Plugin.create({
                extends: baseSchema,
                transactions: {
                    extendedAction: () => { }
                },
            });

            expect(extendedSchema.transactions).toHaveProperty("baseAction");
            expect(extendedSchema.transactions).toHaveProperty("extendedAction");
            expect(Object.keys(extendedSchema.transactions)).toHaveLength(2);
        });
    });

    describe("edge cases", () => {
        it("should merge schemas with dependencies - shared components must use same reference", () => {
            const positionComponent = { type: "number" as const };
            
            const baseSchema = Database.Plugin.create({
                components: {
                    position: positionComponent,
                    velocity: { type: "number" as const }
                }
            });

            const extendedSchema = Database.Plugin.create({
                extends: baseSchema,
                components: {
                    position: positionComponent, // Must use same reference
                    mass: { type: "number" as const }
                },
            });

            // All components should be present
            expect(extendedSchema.components).toHaveProperty("position");
            expect(extendedSchema.components).toHaveProperty("velocity");
            expect(extendedSchema.components).toHaveProperty("mass");
            expect(Object.keys(extendedSchema.components)).toHaveLength(3);
        });

        it("should handle archetypes that reference components from dependencies", () => {
            const baseSchema = Database.Plugin.create({
                components: {
                    position: { type: "number" },
                    health: { type: "number" }
                }
            });

            const extendedSchema = Database.Plugin.create({
                extends: baseSchema,
                components: {
                    velocity: { type: "number" }
                },
                archetypes: {
                    DynamicEntity: ["position", "velocity"],
                    LivingEntity: ["position", "health"]
                },
            });

            expect(extendedSchema.archetypes).toHaveProperty("DynamicEntity");
            expect(extendedSchema.archetypes).toHaveProperty("LivingEntity");
            expect(extendedSchema.archetypes.DynamicEntity).toEqual(["position", "velocity"]);
            expect(extendedSchema.archetypes.LivingEntity).toEqual(["position", "health"]);
        });
    });
});

