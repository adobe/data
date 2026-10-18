import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { toPromise } from "../../interface/observe/to-promise.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { read } from "./reads.test-helper.js";

// Each pair is one module's key and the key that module makes when evaluated again: one id, two symbols.
const score = Symbol("score");
const scoreAgain = Symbol("score");
const shown = Symbol("shown");
const shownAgain = Symbol("shown");

identify(score, "worldIdsTest/keys.ts#score");
identify(scoreAgain, "worldIdsTest/keys.ts#score");
identify(shown, "worldIdsTest/keys.ts#shown");
identify(shownAgain, "worldIdsTest/keys.ts#shown");

declare module "@adobe/data-ecs" {
    export interface Components {
        [score]: typeof scoreTraits;
        [scoreAgain]: typeof scoreTraits;
        [shown]: typeof shownTraits;
        [shownAgain]: typeof shownTraits;
    }
}

const scoreTraits = Component.register(score, { type: { type: "number" } });
const shownTraits = Component.register(shown, { type: { const: true }, derived: true });
Rule.create(identify({ name: "worldIdsTest/shown", components: { has: [score] }, derive: [shown] }, "worldIdsTest/systems.ts#shown"));
const changes: (readonly symbol[])[] = [];
Finalizer.changes(identify({ name: "worldIdsTest/changes", watch: [score] }, "worldIdsTest/systems.ts#changes"), ({ groups }) => {
    for (const group of groups) changes.push(group.added);
});

// The module evaluated again, after the world met its first keys.
const evaluateAgain = (): void => {
    Component.register(scoreAgain, { type: { type: "number" } });
    Component.register(shownAgain, { type: { const: true }, derived: true });
    Rule.create(identify({ name: "worldIdsTest/shown", components: { has: [scoreAgain] }, derive: [shownAgain] }, "worldIdsTest/systems.ts#shown"));
    Finalizer.changes(identify({ name: "worldIdsTest/changes", watch: [scoreAgain] }, "worldIdsTest/systems.ts#changes"), ({ groups }) => {
        for (const group of groups) changes.push(group.added);
    });
};

const spawn = System.create({ name: "worldIdsTest/spawn" }, ({ commands }) => { spawned.push(commands.spawn([score])({ [score]: 1 })); });
const spawned: Entity[] = [];

describe("a world given keys with ids", () => {
    it("stores the symbols of one id as one component, giving values by the newest", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        evaluateAgain();
        const spawnAgain = System.create({ name: "worldIdsTest/spawnAgain" }, ({ commands }) => { spawned.push(commands.spawn([scoreAgain])({ [scoreAgain]: 2 })); });
        const add = System.create({ name: "worldIdsTest/add", components: { write: [scoreAgain] } }, row => { row[scoreAgain] += 10; });
        await world.run(spawnAgain);
        await world.run(add);
        const [first, second] = spawned;
        expect([await read(world, first, score), await read(world, first, scoreAgain), await read(world, second, score)]).toEqual([11, 11, 12]);
        expect([await read(world, first, shownAgain), await read(world, second, shown)]).toEqual([true, true]);
        const values = await toPromise(world.observe.entity(second));
        expect(new Set(values === null ? [] : Object.getOwnPropertySymbols(values))).toEqual(new Set([scoreAgain, shownAgain]));
        expect(changes).toEqual([[score], [scoreAgain]]);
        await world.dispose();
    });
});
