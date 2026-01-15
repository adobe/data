// © 2026 Adobe. MIT License. See /LICENSE for details.

import { assert } from "riteway/vitest";
import { describe, test, expect } from "vitest";
import { calculateSystemOrder } from "./calculate-system-order.js";

describe("calculateSystemOrder", () => {

    test("empty systems object", async () => {
        const systems = {};
        const actual = calculateSystemOrder(systems);
        const expected: string[][] = [];
        await assert({
            given: "empty systems object",
            should: "return empty order array",
            actual,
            expected,
        });
    });

    test("single system with no constraints", async () => {
        const systems = {
            renderSystem: { create: () => () => { } },
        };
        const actual = calculateSystemOrder(systems);
        const expected = [["renderSystem"]];
        await assert({
            given: "single system with no constraints",
            should: "return single tier with that system",
            actual,
            expected,
        });
    });

    test("multiple systems with no constraints", async () => {
        const systems = {
            inputSystem: { create: () => () => { } },
            physicsSystem: { create: () => () => { } },
            renderSystem: { create: () => () => { } },
        };
        const actual = calculateSystemOrder(systems);
        const expected = [["inputSystem", "physicsSystem", "renderSystem"]];
        await assert({
            given: "multiple systems with no constraints",
            should: "return single tier with all systems in parallel",
            actual,
            expected,
        });
    });

    test("render system scheduled after physics", async () => {
        const systems = {
            physicsSystem: { create: () => () => { } },
            renderSystem: {
                create: () => () => { },
                schedule: { after: ["physicsSystem"] }
            },
        };
        const actual = calculateSystemOrder(systems);
        const expected = [["physicsSystem"], ["renderSystem"]];
        await assert({
            given: "render system scheduled after physics",
            should: "return physics in first tier, render in second",
            actual,
            expected,
        });
    });

    test("physics system scheduled before render", async () => {
        const systems = {
            physicsSystem: {
                create: () => () => { },
                schedule: { before: ["renderSystem"] }
            },
            renderSystem: { create: () => () => { } },
        };
        const actual = calculateSystemOrder(systems);
        const expected = [["physicsSystem"], ["renderSystem"]];
        await assert({
            given: "physics system scheduled before render",
            should: "return physics in first tier, render in second",
            actual,
            expected,
        });
    });

    test("complex dependency graph with parallel systems", async () => {
        const systems = {
            inputSystem: { create: () => () => { } },
            physicsSystem: {
                create: () => () => { },
                schedule: { after: ["inputSystem"] }
            },
            aiSystem: {
                create: () => () => { },
                schedule: { after: ["inputSystem"] }
            },
            renderSystem: {
                create: () => () => { },
                schedule: { after: ["physicsSystem", "aiSystem"] }
            },
        };
        const actual = calculateSystemOrder(systems);
        const expected = [
            ["inputSystem"],
            ["aiSystem", "physicsSystem"],
            ["renderSystem"]
        ];
        await assert({
            given: "complex dependency graph with parallel systems",
            should: "return correct multi-tier execution order with alphabetical sorting within tiers",
            actual,
            expected,
        });
    });

    test("greedy scheduling with mixed independent and dependent systems", async () => {
        const systems = {
            systemA: { create: () => () => { } },  // No dependencies
            systemB: {
                create: () => () => { },
                schedule: { after: ["systemA"] }  // Depends on A
            },
            systemC: { create: () => () => { } },  // Independent! Should run in tier 0
            systemD: {
                create: () => () => { },
                schedule: { after: ["systemB"] }  // Depends on B
            },
        };
        const actual = calculateSystemOrder(systems);
        const expected = [
            ["systemA", "systemC"],  // Both independent, run together ASAP
            ["systemB"],              // Runs after A
            ["systemD"]               // Runs after B
        ];
        await assert({
            given: "mixed independent and dependent systems",
            should: "schedule independent systems in earliest tier (greedy scheduling)",
            actual,
            expected,
        });
    });

    test("circular dependency between systems", () => {
        const systems = {
            systemA: {
                create: () => () => { },
                schedule: { after: ["systemB"] }
            },
            systemB: {
                create: () => () => { },
                schedule: { after: ["systemA"] }
            },
        };
        expect(() => calculateSystemOrder(systems)).toThrow("Circular dependency detected in system scheduling");
    });

    describe("during scheduling", () => {
        test("system with during constraint and no other constraints", async () => {
            const systems = {
                targetSystem: { create: () => () => { } },
                companionSystem: {
                    create: () => () => { },
                    schedule: { during: ["targetSystem"] }
                },
            };
            const actual = calculateSystemOrder(systems);
            const expected = [["companionSystem", "targetSystem"]];
            await assert({
                given: "system with during constraint and no other constraints",
                should: "place it in the same tier as the target system",
                actual,
                expected,
            });
        });

        test("during that conflicts with after constraint", async () => {
            const systems = {
                earlySystem: { create: () => () => { } },
                targetSystem: {
                    create: () => () => { },
                    schedule: { after: ["earlySystem"] }
                },
                companionSystem: {
                    create: () => () => { },
                    schedule: {
                        after: ["earlySystem"],
                        during: ["targetSystem"]
                    }
                },
            };
            const actual = calculateSystemOrder(systems);
            // companionSystem must be after earlySystem, so it can be in same tier as targetSystem
            const expected = [
                ["earlySystem"],
                ["companionSystem", "targetSystem"]
            ];
            await assert({
                given: "during that is compatible with after constraint",
                should: "satisfy after first, then place in same tier as during target",
                actual,
                expected,
            });
        });

        test("during that conflicts with after constraint - incompatible case", async () => {
            const systems = {
                earlySystem: { create: () => () => { } },
                targetSystem: { create: () => () => { } },
                companionSystem: {
                    create: () => () => { },
                    schedule: {
                        after: ["targetSystem"],
                        during: ["earlySystem"]  // Can't be during earlySystem if it's after targetSystem
                    }
                },
            };
            const actual = calculateSystemOrder(systems);
            // companionSystem must be after targetSystem, so it cannot be in same tier as earlySystem
            const expected = [
                ["earlySystem", "targetSystem"],
                ["companionSystem"]
            ];
            await assert({
                given: "during that conflicts with after constraint",
                should: "prioritize after and ignore during preference",
                actual,
                expected,
            });
        });

        test("during that conflicts with before constraint", async () => {
            const systems = {
                targetSystem: { create: () => () => { } },
                lateSystem: {
                    create: () => () => { },
                    schedule: { after: ["targetSystem"] }
                },
                companionSystem: {
                    create: () => () => { },
                    schedule: {
                        before: ["lateSystem"],
                        during: ["lateSystem"]  // Can't be during lateSystem if it's before lateSystem
                    }
                },
            };
            const actual = calculateSystemOrder(systems);
            // companionSystem must be before lateSystem, so it cannot be in same tier as lateSystem
            const expected = [
                ["companionSystem", "targetSystem"],
                ["lateSystem"]
            ];
            await assert({
                given: "during that conflicts with before constraint",
                should: "prioritize before and ignore during preference",
                actual,
                expected,
            });
        });

        test("multiple systems with during targeting the same system", async () => {
            const systems = {
                targetSystem: { create: () => () => { } },
                companion1: {
                    create: () => () => { },
                    schedule: { during: ["targetSystem"] }
                },
                companion2: {
                    create: () => () => { },
                    schedule: { during: ["targetSystem"] }
                },
            };
            const actual = calculateSystemOrder(systems);
            const expected = [["companion1", "companion2", "targetSystem"]];
            await assert({
                given: "multiple systems with during targeting the same system",
                should: "place them all in the same tier as the target",
                actual,
                expected,
            });
        });

        test("during with multiple targets prefers tier with most targets", async () => {
            const systems = {
                targetA: { create: () => () => { } },
                targetB: {
                    create: () => () => { },
                    schedule: { after: ["targetA"] }
                },
                companion: {
                    create: () => () => { },
                    schedule: { during: ["targetA", "targetB"] }
                },
            };
            const actual = calculateSystemOrder(systems);
            // companion can be in either tier, but should prefer tier with most targets
            // Since targetA is alone in tier 0 and targetB is alone in tier 1, either works
            // Algorithm will prefer the first tier it encounters, so it should be with targetA
            const expected = [
                ["companion", "targetA"],
                ["targetB"]
            ];
            await assert({
                given: "during with multiple targets",
                should: "prefer tier with most targets or first available",
                actual,
                expected,
            });
        });

        test("during target that doesn't exist is handled gracefully", async () => {
            const systems = {
                existingSystem: { create: () => () => { } },
                companionSystem: {
                    create: () => () => { },
                    schedule: { during: ["nonExistentSystem"] }
                },
            };
            const actual = calculateSystemOrder(systems);
            // Should not crash, companionSystem should be scheduled normally
            const expected = [["companionSystem", "existingSystem"]];
            await assert({
                given: "during target that doesn't exist",
                should: "handle gracefully without breaking the algorithm",
                actual,
                expected,
            });
        });

        test("during with compatible after constraint", async () => {
            const systems = {
                earlySystem: { create: () => () => { } },
                targetSystem: {
                    create: () => () => { },
                    schedule: { after: ["earlySystem"] }
                },
                companionSystem: {
                    create: () => () => { },
                    schedule: {
                        after: ["earlySystem"],
                        during: ["targetSystem"]
                    }
                },
            };
            const actual = calculateSystemOrder(systems);
            // Both targetSystem and companionSystem are after earlySystem, so they can be together
            const expected = [
                ["earlySystem"],
                ["companionSystem", "targetSystem"]
            ];
            await assert({
                given: "during with compatible after constraint",
                should: "place system in same tier as target when dependencies allow",
                actual,
                expected,
            });
        });

        test("complex scenario with during and hard constraints", async () => {
            const systems = {
                inputSystem: { create: () => () => { } },
                physicsSystem: {
                    create: () => () => { },
                    schedule: { after: ["inputSystem"] }
                },
                aiSystem: {
                    create: () => () => { },
                    schedule: { after: ["inputSystem"] }
                },
                debugSystem: {
                    create: () => () => { },
                    schedule: { during: ["physicsSystem", "aiSystem"] }
                },
                renderSystem: {
                    create: () => () => { },
                    schedule: { after: ["physicsSystem", "aiSystem"] }
                },
            };
            const actual = calculateSystemOrder(systems);
            // debugSystem can be in tier with physicsSystem and aiSystem since it has no hard constraints
            const expected = [
                ["inputSystem"],
                ["aiSystem", "debugSystem", "physicsSystem"],
                ["renderSystem"]
            ];
            await assert({
                given: "complex scenario with during and hard constraints",
                should: "optimize placement while respecting all hard constraints",
                actual,
                expected,
            });
        });
    });

});

