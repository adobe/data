// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, clock, workers } from "../../index.js";
import { createWorld } from "./create.js";

// The cases of ticks that read through observers are in `observe-ticks-cases.test.ts`.

const frames = Symbol("ticksTest/frames");
declare module "@adobe/ecs" {
    interface Resources {
        [frames]: { type: number; default: 0 };
    }
}

const count = System.create({ name: "ticksTest/count", resources: { write: [frames] } }, ({ resources }) => { resources[frames] += 1; });

describe("ticks", () => {
    it("reject a system that conflicts with one added with no order between them, and one with input", async () => {
        const other = System.create({ name: "ticksTest/other", resources: { write: [frames] } }, ({ resources }) => { resources[frames] = 0; });
        const withInput = System.create({ name: "ticksTest/withInput" }, (_context, input: { readonly by: number }) => {});
        await using world = createWorld({ [workers]: 0 });
        world.add(count);
        expect(() => world.add(other)).toThrow('both access "ticksTest/frames"');
        // @ts-expect-error a system with input can't be added
        expect(() => world.add(withInput)).toThrow("takes input");
    });
});

describe("World.create", () => {
    it("rejects starting a resource only the world writes", () => {
        // @ts-expect-error clock is written only by the world
        expect(() => createWorld({ [clock]: { now: 0, delta: 0, tick: 0 } })).toThrow('"clock" is written only by the world');
    });
});
