// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { type Entity, Quat, System, workers, World } from "@adobe/ecs";
import { frameWorld, viewCamera } from "../../camera/model/index.js";
import { extrudeSelection } from "../../edit/model/index.js";
import { recordHistory } from "../../history/model/plugin.history-model/system.record-history.js";
import { undo } from "../../history/model/index.js";
import { seedMaterials, selectedMaterial } from "../../materials/model/index.js";
import { clearSelection, faceCell, faces, faceSide, SelectedFace } from "../../selection/model/index.js";
import {
    Instance, instance, instanceOf, instancesOf, mainModel, material, paint, paintedFaces, Model, model, modelName, newDocument, parent, position, rotation, scale, size, voxel, Voxel, voxels,
} from "../../voxels/model/index.js";
import { fitModel, lockSize, resizeModel } from "./index.js";

/** A main model of 8, with a voxel at `cells` each, and a model `box` holding one voxel at [3, 3, 3], placed in the main model at [1, 0, 0]. */
const build = System.create({}, ({ commands, resources }, input: { readonly cells: readonly (readonly [number, number, number])[] }) => {
    const main = resources[mainModel];
    const filling = resources[selectedMaterial];
    const spawnVoxel = commands.spawn(Voxel);
    for (const cell of input.cells) spawnVoxel({ [voxel]: true, [position]: cell, [material]: filling, [paint]: filling, [paintedFaces]: 0, [parent]: main });
    const box = commands.spawn(Model)({ [model]: true, [modelName]: "box", [size]: [8, 8, 8], [scale]: [0.25, 0.25, 0.25] });
    spawnVoxel({ [voxel]: true, [position]: [3, 3, 3], [material]: filling, [paint]: filling, [paintedFaces]: 0, [parent]: box });
    commands.spawn(Instance)({ [instance]: true, [instanceOf]: box, [parent]: main, [position]: [1, 0, 0], [rotation]: Quat.identity });
    return box;
});

const selectFace = System.create({}, ({ commands, resources }, input: { readonly cell: readonly [number, number, number]; readonly side: number }) => {
    commands.spawn(SelectedFace)({ [parent]: resources[mainModel], [faceCell]: input.cell, [faceSide]: input.side });
});

const read = System.create({
    lookup: { voxels: { index: voxels }, models: { with: [model, size] }, placed: { with: [...Instance] }, faces: { index: faces } },
}, ({ lookup, resources }, input: { readonly model: Entity; readonly instance: Entity | null }) => {
    const cells = (held: Entity): string[] => {
        const list = lookup.voxels(held);
        const found: string[] = [];
        for (let i = 0; i < list.length; i++) found.push([...list.at(i)[position]].join(","));
        return found.sort();
    };
    const selected = lookup.faces(resources[mainModel]);
    const faceList: string[] = [];
    for (let i = 0; i < selected.length; i++) faceList.push(`${[...selected.at(i)[faceCell]].join(",")} ${selected.at(i)[faceSide]}`);
    return {
        size: [...lookup.models(input.model)?.[size] ?? []],
        cells: cells(input.model),
        placed: input.instance === null ? null : [...lookup.placed(input.instance)?.[position] ?? []],
        faces: faceList,
    };
});

/** The first instance placing a model. */
const placementOf = System.create({ lookup: { placed: { index: instancesOf } } }, ({ lookup }, input: { readonly model: Entity }) => lookup.placed(input.model).at(0).entity);

const fresh = async (cells: readonly (readonly [number, number, number])[]) => {
    const world = World.create({ [workers]: 0 });
    const main = await world.run(newDocument, { size: [8, 8, 8], scale: [1, 1, 1] });
    await world.run(seedMaterials);
    const box = await world.run(build, { cells });
    await world.run(frameWorld);
    await world.run(viewCamera, { yaw: 0, pitch: 0 });
    await world.run(recordHistory);
    return { world, main, box };
};

describe("model size", () => {
    it("resizes a model, its contents where they are, voxels left outside it going, and undoes it", async () => {
        const { world, main } = await fresh([[1, 1, 1], [6, 6, 6]]);
        await using _ = world;
        await world.run(resizeModel, { model: main, size: [4, 4, 4] });
        await world.run(recordHistory);
        expect(await world.run(read, { model: main, instance: null })).toMatchObject({ size: [4, 4, 4], cells: ["1,1,1"] });
        await world.run(undo);
        expect(await world.run(read, { model: main, instance: null })).toMatchObject({ size: [8, 8, 8], cells: ["1,1,1", "6,6,6"] });
    });

    it("fits a model to its contents, moving them to start at 0, and moves its instances back so it stays where it was", async () => {
        const { world, main, box } = await fresh([[2, 3, 4]]);
        await using _ = world;
        // The box's voxel, at [3, 3, 3] of 8, is its contents: fitted, the box is that one voxel, moved to [0, 0, 0].
        const placement = await world.run(placementOf, { model: box });
        await world.run(fitModel, { model: box });
        expect(await world.run(read, { model: box, instance: placement })).toMatchObject({ size: [1, 1, 1], cells: ["0,0,0"], placed: [1.75, 0.75, 0.75] });
        // The main model's contents: its voxel at [2, 3, 4], and the box, placed at [1, 0, 0] and now reaching a quarter voxel past [1.75, 0.75, 0.75].
        await world.run(fitModel, { model: main });
        expect(await world.run(read, { model: main, instance: placement })).toMatchObject({ size: [2, 4, 5], cells: ["1,3,4"], placed: [0.75, 0.75, 0.75] });
    });

    it("stops extruding at a locked model's bounds, and grows an unlocked one, moving its contents up from 0 the negative way", async () => {
        const { world, main } = await fresh([[0, 0, 0]]);
        await using _ = world;
        await world.run(selectFace, { cell: [0, 0, 0], side: 1 });
        await world.run(extrudeSelection);
        expect(await world.run(read, { model: main, instance: null })).toMatchObject({ size: [8, 8, 8], cells: ["0,0,0"], faces: ["0,0,0 1"] });
        await world.run(lockSize, { model: main, locked: false });
        await world.run(extrudeSelection);
        // Grown one the -x way: everything moved up by one, the new voxel at 0.
        expect(await world.run(read, { model: main, instance: null })).toMatchObject({ size: [9, 8, 8], cells: ["0,0,0", "1,0,0"], faces: ["0,0,0 1"] });
        await world.run(clearSelection);
        await world.run(selectFace, { cell: [8, 0, 0], side: 0 });
        await world.run(extrudeSelection);
        expect(await world.run(read, { model: main, instance: null })).toMatchObject({ size: [10, 8, 8] });
    });
});
