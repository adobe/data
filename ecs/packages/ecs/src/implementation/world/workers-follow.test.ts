// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, join } from "./create.js";
import type { WorkerPlatform } from "./worker-platform.js";

const heat = Symbol("workersFollowTest/heat");
const other = Symbol("workersFollowTest/other");
declare module "@adobe/ecs" {
    interface Components {
        [heat]: { type: number };
        [other]: { type: number };
    }
}

const spawnRows = System.create({}, ({ commands }) => {
    for (let i = 0; i < 64; i++) commands.spawn([heat])({ [heat]: i });
});
const cool = System.create({ kernel: true, components: { with: [heat] } }, row => {
    row[heat] = row[heat] * 0.5;
});
const setWorkers = System.create({}, ({ resources }) => {
    resources[workers] = 2;
});

it("follows a change of the workers resource at the next run, though the program changed while a thread is joined", async () => {
    let starts = 0;
    // A platform with no workers to give: each start the world tries is counted.
    const platform: WorkerPlatform = { count: 3, start: () => { starts++; return null; } };
    const world = createWorld({ [workers]: 0 }, { pool: platform, minimumChunk: 2 });
    const channel = new MessageChannel();
    const shared = world.share(channel.port1);
    const remote = await join(channel.port2, { threads: ["main"] });
    try {
        await shared;
        await world.run(spawnRows);
        await world.run(cool);
        await world.run(setWorkers);
        expect(starts).toBe(0);
        // A finalizer created between runs changes the program, so the next run drains the joined thread first.
        Finalizer.create({ components: { with: [other] } }, () => {});
        await world.run(cool);
        expect(starts).toBe(1);
    }
    finally {
        await remote.dispose();
        await world.dispose();
    }
});
