// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { changes } from "./ids-changes.test-helper.js";
import { score, shown } from "./ids-keys.test-helper.js";
import { read } from "./reads.test-helper.js";

const spawned: Entity[] = [];
const spawn = System.create({ name: "worldIdsTest/spawn" }, ({ commands }) => { spawned.push(commands.spawn([score])({ [score]: 1 })); });

describe("a world given keys with ids", () => {
    it("stores the symbols of one id as one component, giving values by the newest", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        // The keys' module evaluated again, after the world met its first keys: a new module by its query, its ids the same.
        const again: typeof import("./ids-keys.test-helper.js") = await import(/* @vite-ignore */ `./ids-keys.test-helper.js?again=${Date.now()}`);
        expect(again.score).not.toBe(score);
        const spawnAgain = System.create({ name: "worldIdsTest/spawnAgain" }, ({ commands }) => { spawned.push(commands.spawn([again.score])({ [again.score]: 2 })); });
        const add = System.create({ name: "worldIdsTest/add", components: { write: [again.score] } }, row => { row[again.score] += 10; });
        await world.run(spawnAgain);
        await world.run(add);
        const [first, second] = spawned;
        expect([await read(world, first, score), await read(world, first, again.score), await read(world, second, score)]).toEqual([11, 11, 12]);
        expect([await read(world, first, again.shown), await read(world, second, shown)]).toEqual([true, true]);
        expect(changes).toEqual([[score], [again.score]]);
        await world.dispose();
    });
});
