// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, Vec3, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const frozen = Symbol();
const delta = Symbol();
const frames = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [frozen]: { type: true };
    }
    interface Resources {
        [delta]: { type: number; default: 0.5 };
        [frames]: { type: number };
    }
}

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
    commands.spawn([position, velocity, frozen])({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
    commands.spawn([position])({ [position]: [5, 0, 0] });
});

const move = System.create({
    components: { with: [velocity, position], not: [frozen] },
}, (row, { resources }) => {
    // Values are replaced whole, never edited in place.
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

const count = System.create({}, ({ resources }) => {
    resources[frames] += 1;
});

const places: number[] = [];
const read = System.create({ readonly: true, components: { with: [position] } }, row => {
    places.push(row[position][0]);
});

const speeds: string[] = [];
const readSpeeds = System.create({ readonly: true, components: { with: [position], optional: [velocity] } }, row => {
    speeds.push(row[velocity] === undefined ? "still" : `at ${row[velocity][0]}`);
});

const frameCount = System.create({ readonly: true }, ({ resources }) => resources[frames]);

const fail = System.create(() => {
    throw new Error("broken");
});
const countThenFail = System.create([count, fail]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(move);
    await world.run(read);
    console.log("at", places.sort((a, b) => a - b));
    await world.run(readSpeeds);
    console.log("moving", speeds.sort());
    await world.run(count);
    console.log("frames", await world.run(frameCount));
    await world.run(countThenFail).catch((error: unknown) => console.log(String(error)));
    console.log("frames", await world.run(frameCount));
};
