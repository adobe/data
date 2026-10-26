// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, Vec2, World } from "../index.js";

const cell = Symbol();
const offset = Symbol();
const velocity = Symbol();
const position = Symbol();
const camera = Symbol();

/** A camera, as a renderer would give one: which chunks of the world it sees. */
type Camera = { readonly sees: (chunk: Vec2.I32) => boolean };

declare module "@adobe/ecs" {
    interface Components {
        // The chunk of the world an entity is in: each chunk's entities share an archetype.
        [cell]: { type: Vec2.I32; shared: true };
        // Where an entity is within its chunk, and in the world.
        [offset]: { type: Vec2 };
        [velocity]: { type: Vec2 };
        [position]: { type: Vec2 };
    }
    interface Resources {
        [camera]: { type: Camera | null };
    }
}

const size = 10;
const Unit = [cell, offset, velocity, position] as const;

// Two units in each of 7 × 7 chunks, all moving east.
const populate = System.create(({ commands }) => {
    for (let x = -3; x <= 3; x++) {
        for (let y = -3; y <= 3; y++) {
            const spawn = commands.spawn(Unit, { [cell]: [x, y], [velocity]: [4, 0], [position]: [0, 0] });
            spawn({ [offset]: [2, 3] });
            spawn({ [offset]: [7, 8] });
        }
    }
});

const place = System.create({ components: { with: [cell, offset, position] } }, row => {
    row[position] = Vec2.add(Vec2.scale([row[cell][0], row[cell][1]], size), row[offset]);
});

const drift = System.create({ components: { with: [offset, velocity] } }, row => {
    row[offset] = Vec2.add(row[offset], row[velocity]);
});

// A unit past its chunk's edge moves into the next chunk.
const cross = System.create({ components: { with: [cell, offset] } }, (row, { commands }) => {
    const [x, y] = row[offset];
    if (x >= size) commands.add(row.entity, [cell, offset], { [cell]: [row[cell][0] + 1, row[cell][1]], [offset]: [x - size, y] });
});

let drawn = 0;
let left = Infinity;
let right = -Infinity;
const draw = System.create({
    observer: true,
    components: { with: [position], where: { [cell]: (at, { resources }) => resources[camera]?.sees(at) === true } },
}, row => {
    drawn += 1;
    left = Math.min(left, row[position][0]);
    right = Math.max(right, row[position][0]);
});

let refreshed = 0;
const refresh = System.create({
    observer: true,
    components: { with: [position], changed: [position], where: { [cell]: (at, { resources }) => resources[camera]?.sees(at) === true } },
}, () => {
    refreshed += 1;
});

// Only chunk [4, 0], which no unit is in until one crosses into it.
let east = 0;
const countEast = System.create({ observer: true, components: { with: [position], where: { [cell]: [4, 0] } } }, () => {
    east += 1;
});

/** How many chunks cameras were asked about. */
let asked = 0;

/** A camera over a chunk, seeing the chunks within `radius` of it. */
const cameraOver = ([overX, overY]: readonly [number, number], radius: number): Camera => ({
    sees: ([x, y]) => {
        asked += 1;
        return Math.max(Math.abs(x - overX), Math.abs(y - overY)) <= radius;
    },
});

const look = System.create({}, ({ resources }, input: { readonly x: number; readonly y: number }) => {
    resources[camera] = cameraOver([input.x, input.y], 1);
});

const report = async (world: World, what: string): Promise<void> => {
    drawn = refreshed = east = asked = 0;
    left = Infinity;
    right = -Infinity;
    await world.run(draw);
    await world.run(refresh);
    await world.run(countEast);
    console.log(what, "drew", drawn, "from x", left, "to", right, "refreshed", refreshed, "east", east, "asked", asked);
};

export const main = async (): Promise<void> => {
    await using world = World.create({ [camera]: cameraOver([0, 0], 1) });
    await world.run(populate);
    await world.run(place);
    await report(world, "start:");
    await world.run(drift);
    await world.run(cross);
    await world.run(place);
    await report(world, "after a step:");
    await report(world, "unchanged:");
    await world.run(look, { x: 2, y: 2 });
    await report(world, "camera moved:");
};
