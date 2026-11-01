// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World, type Vec3 } from "@adobe/ecs";
import { decode, encode, snapshot, spawn } from "../index.js";

/** Saved in the document's file, under its name there. */
const file = Symbol();
/** Saved in the user's own settings, under its name there. */
const settings = Symbol();
const voxel = Symbol();
const material = Symbol();
const size = Symbol();
const tool = Symbol();
const panelOpen = Symbol();

declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [file]: string;
        readonly [settings]: string;
    }
    interface Components {
        [voxel]: { type: Vec3.I32; [file]: "voxel" };
        [material]: { type: string; [file]: "material" };
    }
    interface Resources {
        [size]: { type: number; default: 16; [file]: "size" };
        [tool]: { type: string; default: "select"; [settings]: "tool" };
        [panelOpen]: { type: boolean; default: false; [settings]: "panel open" };
    }
}

const edit = System.create(({ commands, resources }) => {
    commands.spawn([voxel, material])({ [voxel]: [0, 0, 0], [material]: "stone" });
    commands.spawn([voxel, material])({ [voxel]: [0, 1, 0], [material]: "grass" });
    resources[size] = 32;
    resources[tool] = "brush";
    resources[panelOpen] = true;
});

const report = System.create({ readonly: true }, ({ resources }) => `size ${resources[size]}, tool ${resources[tool]}, panel ${resources[panelOpen] ? "open" : "closed"}`);
let voxels = 0;
const countVoxels = System.create({ readonly: true, components: { with: [voxel] } }, () => { voxels++; });

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(edit);
    const drawing = await snapshot({ world, by: file });
    if (drawing.failure !== undefined) return console.log(drawing.failure);
    const preferences = await snapshot({ world, by: settings });
    if (preferences.failure !== undefined) return console.log(preferences.failure);
    const fileBytes = encode(drawing);
    const settingsBytes = encode(preferences);

    // Each kind of bytes loads only as itself.
    const settingsAsDocument = decode(settingsBytes, { by: file });
    console.log("settings as a document:", settingsAsDocument.failure ?? "loaded");
    const fileAsSettings = decode(fileBytes, { by: settings });
    console.log("a document as settings:", fileAsSettings.failure ?? "loaded");

    // A document opened on another machine, with that user's own settings.
    await using opened = World.create();
    const read = decode(fileBytes, { by: file });
    if (read.failure !== undefined) return console.log(read.failure);
    const spawned = await spawn({ world: opened, snapshot: read });
    if (spawned.failure !== undefined) return console.log(spawned.failure);
    await opened.run(countVoxels);
    console.log("opened:", voxels, "voxels,", await opened.run(report));

    // The settings alone, in a world of their own: resources, no entities.
    await using restored = World.create();
    const own = decode(settingsBytes, { by: settings });
    if (own.failure !== undefined) return console.log(own.failure);
    const applied = await spawn({ world: restored, snapshot: own });
    if (applied.failure !== undefined) return console.log(applied.failure);
    console.log("restored:", applied.entities.size, "entities,", await restored.run(report));
};
