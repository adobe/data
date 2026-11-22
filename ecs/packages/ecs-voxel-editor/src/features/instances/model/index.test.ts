// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { type Entity, Quat, System, workers, World } from "@adobe/ecs";
import { frameWorld, viewCamera } from "../../camera/model/index.js";
import { extrudeSelection } from "../../edit/model/index.js";
import { seedMaterials, selectedMaterial } from "../../materials/model/index.js";
import { faces, pressSelect, releaseSelect } from "../../selection/model/index.js";
import {
    editing, Instance, instance, instanceOf, instancesIn, lookupsOf, mainModel, material, paint, paintedFaces, Model, model, modelName, newDocument, parent, placements,
    position, rotation, scale, size, voxel, Voxel, voxels,
} from "../../voxels/model/index.js";
import { deleteInstanceAt, enterInstanceAt, leaveTo } from "./index.js";

/** A box model, 2 voxels a side each half the main model's, filled at its lowest cell, placed twice in the main model's middle row. */
const place = System.create({}, ({ commands, resources }) => {
    const box = commands.spawn(Model)({ [model]: true, [modelName]: "box", [size]: [2, 2, 2], [scale]: [0.5, 0.5, 0.5] });
    commands.spawn(Voxel)({ [voxel]: true, [position]: [0, 0, 0], [material]: resources[selectedMaterial], [paint]: resources[selectedMaterial], [paintedFaces]: 0, [parent]: box });
    const spawn = commands.spawn(Instance);
    spawn({ [instance]: true, [instanceOf]: box, [parent]: resources[mainModel], [position]: [3.75, 3.75, 4], [rotation]: Quat.identity });
    spawn({ [instance]: true, [instanceOf]: box, [parent]: resources[mainModel], [position]: [0, 0, 4], [rotation]: Quat.identity });
});

const read = System.create({
    readonly: true,
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] }, placed: { index: instancesIn }, voxels: { index: voxels }, faces: { index: faces }, names: { with: [modelName] } },
}, ({ lookup, resources }) => {
    const current = resources[editing];
    const edited = current === null ? "none" : lookup.names(current.model)?.[modelName] ?? "?";
    const drawn = placements(resources[mainModel], {
        ...lookupsOf(lookup.models, lookup.instances),
        instancesIn: (holder: Entity) => {
            const list = lookup.placed(holder);
            const found: Entity[] = [];
            for (let i = 0; i < list.length; i++) found.push(list.at(i).entity);
            return found;
        },
    }).map(each => lookup.names(each.model)?.[modelName]);
    const boxVoxels = current === null ? 0 : lookup.voxels(current.model).length;
    return { edited, depth: current?.depth ?? 0, drawn, boxVoxels, faces: lookup.faces().length };
});

describe("instances", () => {
    it("enter an instance to edit its model, every instance showing the edit, and leave it, its faces deselected", async () => {
        await using world = World.create({ [workers]: 0 });
        await world.run(newDocument, { size: [8, 8, 8], scale: [1, 1, 1] });
        await world.run(seedMaterials);
        await world.run(place);
        await world.run(frameWorld);
        await world.run(viewCamera, { yaw: 0, pitch: 0 });
        expect((await world.run(read)).drawn).toEqual(["main", "box", "box"]);
        // The middle of the view is the main model's middle, where the first box's filled cell is.
        expect(await world.run(enterInstanceAt, { x: 0, y: 0, aspect: 1 })).toBe(true);
        expect(await world.run(read)).toMatchObject({ edited: "box", depth: 1, boxVoxels: 1 });
        await world.run(pressSelect, { x: 0, y: 0, aspect: 1 });
        await world.run(releaseSelect);
        await world.run(extrudeSelection);
        expect(await world.run(read)).toMatchObject({ edited: "box", boxVoxels: 2, faces: 1 });
        await world.run(leaveTo, { depth: 0 });
        expect(await world.run(read)).toMatchObject({ edited: "main", depth: 0, faces: 0 });
        await world.run(deleteInstanceAt, { x: 0, y: 0, aspect: 1 });
        expect((await world.run(read)).drawn).toEqual(["main", "box"]);
    });
});
