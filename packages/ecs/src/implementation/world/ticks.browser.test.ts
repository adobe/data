// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { readResource } from "./reads.test-helper.js";
import { workers } from "../../interface/resources/workers.js";

const frames = Symbol("ticksBrowserTest/frames");
declare module "@adobe/ecs" {
    export interface Resources {
        [frames]: { type: number };
    }
}

const count = System.create({  }, ({ resources }) => { resources[frames] += 1; });
const start = System.create({  }, ({ resources }) => { resources[always] = true; });

describe("a frame cadence", () => {
    it("ticks on animation frames, with their time", async () => {
        const original = globalThis.requestAnimationFrame;
        let requested = 0;
        globalThis.requestAnimationFrame = callback => {
            requested++;
            return original(callback);
        };
        const world = createWorld({ [workers]: 0 });
        try {
            world.add(count);
            await world.run(start);
            while (await readResource(world, frames) < 3) await new Promise(resolve => original(resolve));
            expect(requested).toBeGreaterThanOrEqual(3);
            const { now, delta } = await readResource(world, clock);
            expect(now).toBeGreaterThan(0);
            expect(delta).toBeGreaterThan(0);
        }
        finally {
            globalThis.requestAnimationFrame = original;
            await world.dispose();
        }
    });
});
