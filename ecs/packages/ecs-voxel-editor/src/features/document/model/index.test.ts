// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { type Entity, Quat, System, workers, World } from "@adobe/ecs";
import { name } from "../../materials/model/index.js";
import { materials, seedMaterials, selectedMaterial } from "../../materials/model/index.js";
import { faceCell, faceSide, namedSelections, SelectedFace, saveSelection } from "../../selection/model/index.js";
import {
    Instance, instance, instanceOf, instancesIn, mainModel, material, paint, paintedFaces, Model, model, modelName, models, newDocument, parent, position, rotation, scale, size,
    source, voxel, Voxel, voxels,
} from "../../voxels/model/index.js";
import { loadDocument, serializeDocument } from "./index.js";

/** A document: a main model with two stone voxels and a window model, placed once, holding a voxel; its main model's face selected and saved as "front". */
const build = System.create({}, ({ commands, resources }) => {
    const main = resources[mainModel];
    const stone = resources[selectedMaterial];
    const window = commands.spawn(Model)({ [model]: true, [modelName]: "window", [size]: [2, 2, 1], [scale]: [0.5, 0.5, 0.5] });
    const spawnVoxel = commands.spawn(Voxel);
    spawnVoxel({ [voxel]: true, [position]: [0, 0, 0], [material]: stone, [paint]: stone, [paintedFaces]: 0, [parent]: main });
    spawnVoxel({ [voxel]: true, [position]: [1, 0, 0], [material]: stone, [paint]: stone, [paintedFaces]: 0, [parent]: main });
    spawnVoxel({ [voxel]: true, [position]: [1, 1, 0], [material]: stone, [paint]: stone, [paintedFaces]: 0, [parent]: window });
    commands.spawn(Instance)({ [instance]: true, [instanceOf]: window, [parent]: main, [position]: [2, 0, 0], [rotation]: Quat.identity });
    commands.spawn(SelectedFace)({ [parent]: main, [faceCell]: [0, 0, 0], [faceSide]: 4 });
});

/** The document as text: each model, its source, voxels and instances, and the saved selections' names. */
const read = System.create({
    readonly: true,
    lookup: { models: { index: models }, sources: { with: [source] }, voxels: { index: voxels }, placed: { index: instancesIn }, names: { with: [modelName] }, materials: { with: [name] } },
}, ({ lookup, resources }) => {
    const all = lookup.models();
    const described: string[] = [];
    const nameOf = (entity: Entity): string => lookup.names(entity)?.[modelName] ?? "?";
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        const cells: string[] = [];
        const shown = lookup.voxels(row.entity);
        for (let k = 0; k < shown.length; k++) cells.push(`${[...shown.at(k)[position]].join(",")}=${lookup.materials(shown.at(k)[material])?.[name]}`);
        const placed: string[] = [];
        const here = lookup.placed(row.entity);
        for (let k = 0; k < here.length; k++) placed.push(`${nameOf(here.at(k)[instanceOf])}@${[...here.at(k)[position]].join(",")}`);
        described.push(`${row[modelName]}${lookup.sources(row.entity) === null ? "" : ` from ${lookup.sources(row.entity)?.[source]}`}: ${cells.sort().join(" ")} | ${placed.join(" ")}`);
    }
    return { models: described.sort(), main: nameOf(resources[mainModel]), selections: [...resources[namedSelections]?.keys() ?? []] };
});

const readMaterials = System.create({ readonly: true, lookup: { materials: { index: materials } } }, ({ lookup }) => {
    const all = lookup.materials();
    const names: string[] = [];
    for (let i = 0; i < all.length; i++) names.push(all.at(i)[name]);
    return names.sort();
});

const fresh = async (): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    await world.run(newDocument, { size: [4, 4, 4], scale: [1, 1, 1] });
    await world.run(seedMaterials);
    return world;
};

describe("documents", () => {
    it("save and open again: models, voxels, instances and saved selections", async () => {
        const files = await (async () => {
            await using world = await fresh();
            await world.run(build);
            await world.run(saveSelection, { name: "front" });
            return await world.run(serializeDocument, { path: "house.voxel.json", standalone: false, thumbnails: [] });
        })();
        expect(files.map(file => file.path)).toEqual(["house.voxel.json"]);
        await using world = World.create({ [workers]: 0 });
        expect(await world.run(loadDocument, { path: "house.voxel.json", files: files.map(file => [file.path, file.text] as const) })).toEqual([]);
        expect(await world.run(read)).toEqual({
            models: ["main: 0,0,0=stone 1,0,0=stone | window@2,0,0", "window: 1,1,0=stone | "],
            main: "main",
            selections: ["front"],
        });
    });

    it("open referenced models from their files, merging materials by name, and save edits back to them", async () => {
        const tower = JSON.stringify({
            format: "adobe-voxel", version: 1, main: "tower",
            materials: [
                { name: "Stone", baseColor: [1, 0, 0, 1], metallic: 0, roughness: 1 },
                { name: "glass", baseColor: [0.8, 0.9, 1, 1], metallic: 0, roughness: 0.1 },
            ],
            models: { tower: { size: [1, 2, 1], scale: [1, 1, 1], voxels: { palette: ["glass"], runs: [2, 1] }, instances: [] } },
        });
        const house = JSON.stringify({
            format: "adobe-voxel", version: 1, main: "house",
            materials: [{ name: "stone", baseColor: [0.4, 0.4, 0.4, 1], metallic: 0, roughness: 1 }],
            models: {
                house: { size: [4, 4, 4], scale: [1, 1, 1], voxels: { palette: ["stone"], runs: [1, 1, 63, 0], }, instances: [{ model: "tower", position: [3, 0, 3], rotation: [0, 0, 0, 1] }] },
                tower: { ref: "parts/tower.voxel.json" },
            },
        });
        await using world = World.create({ [workers]: 0 });
        const errors = await world.run(loadDocument, { path: "house.voxel.json", files: [["house.voxel.json", house], ["parts/tower.voxel.json", tower]] });
        expect(errors).toEqual(['Material "Stone" differs from "stone" only in case; using "stone".']);
        expect(await world.run(readMaterials)).toEqual(["glass", "stone"]);
        expect((await world.run(read)).models).toEqual([
            "house: 0,0,0=stone | tower@3,0,3",
            "tower from parts/tower.voxel.json: 0,0,0=glass 0,1,0=glass | ",
        ]);
        const saved = await world.run(serializeDocument, { path: "house.voxel.json", standalone: false, thumbnails: [] });
        expect(saved.map(file => file.path).sort()).toEqual(["house.voxel.json", "parts/tower.voxel.json"]);
        const kept = JSON.parse(saved.find(file => file.path === "house.voxel.json")?.text ?? "{}");
        expect(kept.models.tower).toEqual({ ref: "parts/tower.voxel.json" });
        const standalone = await world.run(serializeDocument, { path: "house-standalone.voxel.json", standalone: true, thumbnails: [] });
        expect(standalone.map(file => file.path)).toEqual(["house-standalone.voxel.json"]);
        expect(JSON.parse(standalone[0]?.text ?? "{}").models.tower.size).toEqual([1, 2, 1]);
    });
});
