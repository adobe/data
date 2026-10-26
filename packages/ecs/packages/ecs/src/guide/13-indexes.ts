// © 2026 Adobe. MIT License. See /LICENSE for details.
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

const grid = Index.create({ key: [cell], components: { with: [crowded] } });

const count = System.create({ components: { with: [cell, crowded] }, lookup: { at: { index: grid } } }, (row, { lookup }) => {
    const [x, y] = row[cell];
    row[crowded] = lookup.at([x, y]).length;
});

const byScore = Index.create({ key: [score], sorted: true, components: { with: [player] } });

const leaders = System.create({ observer: true, lookup: { scores: { index: byScore } } }, ({ lookup }) => {
    const winners: string[] = [];
    const high = lookup.scores({ ">=": 90 });
    for (let i = 0; i < high.length; i++) winners.push(high.at(i)[player]);
    return winners;
});

const list = System.create({ observer: true, components: { with: [player, score] }, order: byScore }, row => {
    console.log(row[player], row[score]);
});

const byServerId = Index.create({ key: [serverId], unique: true, components: { with: [player] } });
const find = System.create({ lookup: { byId: { index: byServerId } } }, ({ lookup }, input: { readonly id: number }) =>
    lookup.byId(input.id)?.[player] ?? null);

const players = Index.create({ key: [], components: { with: [player] } });
const countPlayers = System.create({ observer: true, lookup: { players: { index: players, changed: true } } }, ({ lookup }) => {
    console.log("players", lookup.players().length);
});

const crowds: number[] = [];
const readCrowds = System.create({ observer: true, components: { with: [crowded] } }, row => {
    crowds.push(row[crowded]);
});

const places: readonly (readonly [number, number])[] = [[0, 0], [0, 0], [1, 0]];
const spawn = System.create(({ commands }) => {
    for (const place of places) commands.spawn([cell, crowded])({ [cell]: place, [crowded]: 0 });
    commands.spawn([player, score, serverId])({ [player]: "ada", [score]: 95, [serverId]: 7 });
    commands.spawn([player, score, serverId])({ [player]: "bo", [score]: 80, [serverId]: 8 });
    commands.spawn([player, score, serverId])({ [player]: "cy", [score]: 91, [serverId]: 9 });
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    world.add(countPlayers);
    await world.run(spawn);
    await world.run(count);
    await world.run(readCrowds);
    console.log("crowds", crowds.sort((a, b) => a - b));
    console.log("90 and up", await world.run(leaders));
    await world.run(list);
    console.log("server 8", await world.run(find, { id: 8 }));
    console.log("server 1", await world.run(find, { id: 1 }));
};
