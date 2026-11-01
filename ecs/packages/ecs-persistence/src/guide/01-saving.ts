// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World, type Vec3 } from "@adobe/ecs";
import { decode, encode, persist, snapshot, spawn } from "../index.js";

const position = Symbol();
const name = Symbol();
const target = Symbol();
const selected = Symbol();
const level = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3; [persist]: "position" };
        [name]: { type: string; [persist]: "name" };
        [target]: { type: Entity; reference: "weak"; [persist]: "target" };
        [selected]: { type: true };
    }
    interface Resources {
        [level]: { type: number; default: 1; [persist]: "level" };
    }
}

const build = System.create(({ commands, resources }) => {
    const tower = commands.spawn([name, position, selected])({ [name]: "tower", [position]: [4, 0, 2] });
    commands.spawn([name, position, target])({ [name]: "archer", [position]: [1, 0, 1], [target]: tower });
    resources[level] = 3;
});

const report = System.create({ readonly: true, components: { with: [name, position], optional: [target, selected] } }, row => {
    const notes = [...row[target] === undefined ? [] : ["targets an entity"], ...row[selected] === undefined ? [] : ["selected"]];
    console.log(row[name], "at", row[position], ...notes);
});
const levelOf = System.create({ readonly: true }, ({ resources }) => resources[level]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(build);
    const taken = await snapshot({ world });
    if (taken.failure !== undefined) return console.log(taken.failure);
    const bytes = encode(taken);
    console.log("saved", bytes.length > 0 ? "bytes" : "nothing");

    await using loaded = World.create();
    const read = decode(bytes);
    if (read.failure !== undefined) return console.log(read.failure);
    const spawned = await spawn({ world: loaded, snapshot: read });
    if (spawned.failure !== undefined) return console.log(spawned.failure);
    await loaded.run(report);
    console.log("level", await loaded.run(levelOf), "of", spawned.entities.size, "entities");
};
