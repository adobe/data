// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { type I32, Index, System, type Vec2, World } from "../index.js";

const cell = Symbol();
const crowded = Symbol();
const score = Symbol();
const player = Symbol();
const serverId = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [cell]: { type: Vec2.I32 };
        [crowded]: { type: number };
        [score]: { type: number };
        [player]: { type: string };
        [serverId]: { type: I32 };
    }
}

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
const leaders = System.create({ observer: true, lookup: { scores: { index: byScore, read: [player] } } }, ({ lookup }) => {
    winners.length = 0;
    const high = lookup.scores({ ">=": 90 });
    for (let i = 0; i < high.length; i++) winners.push(high.at(i)[player]);
});

const board: string[] = [];
const list = System.create({ observer: true, components: { read: [player] }, order: byScore }, row => {
    board.push(row[player]);
});

// A unique index gives one row, or null.
const byServerId = Index.create({ key: [serverId], unique: true });
let found: number | null = null;
const find = System.create({ lookup: { byId: { index: byServerId } } }, ({ lookup }, input: { readonly id: number }) => {
    found = lookup.byId(input.id)?.entity ?? null;
});

// An index without a key holds every entity with its components, in entity order. With changed: true, this observer
// system runs only when an entity entered or left the index, so added, it keeps a count as players come and go.
const players = Index.create({ key: [], components: { has: [player] } });
let playerCount = 0;
const countPlayers = System.create({ observer: true, lookup: { players: { index: players, changed: true } } }, ({ lookup }) => {
    playerCount = lookup.players().length;
});

const crowds: number[] = [];
const readCrowds = System.create({ observer: true, components: { read: [crowded] } }, row => {
    crowds.push(row[crowded]);
});

const places: readonly (readonly [number, number])[] = [[0, 0], [0, 0], [1, 0]];
const spawn = System.create(({ commands }) => {
    for (const place of places) commands.spawn([cell, crowded])({ [cell]: place, [crowded]: 0 });
    commands.spawn([player, score, serverId])({ [player]: "ada", [score]: 95, [serverId]: 7 });
    commands.spawn([player, score, serverId])({ [player]: "bo", [score]: 80, [serverId]: 8 });
    commands.spawn([player, score, serverId])({ [player]: "cy", [score]: 91, [serverId]: 9 });
});

it("finds rows by key, by range and in order", async () => {
    await using world = World.create();
    world.add(countPlayers);
    await world.run(spawn);
    expect(playerCount).toBe(3);
    await world.run(count);
    await world.run(readCrowds);
    expect(crowds.sort()).toEqual([1, 2, 2]);
    await world.run(leaders);
    expect(winners).toEqual(["cy", "ada"]);
    board.length = 0;
    await world.run(list);
    expect(board).toEqual(["bo", "cy", "ada"]);
    await world.run(find, { id: 8 });
    expect(found).not.toBeNull();
    await world.run(find, { id: 1 });
    expect(found).toBeNull();
});
