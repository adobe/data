// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { readEach, select } from "./reads.test-helper.js";
import { registerResource } from "../../interface/registry/declarations.js";
import { defaultOf } from "./state.js";

const Frame = { fixed: 0, autoHeight: 1, autoWidth: 2 } as const;
type Frame = (typeof Frame)[keyof typeof Frame];

const frame = Symbol("constantUnionsTest/frame");
const shown = Symbol("constantUnionsTest/shown");
declare module "@adobe/ecs" {
    export interface Components {
        [frame]: { type: Frame };
        [shown]: { type: { text: string } | null; thread: "main" };
    }
}

const spawn = System.create({}, ({ commands }) => {
    commands.spawn([frame, shown])({ [frame]: Frame.autoWidth, [shown]: null });
});
// Reads the union beside an object of the main thread: the union is a number in shared memory, on no thread.
const show = System.create({ components: { with: [frame, shown] } }, row => {
    row[shown] = { text: `frame ${row[frame]}` };
});

it("stores a union of number constants as a number in shared memory, read beside another thread's objects", async () => {
    await using world = createWorld({ [workers]: 0 });
    await world.run(spawn);
    await world.run(show);
    expect(await readEach(world, await select(world, { required: [frame] }), frame)).toEqual([2]);
});

// Registered by hand without a default, as only code the build didn't generate can.
const mode = Symbol("constantUnionsTest/mode");
registerResource(mode, { type: { anyOf: [{ const: 1 }, { const: 2 }, { const: 4 }] } });

it("starts a resource of a union of number constants without a default at its first constant, a value of its type", () => {
    expect(defaultOf(mode)).toBe(1);
});
