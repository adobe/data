// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, workers, World } from "@adobe/ecs";
import { frameWorld, viewCamera } from "../../camera/model/index.js";
import { deleteSelection, extrudeSelection } from "../../edit/model/index.js";
import { seedMaterials } from "../../materials/model/index.js";
import { faceCell, faces, faceSide, pressSelect, releaseSelect } from "../../selection/model/index.js";
import { newDocument, position, voxels } from "../../voxels/model/index.js";
import { recordHistory } from "./plugin.history-model/system.record-history.js";
import { redo, undo } from "./index.js";

const readState = System.create({ readonly: true, lookup: { voxels: { index: voxels }, faces: { index: faces } } }, ({ lookup }) => {
    const cells: string[] = [];
    const all = lookup.voxels();
    for (let i = 0; i < all.length; i++) cells.push([...all.at(i)[position]].join(","));
    const selected: string[] = [];
    const listed = lookup.faces();
    for (let i = 0; i < listed.length; i++) selected.push(`${[...listed.at(i)[faceCell]].join(",")} ${listed.at(i)[faceSide]}`);
    return { voxels: cells.sort(), faces: selected.sort() };
});

/** Runs `system`, then the tick after it that records the change. */
const act = async (world: World, system: System): Promise<void> => {
    await world.run(system);
    await world.run(recordHistory);
};

/** Clicks the middle of the view, a change recorded as a tick would. */
const click = async (world: World): Promise<void> => {
    await world.run(pressSelect, { x: 0, y: 0, aspect: 1 });
    await act(world, releaseSelect);
};

/** A world of 8 voxels a side, seen from the front, its first state recorded. */
const framed = async (): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    await world.run(newDocument, { size: [8, 8, 8], scale: [1, 1, 1] });
    await world.run(seedMaterials);
    await world.run(frameWorld);
    await world.run(viewCamera, { yaw: 0, pitch: 0 });
    await world.run(recordHistory);
    return world;
};

describe("history", () => {
    it("undoes and redoes edits, the selection with them, and a new change leaves nothing to redo", async () => {
        await using world = await framed();
        await click(world);
        await act(world, extrudeSelection);
        await act(world, extrudeSelection);
        expect(await world.run(readState)).toEqual({ voxels: ["4,4,0", "4,4,1"], faces: ["4,4,1 4"] });
        await act(world, undo);
        expect(await world.run(readState)).toEqual({ voxels: ["4,4,0"], faces: ["4,4,0 4"] });
        await act(world, undo);
        await act(world, undo);
        expect(await world.run(readState)).toEqual({ voxels: [], faces: [] });
        // Nothing before the first state.
        await act(world, undo);
        expect(await world.run(readState)).toEqual({ voxels: [], faces: [] });
        await act(world, redo);
        await act(world, redo);
        expect(await world.run(readState)).toEqual({ voxels: ["4,4,0"], faces: ["4,4,0 4"] });
        await act(world, deleteSelection);
        await act(world, redo);
        expect(await world.run(readState)).toEqual({ voxels: [], faces: ["4,4,-1 4"] });
    });

    it("undoes several times between ticks, as keys pressed quickly do", async () => {
        await using world = await framed();
        await click(world);
        for (let i = 0; i < 4; i++) await act(world, extrudeSelection);
        await world.run(undo);
        await world.run(undo);
        await world.run(recordHistory);
        expect(await world.run(readState)).toEqual({ voxels: ["4,4,0", "4,4,1"], faces: ["4,4,1 4"] });
        await act(world, redo);
        expect(await world.run(readState)).toEqual({ voxels: ["4,4,0", "4,4,1", "4,4,2"], faces: ["4,4,2 4"] });
        await act(world, redo);
        expect((await world.run(readState)).faces).toEqual(["4,4,3 4"]);
    });

    it("joins changes to the selection alone into one step", async () => {
        await using world = await framed();
        await click(world);
        await click(world);
        await click(world);
        expect((await world.run(readState)).faces).toEqual(["4,4,-1 4"]);
        await act(world, undo);
        expect((await world.run(readState)).faces).toEqual([]);
    });
});
