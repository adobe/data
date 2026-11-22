// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity, System, workers, World } from "@adobe/ecs";
import { frameWorld, viewCamera } from "../../camera/model/index.js";
import { mainModel, newDocument, material, paint, paintedFaces, parent, position, voxel } from "../../voxels/model/index.js";
import { clearSelection, dragSelect, faceCell, faces, faceSide, pressSelect, releaseSelect, selectConnected } from "./index.js";

const readFaces = System.create({ readonly: true, lookup: { faces: { index: faces } } }, ({ lookup }) => {
    const all = lookup.faces();
    const found: string[] = [];
    for (let i = 0; i < all.length; i++) found.push(`${[...all.at(i)[faceCell]].join(",")} ${all.at(i)[faceSide]}`);
    return found.sort();
});

const fillCell = System.create({}, ({ commands, resources }, input: { readonly x: number; readonly y: number; readonly z: number }) => {
    commands.spawn([voxel, position, material, paint, paintedFaces, parent])({ [voxel]: true, [position]: [input.x, input.y, input.z], [material]: Entity.none, [paint]: Entity.none, [paintedFaces]: 0, [parent]: resources[mainModel] });
});

/**
 * A world of 8 voxels a side seen from the front, framed: the middle of the view is the back wall's cell `[4, 4]`, and
 * each 0.11 of the view across about another cell.
 */
const framed = async (): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    await world.run(newDocument, { size: [8, 8, 8], scale: [1, 1, 1] });
    await world.run(frameWorld);
    await world.run(viewCamera, { yaw: 0, pitch: 0 });
    return world;
};

const drag = async (world: World, from: readonly [number, number], to: readonly [number, number], keys: { shift?: boolean; ctrl?: boolean }): Promise<void> => {
    const held = { shift: keys.shift ?? false, ctrl: keys.ctrl ?? false };
    await world.run(pressSelect, { x: from[0], y: from[1], aspect: 1 });
    await world.run(dragSelect, { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2, aspect: 1, ...held });
    await world.run(dragSelect, { x: to[0], y: to[1], aspect: 1, ...held });
    await world.run(releaseSelect);
};

describe("selecting faces", () => {
    it("selects a rectangle with ctrl, and a straight line with shift, in the first face's plane", async () => {
        await using world = await framed();
        await drag(world, [0, 0], [0.2, 0.2], { ctrl: true });
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4", "4,5,-1 4", "5,4,-1 4", "5,5,-1 4"]);
        await world.run(clearSelection);
        await drag(world, [0, 0], [0.4, 0.1], { shift: true });
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4", "5,4,-1 4", "6,4,-1 4", "7,4,-1 4"]);
    });

    it("puts back what a rectangle no longer covers as the drag shrinks it, and deselects from a selected face", async () => {
        await using world = await framed();
        await world.run(pressSelect, { x: 0, y: 0, aspect: 1 });
        await world.run(dragSelect, { x: 0.4, y: 0, aspect: 1, shift: false, ctrl: true });
        await world.run(dragSelect, { x: 0.15, y: 0, aspect: 1, shift: false, ctrl: true });
        await world.run(releaseSelect);
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4", "5,4,-1 4"]);
        await drag(world, [0.15, 0], [0.3, 0], { shift: true });
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4"]);
    });

    it("changes shape as the keys held change during the drag, the last move's keys deciding", async () => {
        await using world = await framed();
        const at = { x: 0.2, y: 0.2, aspect: 1 };
        await world.run(pressSelect, { x: 0, y: 0, aspect: 1 });
        await world.run(dragSelect, { ...at, shift: false, ctrl: true });
        expect(await world.run(readFaces)).toHaveLength(4);
        await world.run(dragSelect, { ...at, shift: true, ctrl: false });
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4", "5,4,-1 4"]);
        // With neither, the faces the pointer passed over: the first, and where it is.
        await world.run(dragSelect, { ...at, shift: false, ctrl: false });
        expect(await world.run(readFaces)).toEqual(["4,4,-1 4", "5,5,-1 4"]);
        await world.run(dragSelect, { ...at, shift: false, ctrl: true });
        await world.run(releaseSelect);
        expect(await world.run(readFaces)).toHaveLength(4);
    });

    it("selects the connected faces like the one double-clicked, and deselects them from a selected one", async () => {
        await using world = await framed();
        await world.run(fillCell, { x: 4, y: 4, z: 0 });
        await world.run(selectConnected, { x: 0.4, y: 0.4, aspect: 1 });
        const selected = await world.run(readFaces);
        // The back wall but for the cell the voxel covers.
        expect(selected).toHaveLength(63);
        expect(selected).not.toContain("4,4,-1 4");
        await world.run(selectConnected, { x: 0.4, y: 0.4, aspect: 1 });
        expect(await world.run(readFaces)).toEqual([]);
    });
});
