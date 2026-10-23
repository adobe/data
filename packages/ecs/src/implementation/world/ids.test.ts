// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { read } from "./reads.test-helper.js";

// A module's keys, which `ids-again.test-helper.ts` makes again under the same ids: one id, two symbols each.
const score = Symbol("score");
const shown = Symbol("shown");

identify(score, "worldIdsTest/keys.ts#score");
identify(shown, "worldIdsTest/keys.ts#shown");

declare module "@adobe/ecs" {
    export interface Components {
        [score]: { type: number };
        [shown]: { type: true; derived: true };
    }
}

Rule.create(identify({ name: "worldIdsTest/shown", components: { has: [score] }, derive: [shown] }, "worldIdsTest/systems.ts#shown"));
const changes: (readonly symbol[])[] = [];
Finalizer.changes(identify({ name: "worldIdsTest/changes", watch: [score] }, "worldIdsTest/systems.ts#changes"), ({ groups }) => {
    for (const group of groups) changes.push(group.added);
});

const spawn = System.create({ name: "worldIdsTest/spawn" }, ({ commands }) => { spawned.push(commands.spawn([score])({ [score]: 1 })); });
const spawned: Entity[] = [];

describe("a world given keys with ids", () => {
    it("stores the symbols of one id as one component, giving values by the newest", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        // The module evaluated again, after the world met its first keys.
        const again = await import("./ids-again.test-helper.js");
        again.evaluateAgain(changes);
        const spawnAgain = System.create({ name: "worldIdsTest/spawnAgain" }, ({ commands }) => { spawned.push(commands.spawn([again.scoreAgain])({ [again.scoreAgain]: 2 })); });
        const add = System.create({ name: "worldIdsTest/add", components: { write: [again.scoreAgain] } }, row => { row[again.scoreAgain] += 10; });
        await world.run(spawnAgain);
        await world.run(add);
        const [first, second] = spawned;
        expect([await read(world, first, score), await read(world, first, again.scoreAgain), await read(world, second, score)]).toEqual([11, 11, 12]);
        expect([await read(world, first, again.shownAgain), await read(world, second, shown)]).toEqual([true, true]);
        expect(changes).toEqual([[score], [again.scoreAgain]]);
        await world.dispose();
    });
});
