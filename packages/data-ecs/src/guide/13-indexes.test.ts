import { expect, it } from "vitest";
import { Component, Index, Observe, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const cell = Symbol("cell");
const crowded = Symbol("crowded");
const score = Symbol("score");
const player = Symbol("player");
const serverId = Symbol("serverId");

declare module "@adobe/data-ecs" {
    interface Components {
        [cell]: { type: readonly [number, number] };
        [crowded]: { type: number };
        [score]: { type: number };
        [player]: { type: string };
        [serverId]: { type: number };
    }
}

Component.register(cell, { type: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 } });
Component.register(crowded, { type: { type: "number" } });
Component.register(score, { type: { type: "number" } });
Component.register(player, { type: { type: "string" } });
Component.register(serverId, { type: { type: "integer" } });

// An index finds entities by their components' values: here, those with a crowded count, by their cell.
const grid = Index.create({ key: [cell], components: { has: [crowded] } });

// A lookup through it gives the rows with a key, in entity order.
const count = System.create({ components: { read: [cell], write: [crowded] }, lookup: { at: { index: grid } } }, (row, { lookup }) => {
    const [x, y] = row[cell];
    row[crowded] = lookup.at([x, y]).length;
});

// A sorted index keeps its key's order: lookups take a range, and `order` runs a system's rows in it.
const byScore = Index.create({ key: [score], sorted: true, components: { has: [player] } });

const winners: string[] = [];
const leaders = System.create({ lookup: { scores: { index: byScore, read: [player] } } }, ({ lookup }) => {
    winners.length = 0;
    const high = lookup.scores({ ">=": 90 });
    for (let i = 0; i < high.length; i++) winners.push(high.at(i)[player]);
});

const board: string[] = [];
const list = System.create({ components: { read: [player] }, order: byScore }, row => {
    board.push(row[player]);
});

// A unique index gives one row, or null.
const byServerId = Index.create({ key: [serverId], unique: true });
let found: number | null = null;
const find = System.create({ input: { type: "object", properties: { id: { type: "integer" } } }, lookup: { byId: { index: byServerId } } }, ({ input, lookup }) => {
    found = lookup.byId(input.id)?.entity ?? null;
});

// An index without a key holds every entity with its components, in entity order: a count kept without a query.
const players = Index.create({ key: [], components: { has: [player] } });
let playerCount = 0;
const countPlayers = System.create({ lookup: { players: { index: players } } }, ({ lookup }) => {
    const all = lookup.players();
    if (all.changed) playerCount = all.length;
});

const places: readonly (readonly [number, number])[] = [[0, 0], [0, 0], [1, 0]];
const spawn = System.create(({ commands }) => {
    for (const place of places) commands.spawn([cell, crowded])({ [cell]: place, [crowded]: 0 });
    commands.spawn([player, score, serverId])({ [player]: "ada", [score]: 95, [serverId]: 7 });
    commands.spawn([player, score, serverId])({ [player]: "bo", [score]: 80, [serverId]: 8 });
    commands.spawn([player, score, serverId])({ [player]: "cy", [score]: 91, [serverId]: 9 });
});

it("finds rows by key, by range and in order", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(count);
    const counts = await Observe.toPromise(world.observe.select({ required: [crowded] }));
    const values = await Promise.all(counts.map(entity => Observe.toPromise(world.observe.entity(entity, { required: [crowded] }))));
    expect(values.map(value => value?.[crowded]).sort()).toEqual([1, 2, 2]);
    await world.run(leaders);
    expect(winners).toEqual(["cy", "ada"]);
    board.length = 0;
    await world.run(list);
    expect(board).toEqual(["bo", "cy", "ada"]);
    await world.run(find, { id: 8 });
    expect(found).not.toBeNull();
    await world.run(find, { id: 1 });
    expect(found).toBeNull();
    await world.run(countPlayers);
    expect(playerCount).toBe(3);
});
