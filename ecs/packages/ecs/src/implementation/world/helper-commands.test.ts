// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { read } from "./reads.test-helper.js";
import { color, size, tag } from "./helper-commands-keys.test-helper.js";
import * as Kernels from "./helper-commands-kernels.test-helper.js";

const results = async (system: System): Promise<readonly (readonly unknown[])[]> => {
    // Kernels run here: under Vitest's module runner, node workers can't load the sources.
    await using world = createWorld({ [workers]: 0 });
    const spawned: Entity[] = [];
    await world.run(System.create({}, ({ commands }) => {
        spawned.push(commands.spawn([size, color])({ [size]: 1, [color]: 4 }), commands.spawn([size, color])({ [size]: 1, [color]: -3 }));
    }));
    await world.run(system);
    return await Promise.all(spawned.map(async entity => [await read(world, entity, size), await read(world, entity, color), await read(world, entity, tag)]));
};

it.each([
    ["a list and values written in place", Kernels.viaHelper, Kernels.viaHelperWritten, [[2, 4, true], [2, -3, true]]],
    ["a list of the helper's module and values a helper returns", Kernels.viaReturned, Kernels.viaReturnedWritten, [[3, 5, true], [3, -2, true]]],
    ["a list of the helper's module and values a local holds", Kernels.viaLocal, Kernels.viaLocalWritten, [[1, 8, true], [1, -3, null]]],
] as const)("kernels add through helpers: %s, as the body as written does", async (_, kernel, written, expected) => {
    expect(await results(kernel)).toEqual(expected);
    expect(await results(written)).toEqual(expected);
});
