// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createDirectory } from "./directories.js";
import { archetypeOf, createState, idOf } from "./state.js";

const position = Symbol("directoriesTest/position");
const score = Symbol("directoriesTest/score");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: number };
        [score]: { type: number };
    }
}

describe("createDirectory", () => {
    it("matches only archetypes holding each component in has, even one optional among what it reads", () => {
        const state = createState();
        const [positionId, scoreId] = [idOf(state, position), idOf(state, score)];
        const without = archetypeOf(state, [scoreId]);
        const holding = archetypeOf(state, [positionId, scoreId]);
        const directory = createDirectory(state, [positionId], [positionId], [], false, [], [positionId]);
        const words = 2;
        expect(directory.records[without.id * words]).toBe(0);
        expect(directory.records[holding.id * words]).toBe(1);
    });
});
