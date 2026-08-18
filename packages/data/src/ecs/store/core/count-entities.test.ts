// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { countEntities } from "./count-entities.js";
import { selectEntities } from "./select-entities.js";
import { createCore } from "./create-core.js";
import { Schema } from "../../../schema/index.js";
import { F32 } from "../../../math/f32/index.js";

const nameSchema = { type: "string" } as const satisfies Schema;
const scoreSchema = { type: "number" } as const satisfies Schema;
const activeSchema = { type: "boolean" } as const satisfies Schema;

describe("countEntities", () => {
    const core = createCore({
        position: F32.schema,
        health: F32.schema,
        name: nameSchema,
        score: scoreSchema,
        active: activeSchema,
    });

    const positionArchetype = core.ensureArchetype(["position"]);
    const healthArchetype = core.ensureArchetype(["health"]);
    const nameArchetype = core.ensureArchetype(["name"]);
    const positionHealthArchetype = core.ensureArchetype(["position", "health"]);
    const positionNameArchetype = core.ensureArchetype(["position", "name"]);
    const healthNameArchetype = core.ensureArchetype(["health", "name"]);
    const fullArchetype = core.ensureArchetype(["position", "health", "name", "score", "active"]);

    positionArchetype.insert({ position: 1 });
    positionArchetype.insert({ position: 2 });
    positionArchetype.insert({ position: 3 });
    healthArchetype.insert({ health: 50 });
    healthArchetype.insert({ health: 75 });
    healthArchetype.insert({ health: 25 });
    nameArchetype.insert({ name: "Alice" });
    nameArchetype.insert({ name: "Bob" });
    nameArchetype.insert({ name: "Charlie" });
    positionHealthArchetype.insert({ position: 10, health: 80 });
    positionHealthArchetype.insert({ position: 13, health: 90 });
    positionNameArchetype.insert({ position: 16, name: "David" });
    positionNameArchetype.insert({ position: 19, name: "Eve" });
    healthNameArchetype.insert({ health: 60, name: "Frank" });
    healthNameArchetype.insert({ health: 40, name: "Grace" });
    fullArchetype.insert({ position: 22, health: 95, name: "Henry", score: 85.5, active: true });
    fullArchetype.insert({ position: 25, health: 30, name: "Iris", score: 92.0, active: false });
    fullArchetype.insert({ position: 28, health: 70, name: "Jack", score: 78.3, active: true });

    describe("no where filter (sum of archetype row counts)", () => {
        it("counts position across every archetype that has it", () => {
            // pos(3) + posHealth(2) + posName(2) + full(3)
            expect(countEntities(core, ["position"])).toBe(10);
        });
        it("counts an intersection: position + health", () => {
            // posHealth(2) + full(3)
            expect(countEntities(core, ["position", "health"])).toBe(5);
        });
        it("counts a component carried by one archetype", () => {
            expect(countEntities(core, ["score"])).toBe(3); // full only
        });
        it("returns 0 when no archetype matches", () => {
            expect(countEntities(core, ["position", "score", "name", "health", "active"], { exclude: ["position"] })).toBe(0);
        });
    });

    it("respects exclude", () => {
        // position minus those that also have name: pos(3) + posHealth(2); posName + full excluded
        expect(countEntities(core, ["position"], { exclude: ["name"] })).toBe(5);
    });

    it("respects a where row filter", () => {
        expect(countEntities(core, ["active"], { where: { active: true } })).toBe(2); // Henry, Jack
        expect(countEntities(core, ["name"], { where: { name: "Alice" } })).toBe(1);
        expect(countEntities(core, ["score"], { where: { score: { ">": 80 } } })).toBe(2); // 85.5, 92.0
    });

    it("equals selectEntities(...).length for every query shape", () => {
        const queries: [readonly string[], Record<string, unknown>?][] = [
            [["position"]],
            [["health"]],
            [["position", "health"]],
            [["name"]],
            [["score"]],
            [["position"], { exclude: ["name"] }],
            [["active"], { where: { active: true } }],
            [["score"], { where: { score: { ">": 80 } } }],
        ];
        for (const [include, options] of queries) {
            expect(countEntities(core, include as never, options as never))
                .toBe(selectEntities(core, include as never, options as never).length);
        }
    });
});
