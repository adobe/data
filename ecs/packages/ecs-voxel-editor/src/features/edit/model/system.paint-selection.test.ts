// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, workers, World } from "@adobe/ecs";
import { loadDocument, serializeDocument } from "../../document/model/index.js";
import { recordHistory } from "../../history/model/plugin.history-model/system.record-history.js";
import { undo } from "../../history/model/index.js";
import { isPaint, materialNamed, name, seedMaterials, selectedPaint, setLayer } from "../../materials/model/index.js";
import { faceCell, faceSide, SelectedFace } from "../../selection/model/index.js";
import { mainModel, material, newDocument, paint, paintedFaces, parent, position, voxels } from "../../voxels/model/index.js";
import { extrudeSelection, paintSelection } from "./index.js";

/** Selects the top face of the voxel at `cell`. */
const selectTop = System.create({}, ({ commands, resources }, input: { readonly cell: readonly [number, number, number] }) => {
    commands.spawn(SelectedFace)({ [parent]: resources[mainModel], [faceCell]: input.cell, [faceSide]: 2 });
});

/** Picks a paint by name. */
const pickPaint = System.create({ lookup: { named: { index: materialNamed } } }, ({ lookup, resources }, input: { readonly name: string }) => {
    resources[selectedPaint] = lookup.named(input.name)?.entity ?? resources[selectedPaint];
});

/** Each voxel as `cell=material/paint:faces`, by name, its painted faces' bits. */
const read = System.create({ lookup: { voxels: { index: voxels }, names: { with: [name] } } }, ({ lookup }) => {
    const all = lookup.voxels();
    const found: string[] = [];
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        found.push(`${[...row[position]].join(",")}=${lookup.names(row[material])?.[name]}/${lookup.names(row[paint])?.[name]}:${row[paintedFaces]}`);
    }
    return found.sort();
});

const isPaintNamed = System.create({ lookup: { named: { index: materialNamed }, paints: { with: [isPaint] } } }, ({ lookup }, input: { readonly name: string }) => {
    const found = lookup.named(input.name);
    return found !== null && lookup.paints(found.entity) !== null;
});

/** A world with one stone voxel at the origin, its top face selected. */
const fresh = async (): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    await world.run(newDocument, { size: [4, 4, 4], scale: [1, 1, 1] });
    await world.run(seedMaterials);
    await world.run(selectTop, { cell: [0, -1, 0] });
    await world.run(extrudeSelection);
    await world.run(recordHistory);
    return world;
};

describe("paint", () => {
    it("starts each voxel painted with its own material, and seeds asphalt and the paints", async () => {
        await using world = await fresh();
        expect(await world.run(read)).toEqual(["0,0,0=stone/stone:0"]);
        expect(await world.run(isPaintNamed, { name: "asphalt" })).toBe(false);
        expect(await world.run(isPaintNamed, { name: "white" })).toBe(true);
    });

    it("paints the selected faces alone, takes the paint off again, and undoes each", async () => {
        await using world = await fresh();
        await world.run(pickPaint, { name: "red" });
        expect(await world.run(paintSelection, { remove: false })).toBe(true);
        await world.run(recordHistory);
        // The top face, side 2, is painted: bit 4.
        expect(await world.run(read)).toEqual(["0,0,0=stone/red:4"]);
        expect(await world.run(paintSelection, { remove: false })).toBe(false);
        await world.run(paintSelection, { remove: true });
        await world.run(recordHistory);
        expect(await world.run(read)).toEqual(["0,0,0=stone/stone:0"]);
        await world.run(undo);
        expect(await world.run(read)).toEqual(["0,0,0=stone/red:4"]);
        await world.run(undo);
        expect(await world.run(read)).toEqual(["0,0,0=stone/stone:0"]);
    });

    it("extrudes painted faces, in paint mode, as the material beneath painted all over", async () => {
        await using world = await fresh();
        await world.run(setLayer, { layer: "paint" });
        await world.run(pickPaint, { name: "yellow" });
        await world.run(paintSelection, { remove: false });
        await world.run(extrudeSelection);
        expect(await world.run(read)).toEqual(["0,0,0=stone/yellow:4", "0,1,0=stone/yellow:63"]);
    });

    it("saves only paint differing from the material, and opens it again", async () => {
        await using world = await fresh();
        await world.run(extrudeSelection);
        await world.run(pickPaint, { name: "white" });
        await world.run(paintSelection, { remove: false });
        const files = await world.run(serializeDocument, { path: "road.voxel.json", standalone: false, thumbnails: [] });
        const text = files[0]?.text ?? "";
        expect(JSON.parse(text).materials.find((each: { name: string }) => each.name === "white")).toMatchObject({ paint: true });
        await using opened = World.create({ [workers]: 0 });
        await opened.run(newDocument, { size: [1, 1, 1], scale: [1, 1, 1] });
        expect(await opened.run(loadDocument, { path: "road.voxel.json", files: [["road.voxel.json", text]] })).toEqual([]);
        expect(await opened.run(read)).toEqual(["0,0,0=stone/stone:0", "0,1,0=stone/white:4"]);
        expect(await opened.run(isPaintNamed, { name: "white" })).toBe(true);
    });
});
