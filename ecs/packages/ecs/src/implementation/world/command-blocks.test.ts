// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import type { Commands } from "../../interface/system/commands.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { Observe } from "../../observe/index.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";
import { count, read, readEach } from "./reads.test-helper.js";

const tagged = Symbol("commandBlocksTest/tagged");
const amount = Symbol("commandBlocksTest/amount");
const point = Symbol("commandBlocksTest/point");
const note = Symbol("commandBlocksTest/note");
const extra = Symbol("commandBlocksTest/extra");

declare module "@adobe/ecs" {
    export interface Components {
        [tagged]: { type: true };
        [amount]: { type: number };
        [point]: { type: { readonly x: number; readonly y: number } };
        [note]: { type: { readonly text: string } };
        [extra]: { type: true };
    }
}

/** A world with no finalizer, reference or index, whose sync points keep commands naming a whole archetype as blocks. */
const withCommands = () => {
    const world = createWorld({ [workers]: 0 });
    let body: (commands: Commands) => void = () => {};
    const issue = System.create({}, ({ commands }) => body(commands));
    const run = async (next: (commands: Commands) => void): Promise<void> => {
        body = next;
        const [failure] = (await runReported(world, issue)).failures;
        if (failure !== undefined) throw new Error(failure.message);
    };
    return { world, run };
};

const alive = async (world: World, entity: Entity): Promise<boolean> =>
    (await Observe.toPromise(Observe.entity(world, entity, { optional: [amount] }))) !== null;

const aliveEach = (world: World, entities: readonly Entity[]): Promise<boolean[]> => Promise.all(entities.map(entity => alive(world, entity)));

const removeTagged = System.create({ components: { with: [tagged] } }, (row, { commands }) => { commands.remove(row.entity, tagged); });
const addTagged = System.create({ components: { with: [amount], not: [tagged] } }, (row, { commands }) => { commands.add(row.entity, tagged); });
const removePoint = System.create({ kernel: true, components: { with: [point, amount] } }, (row, { commands }) => { commands.remove(row.entity, point); });
const addPoint = System.create({ kernel: true, components: { with: [amount], not: [point] } }, (row, { commands }) => { commands.add(row.entity, point, { x: row[amount], y: -row[amount] }); });
const addConstant = System.create({ kernel: true, components: { with: [amount], not: [point] } }, (row, { commands }) => { commands.add(row.entity, point, { x: 7, y: -7 }); });
const despawnTagged = System.create({ components: { with: [tagged] } }, (row, { commands }) => { commands.despawn(row.entity); });

/** The amounts of the rows a system with `changed: [point]` passes. */
const changedPoints: number[] = [];
const readChanged = System.create({ components: { with: [point, amount], changed: [point] } }, row => { changedPoints.push(row[amount]); });

const spawnMany = (commands: Commands, entities: Entity[], count: number, offset = 0): void => {
    for (let i = 0; i < count; i++) entities.push(commands.spawn([tagged, amount, point, note])({ [amount]: offset + i, [point]: { x: offset + i, y: 0 }, [note]: { text: `n${offset + i}` } }));
};

describe("commands naming a whole archetype", () => {
    it("move it whole: values its rows keep stay, values the commands give are written, and back again", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        await run(commands => spawnMany(commands, entities, 100));
        await world.run(removeTagged);
        expect([await count(world, { required: [tagged] }), await count(world, { required: [amount] })]).toEqual([0, 100]);
        expect(await readEach(world, entities, amount)).toEqual(entities.map((_, i) => i));
        expect(await read(world, entities[42], note)).toEqual({ text: "n42" });
        await world.run(removePoint);
        expect(await count(world, { required: [point] })).toBe(0);
        await world.run(addPoint);
        expect(await readEach(world, entities, point)).toEqual(entities.map((_, i) => ({ x: i, y: -i })));
        await world.run(addTagged);
        expect(await count(world, { required: [tagged, point, note] })).toBe(100);
        expect(await readEach(world, entities, note)).toEqual(entities.map((_, i) => ({ text: `n${i}` })));
        await world.dispose();
    });

    it("move it behind rows the target holds already, each entity found at its new row", async () => {
        const { world, run } = withCommands();
        const first: Entity[] = [];
        const second: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 30; i++) first.push(commands.spawn([amount, point, note])({ [amount]: 1000 + i, [point]: { x: 0, y: 0 }, [note]: { text: "already" } }));
            spawnMany(commands, second, 50);
        });
        await world.run(removeTagged);
        expect(await count(world, { required: [amount, point, note], not: [tagged] })).toBe(80);
        expect(await readEach(world, [...first, ...second], amount)).toEqual([...first.map((_, i) => 1000 + i), ...second.map((_, i) => i)]);
        await world.dispose();
    });

    it("plan as entries a block a later command names an entity of, or a despawnWhere follows", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        await run(commands => spawnMany(commands, entities, 40));
        const removeThenMore = System.create({ components: { with: [tagged, amount] } }, (row, { commands }) => {
            commands.remove(row.entity, tagged);
            if (row[amount] === 39) {
                commands.add(entities[3], extra);
                commands.despawn(entities[5]);
            }
        });
        await world.run(removeThenMore);
        expect([await count(world, { required: [tagged] }), await count(world, { required: [extra] }), await alive(world, entities[5])]).toEqual([0, 1, false]);
        expect(await read(world, entities[3], extra)).toBe(true);
        await world.run(addTagged);
        await run(commands => {
            for (const entity of entities) if (entity !== entities[5]) commands.remove(entity, tagged);
            commands.despawnWhere({ with: [amount], where: { [amount]: { "<": 10 } } });
        });
        expect(await aliveEach(world, entities)).toEqual(entities.map((_, i) => i >= 10));
        expect(await count(world, { required: [tagged] })).toBe(0);
        await world.dispose();
    });

    it("move an archetype whole into one that others empty, keeping the rows it brings", async () => {
        const { world, run } = withCommands();
        const moved: Entity[] = [];
        const leaving: Entity[] = [];
        const arriving: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 20; i++) moved.push(commands.spawn([tagged, amount, extra])({ [amount]: i }));
            for (let i = 0; i < 20; i++) leaving.push(commands.spawn([tagged, amount])({ [amount]: 100 + i }));
        });
        await run(commands => {
            for (const entity of moved) commands.remove(entity, extra);
            for (const entity of leaving) commands.remove(entity, tagged);
        });
        expect([await count(world, { required: [tagged, amount], not: [extra] }), await count(world, { required: [amount], not: [tagged] })]).toEqual([20, 20]);
        expect(await readEach(world, [...moved, ...leaving], amount)).toEqual([...moved.map((_, i) => i), ...leaving.map((_, i) => 100 + i)]);
        await run(commands => {
            for (let i = 0; i < 20; i++) arriving.push(commands.spawn([tagged, amount, point])({ [amount]: 200 + i, [point]: { x: 0, y: 0 } }));
        });
        await run(commands => {
            for (const entity of arriving) commands.remove(entity, point);
            for (const entity of moved) commands.despawn(entity);
        });
        expect([await count(world, { required: [tagged, amount], not: [point, extra] }), ...await aliveEach(world, moved)]).toEqual([20, ...moved.map(() => false)]);
        expect(await readEach(world, arriving, amount)).toEqual(arriving.map((_, i) => 200 + i));
        await world.dispose();
    });

    it("despawn it whole, each entity released and its index reused after", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        const kept: Entity[] = [];
        await run(commands => {
            spawnMany(commands, entities, 64);
            for (let i = 0; i < 5; i++) kept.push(commands.spawn([amount])({ [amount]: i }));
        });
        await world.run(despawnTagged);
        expect(await aliveEach(world, entities)).toEqual(entities.map(() => false));
        expect(await aliveEach(world, kept)).toEqual(kept.map(() => true));
        const again: Entity[] = [];
        await run(commands => spawnMany(commands, again, 64, 500));
        expect(await aliveEach(world, again)).toEqual(again.map(() => true));
        expect(await read(world, again[63], amount)).toBe(563);
        await world.dispose();
    });

    it("stamp the components they add as added and changed, which change filters pass", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        await run(commands => spawnMany(commands, entities, 20));
        await world.run(readChanged);
        await world.run(removePoint);
        await world.run(readChanged);
        changedPoints.length = 0;
        await world.run(addPoint);
        await world.run(readChanged);
        expect([...changedPoints].sort((a, b) => a - b)).toEqual(entities.map((_, i) => i));
        changedPoints.length = 0;
        await world.run(readChanged);
        expect(changedPoints).toEqual([]);
        await world.dispose();
    });

    it("leave in place an archetype whose commands replace values or remove what it lacks, as entries", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        await run(commands => spawnMany(commands, entities, 30));
        const replace = System.create({ components: { with: [tagged, amount] } }, (row, { commands }) => { commands.add(row.entity, amount, row[amount] * 2); });
        const removeAbsent = System.create({ components: { with: [tagged] } }, (row, { commands }) => { commands.remove(row.entity, extra); });
        await world.run(replace);
        await world.run(removeAbsent);
        expect(await count(world, { required: [tagged, amount, point, note] })).toBe(30);
        expect(await readEach(world, entities, amount)).toEqual(entities.map((_, i) => i * 2));
        await world.dispose();
    });

    it("write a value every command gives alike once, repeated to each row, stamped as added and changed", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        await run(commands => spawnMany(commands, entities, 1000));
        await world.run(readChanged);
        await world.run(removePoint);
        changedPoints.length = 0;
        await world.run(addConstant);
        await world.run(readChanged);
        expect(await readEach(world, entities, point)).toEqual(entities.map(() => ({ x: 7, y: -7 })));
        expect(changedPoints.length).toBe(1000);
        await world.dispose();
    });
});
