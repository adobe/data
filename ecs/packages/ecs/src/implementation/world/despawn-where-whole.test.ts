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
import { count, read } from "./reads.test-helper.js";

const doomed = Symbol("despawnWhereWholeTest/doomed");
const amount = Symbol("despawnWhereWholeTest/amount");
const other = Symbol("despawnWhereWholeTest/other");
const item = Symbol("despawnWhereWholeTest/item");
const zone = Symbol("despawnWhereWholeTest/zone");

declare module "@adobe/ecs" {
    export interface Components {
        [doomed]: { type: true };
        [amount]: { type: number };
        [other]: { type: true };
        [item]: { type: { readonly label: string } };
        [zone]: { type: number; shared: true };
    }
}

/** A world with no finalizer, reference or index, whose `despawnWhere`s empty whole archetypes, and a way to run commands. */
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

describe("despawnWhere emptying whole archetypes", () => {
    it("despawns every entity of each archetype it selects whole, keeping the rest, and reuses their indexes after", async () => {
        const { world, run } = withCommands();
        const whole: Entity[] = [];
        const kept: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 40; i++) whole.push(commands.spawn([doomed, amount])({ [amount]: i }));
            for (let i = 0; i < 10; i++) whole.push(commands.spawn([doomed, amount, other])({ [amount]: i }));
            for (let i = 0; i < 10; i++) kept.push(commands.spawn([amount])({ [amount]: i }));
        });
        await run(commands => commands.despawnWhere({ with: [doomed] }));
        expect(await aliveEach(world, whole)).toEqual(whole.map(() => false));
        expect(await aliveEach(world, kept)).toEqual(kept.map(() => true));
        expect(await count(world, { required: [doomed] })).toBe(0);
        const again: Entity[] = [];
        await run(commands => { for (let i = 0; i < 50; i++) again.push(commands.spawn([doomed, amount])({ [amount]: 100 + i })); });
        expect(await aliveEach(world, again)).toEqual(again.map(() => true));
        expect(await aliveEach(world, whole)).toEqual(whole.map(() => false));
        expect(await read(world, again[49], amount)).toBe(149);
        await world.dispose();
    });

    it("drops commands after it to the entities it despawned, and keeps what arrives in or is spawned into the archetype", async () => {
        const { world, run } = withCommands();
        let first = Entity.none, arriving = Entity.none, spawned = Entity.none;
        await run(commands => {
            first = commands.spawn([doomed, amount])({ [amount]: 1 });
            commands.spawn([doomed, amount])({ [amount]: 2 });
            arriving = commands.spawn([amount])({ [amount]: 3 });
        });
        await run(commands => {
            commands.despawnWhere({ with: [doomed] });
            commands.add(first, other);
            commands.add(arriving, doomed);
            spawned = commands.spawn([doomed, amount])({ [amount]: 4 });
        });
        expect(await aliveEach(world, [first, arriving, spawned])).toEqual([false, true, true]);
        expect(await count(world, { required: [doomed] })).toBe(2);
        expect(await count(world, { required: [other] })).toBe(0);
        await world.dispose();
    });

    it("despawns by rows an archetype a command before it names an entity of, or where rows' values decide", async () => {
        const { world, run } = withCommands();
        const entities: Entity[] = [];
        await run(commands => { for (let i = 0; i < 6; i++) entities.push(commands.spawn([doomed, amount])({ [amount]: i })); });
        await run(commands => {
            commands.add(entities[0], amount, 10);
            commands.despawnWhere({ with: [doomed], where: { [amount]: { "<": 3 } } });
        });
        expect(await aliveEach(world, entities)).toEqual([true, false, false, true, true, true]);
        await run(commands => {
            commands.add(entities[3], amount, 30);
            commands.despawnWhere({ with: [doomed] });
        });
        expect(await aliveEach(world, entities)).toEqual(entities.map(() => false));
        await world.dispose();
    });

    it("empties the archetypes of the shared values where names, letting go of their rows' objects", async () => {
        const { world, run } = withCommands();
        const inZone: Entity[] = [];
        const outside: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 4; i++) inZone.push(commands.spawn([doomed, item, zone], { [zone]: 1 })({ [item]: { label: `in${i}` } }));
            for (let i = 0; i < 4; i++) outside.push(commands.spawn([doomed, item, zone], { [zone]: 2 })({ [item]: { label: `out${i}` } }));
        });
        await run(commands => commands.despawnWhere({ with: [doomed], where: { [zone]: { "<": 2 } } }));
        expect([await aliveEach(world, inZone), await aliveEach(world, outside)]).toEqual([inZone.map(() => false), outside.map(() => true)]);
        expect(await read(world, outside[3], item)).toEqual({ label: "out3" });
        await world.dispose();
    });
});
