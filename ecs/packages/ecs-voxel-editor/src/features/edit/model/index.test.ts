// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, workers, World } from "@adobe/ecs";
import { frameWorld, viewCamera } from "../../camera/model/index.js";
import { seedMaterials } from "../../materials/model/index.js";
import { clearSelection, faceCell, faces, faceSide, pressSelect, releaseSelect } from "../../selection/model/index.js";
import { mainModel, newDocument, parent, position, voxels } from "../../voxels/model/index.js";
import { SelectedFace } from "../../selection/model/archetype.selected-face.js";
import { deleteSelection, extrudeSelection } from "./index.js";

const readVoxels = System.create({ readonly: true, lookup: { voxels: { index: voxels } } }, ({ lookup }) => {
    const all = lookup.voxels();
    const cells: string[] = [];
    for (let i = 0; i < all.length; i++) cells.push([...all.at(i)[position]].join(","));
    return cells.sort();
});

const readFaces = System.create({ readonly: true, lookup: { faces: { index: faces } } }, ({ lookup }) => {
    const all = lookup.faces();
    const found: string[] = [];
    for (let i = 0; i < all.length; i++) found.push(`${[...all.at(i)[faceCell]].join(",")} ${all.at(i)[faceSide]}`);
    return found.sort();
});

/** Selects a face, whether one is selected there or not. */
const selectFace = System.create({}, ({ commands, resources }, input: { readonly cell: readonly [number, number, number]; readonly side: number }) => {
    commands.spawn(SelectedFace)({ [parent]: resources[mainModel], [faceCell]: input.cell, [faceSide]: input.side });
});

/** A world of 8 voxels a side, seen from the front, framed. */
const framed = async (): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    await world.run(newDocument, { size: [8, 8, 8], scale: [1, 1, 1] });
    await world.run(seedMaterials);
    await world.run(frameWorld);
    await world.run(viewCamera, { yaw: 0, pitch: 0 });
    return world;
};

/** Clicks the middle of the view. */
const clickMiddle = async (world: World): Promise<void> => {
    await world.run(pressSelect, { x: 0, y: 0, aspect: 1 });
    await world.run(releaseSelect);
};

describe("editing through the selection", () => {
    it("selects the far wall, extrudes voxels from it and deletes them, the face following", async () => {
        await using world = await framed();
        await clickMiddle(world);
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4"]);
        await world.run(extrudeSelection);
        await world.run(extrudeSelection);
        expect(await world.run(readVoxels)).toEqual(["4,4,0", "4,4,1"]);
        expect(await world.run(readFaces)).toEqual(["4,4,1 4"]);
        await world.run(deleteSelection);
        expect(await world.run(readVoxels)).toEqual(["4,4,0"]);
        expect(await world.run(readFaces)).toEqual(["4,4,0 4"]);
        await world.run(clearSelection);
        expect(await world.run(readFaces)).toEqual([]);
        // The voxel's front face is under the middle now, and a click toggles it.
        await clickMiddle(world);
        expect(await world.run(readFaces)).toEqual(["4,4,0 4"]);
        await clickMiddle(world);
        expect(await world.run(readFaces)).toEqual([]);
    });

    it("moves faces on through filled cells and through each other, each staying a face of its own", async () => {
        await using world = await framed();
        await clickMiddle(world);
        await world.run(extrudeSelection);
        // The wall's face too, behind the voxel now.
        await world.run(selectFace, { cell: [4, 4, -1], side: 4 });
        await world.run(extrudeSelection);
        // The wall's face moved into the filled cell without filling it again; the voxel's face filled the one beyond.
        expect(await world.run(readFaces)).toEqual(["4,4,0 4", "4,4,1 4"]);
        expect(await world.run(readVoxels)).toEqual(["4,4,0", "4,4,1"]);
        await world.run(deleteSelection);
        await world.run(deleteSelection);
        // The face behind stopped at the wall, and the other moved back onto it: both are kept.
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4", "4,4,-1 4"]);
        expect(await world.run(readVoxels)).toEqual([]);
        await world.run(extrudeSelection);
        await world.run(extrudeSelection);
        expect(await world.run(readFaces)).toEqual(["4,4,1 4", "4,4,1 4"]);
        expect(await world.run(readVoxels)).toEqual(["4,4,0", "4,4,1"]);
    });

    it("leaves a wall's face where it is on deleting", async () => {
        await using world = await framed();
        await clickMiddle(world);
        await world.run(deleteSelection);
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4"]);
    });
});
