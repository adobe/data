// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Rule } from "../../interface/rule/rule.js";
import type { Commands } from "../../interface/system/commands.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { Observe } from "../../observe/index.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";
import { count, read, readResource } from "./reads.test-helper.js";

const mark = Symbol("despawnWhereTest/mark");
const kept = Symbol("despawnWhereTest/kept");
const value = Symbol("despawnWhereTest/value");
const extra = Symbol("despawnWhereTest/extra");
const host = Symbol("despawnWhereTest/host");
const derivedFrom = Symbol("despawnWhereTest/derivedFrom");
const slot = Symbol("despawnWhereTest/slot");
const parent = Symbol("despawnWhereTest/parent");
const finalized = Symbol("despawnWhereTest/finalized");
const watched = Symbol("despawnWhereTest/watched");
const trigger = Symbol("despawnWhereTest/trigger");
const level = Symbol("despawnWhereTest/level");
const journal = Symbol("despawnWhereTest/journal");
const chunk = Symbol("despawnWhereTest/chunk");
// Never declared, so never registered.
const unregistered = Symbol("despawnWhereTest/unregistered");

declare module "@adobe/ecs" {
    export interface Components {
        [mark]: { type: true };
        [kept]: { type: true };
        [value]: { type: number };
        [extra]: { type: true };
        [host]: { type: true };
        [derivedFrom]: { type: true };
        [slot]: { type: number; derived: true };
        [parent]: { type: Entity; reference: "owner" };
        [finalized]: { type: number };
        [watched]: { type: number };
        [trigger]: { type: true };
        [chunk]: { type: number; shared: true };
    }
    export interface Resources {
        [level]: { type: number };
        [journal]: { type: readonly string[]; default: [] };
    }
}

Rule.create({ components: { with: [host, derivedFrom] }, derive: [slot] });

const seen: number[] = [];
Finalizer.create({ components: { with: [finalized] } }, row => { seen.push(row[finalized]); });

Finalizer.changes({ watch: [watched, mark] }, (changes, { resources }) => {
    const lines = changes.groups.map(group => `${group.entities.map(entity => changes.previous(entity, watched)).join(",")}: +${group.added.length} -${group.removed.length}`);
    resources[journal] = [...resources[journal], ...lines];
});

/** A world, and a function running `body` once in a system with the world's commands, rejecting with what it threw. */
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
    (await Observe.toPromise(Observe.entity(world, entity, { optional: [mark] }))) !== null;

const aliveEach = (world: World, entities: readonly Entity[]): Promise<boolean[]> => Promise.all(entities.map(entity => alive(world, entity)));

describe("despawnWhere", () => {
    it("despawns every entity with each `with` component and no `not` one, across archetypes", async () => {
        const { world, run } = withCommands();
        const spawned: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 3; i++) {
                spawned.push(commands.spawn([mark])());
                spawned.push(commands.spawn([mark, value])({ [value]: i }));
                spawned.push(commands.spawn([mark, value, extra])({ [value]: i }));
                spawned.push(commands.spawn([value])({ [value]: i }));
                spawned.push(commands.spawn([mark, kept])());
            }
        });
        await run(commands => commands.despawnWhere({ with: [mark], not: [kept] }));
        expect(await aliveEach(world, spawned)).toEqual([0, 1, 2].flatMap(() => [false, false, false, true, true]));
        await run(commands => commands.despawnWhere({ with: [value, mark] }));
        expect(await count(world, { required: [value] })).toBe(3);
        await world.dispose();
    });

    it("selects by the commands issued before it at the sync point; later ones to a despawned entity do nothing", async () => {
        const { world, run } = withCommands();
        let gains = Entity.none, loses = Entity.none, gainsAfter = Entity.none, changedAfter = Entity.none;
        await run(commands => {
            gains = commands.spawn([value])({ [value]: 1 });
            loses = commands.spawn([mark, value])({ [value]: 2 });
            gainsAfter = commands.spawn([value])({ [value]: 3 });
            changedAfter = commands.spawn([mark, value])({ [value]: 4 });
        });
        await run(commands => {
            commands.add(gains, mark);
            commands.remove(loses, mark);
            commands.despawnWhere({ with: [mark] });
            commands.add(gainsAfter, mark);
            commands.add(changedAfter, extra);
        });
        expect(await aliveEach(world, [gains, loses, gainsAfter, changedAfter])).toEqual([false, true, true, false]);
        expect(await read(world, gainsAfter, mark)).toBe(true);
        await world.dispose();
    });

    it("keeps what the same sync point spawns, whenever spawned and whatever earlier commands give it", async () => {
        const { world, run } = withCommands();
        let alive = Entity.none;
        await run(commands => { alive = commands.spawn([mark, value])({ [value]: 0 }); });
        const spawned: Entity[] = [];
        await run(commands => {
            spawned.push(commands.spawn([mark, value])({ [value]: 1 }));
            const tagged = commands.spawn([value])({ [value]: 2 });
            commands.add(tagged, mark);
            spawned.push(tagged);
            commands.despawnWhere({ with: [mark] });
            spawned.push(commands.spawn([mark, value])({ [value]: 3 }));
        });
        expect([await aliveEach(world, [alive]), await aliveEach(world, spawned)]).toEqual([[false], [true, true, true]]);
        await world.dispose();
    });

    it("clears the events a frame made before, keeping those it makes, in one system", async () => {
        const { world, run } = withCommands();
        let first = Entity.none, second = Entity.none;
        await run(commands => {
            commands.despawnWhere({ with: [mark] });
            first = commands.spawn([mark, value])({ [value]: 1 });
        });
        expect(await aliveEach(world, [first])).toEqual([true]);
        await run(commands => {
            commands.despawnWhere({ with: [mark] });
            second = commands.spawn([mark, value])({ [value]: 2 });
        });
        expect(await aliveEach(world, [first, second])).toEqual([false, true]);
        await world.dispose();
    });

    it("matches derived components, by where earlier commands leave an entity once derived", async () => {
        const { world, run } = withCommands();
        let derived = Entity.none, deriving = Entity.none, underived = Entity.none;
        await run(commands => {
            derived = commands.spawn([host, derivedFrom])();
            deriving = commands.spawn([host])();
            underived = commands.spawn([host, derivedFrom])();
        });
        expect(await read(world, derived, slot)).not.toBeNull();
        await run(commands => {
            commands.add(deriving, derivedFrom);
            commands.remove(underived, derivedFrom);
            commands.despawnWhere({ with: [slot] });
        });
        expect(await aliveEach(world, [derived, deriving, underived])).toEqual([false, false, true]);
        await world.dispose();
    });

    it("runs finalizers for each entity it despawns, reading its values", async () => {
        const { world, run } = withCommands();
        seen.length = 0;
        await run(commands => {
            for (let i = 0; i < 4; i++) commands.spawn(i % 2 === 0 ? [finalized, mark] : [finalized])({ [finalized]: i });
        });
        await run(commands => commands.despawnWhere({ with: [mark, finalized] }));
        expect(seen.sort()).toEqual([0, 2]);
        await world.dispose();
        seen.length = 0;
    });

    it("gives a changes finalizer the same changes as a despawn of each", async () => {
        const journals: (readonly string[])[] = [];
        for (const despawn of [
            (commands: Commands, entities: readonly Entity[]) => { for (const entity of entities) commands.despawn(entity); },
            (commands: Commands) => commands.despawnWhere({ with: [mark] }),
        ]) {
            const { world, run } = withCommands();
            const entities: Entity[] = [];
            await run(commands => {
                for (let i = 0; i < 3; i++) entities.push(commands.spawn([watched, mark])({ [watched]: i }));
                entities.push(commands.spawn([watched, mark, extra])({ [watched]: 9 }));
                commands.spawn([watched])({ [watched]: 5 });
            });
            await run(commands => despawn(commands, entities));
            journals.push(await readResource(world, journal));
            await world.dispose();
        }
        expect(journals[1]).toEqual(journals[0]);
        expect(journals[1]).toContain("0,1,2: +0 -2");
    });

    it("cascades owner references as a despawn does", async () => {
        const { world, run } = withCommands();
        let root = Entity.none, child = Entity.none, other = Entity.none;
        await run(commands => {
            root = commands.spawn([mark])();
            child = commands.spawn([parent, value])({ [parent]: root, [value]: 1 });
            other = commands.spawn([value])({ [value]: 2 });
        });
        await run(commands => commands.despawnWhere({ with: [mark] }));
        expect(await aliveEach(world, [root, child, other])).toEqual([false, false, true]);
        await world.dispose();
    });

    it("never despawns the resource entity", async () => {
        const { world, run } = withCommands();
        const set = System.create({}, ({ resources, commands }) => {
            resources[level] = 3;
            commands.spawn([mark])();
            commands.despawnWhere({ with: [mark] });
        });
        await world.run(set);
        await run(commands => commands.despawnWhere({ with: [mark] }));
        expect(await readResource(world, level)).toBe(3);
        expect(await count(world, { required: [mark] })).toBe(0);
        await world.dispose();
    });

    it("throws in the issuing system, queuing nothing, for an empty `with` or a key that isn't a component", async () => {
        const { world, run } = withCommands();
        let entity = Entity.none;
        await run(commands => { entity = commands.spawn([mark])(); });
        // @ts-expect-error `with` names at least one component
        await expect(run(commands => commands.despawnWhere({ with: [] }))).rejects.toThrow("names at least one component");
        // @ts-expect-error never registered
        await expect(run(commands => commands.despawnWhere({ with: [mark], not: [unregistered] }))).rejects.toThrow("no registered schema");
        // @ts-expect-error a resource
        await expect(run(commands => commands.despawnWhere({ with: [level] }))).rejects.toThrow("is a resource");
        expect(await alive(world, entity)).toBe(true);
        await world.dispose();
    });

    it("runs in a system over rows, which isn't a kernel", async () => {
        const { world, run } = withCommands();
        const clear = System.create({ components: { with: [trigger] } }, (_row, { commands }) => {
            commands.despawnWhere({ with: [mark] });
        });
        await run(commands => {
            for (let i = 0; i < 5; i++) commands.spawn([mark, value])({ [value]: i });
            commands.spawn([trigger])();
            commands.spawn([trigger])();
        });
        const { failures } = await runReported(world, clear);
        expect(failures).toEqual([]);
        expect(await count(world, { required: [mark] })).toBe(0);
        expect(await count(world, { required: [trigger] })).toBe(2);
        await world.dispose();
    });

    it("keeps to the archetypes holding where's shared values, each required as with requires it", async () => {
        const { world, run } = withCommands();
        const spawned: Entity[] = [];
        await run(commands => {
            spawned.push(commands.spawn([mark, chunk], { [chunk]: 1 })());
            spawned.push(commands.spawn([mark, value, chunk], { [chunk]: 1 })({ [value]: 1 }));
            spawned.push(commands.spawn([mark, chunk], { [chunk]: 2 })());
            spawned.push(commands.spawn([mark])());
            spawned.push(commands.spawn([value, chunk], { [chunk]: 1 })({ [value]: 2 }));
        });
        await run(commands => commands.despawnWhere({ with: [mark], where: { [chunk]: 1 } }));
        expect(await aliveEach(world, spawned)).toEqual([false, false, true, true, true]);
        await world.dispose();
    });

    it("despawns by where what was alive before the sync point, keeping what it spawns, and none for a value no archetype holds", async () => {
        const { world, run } = withCommands();
        const spawned: Entity[] = [];
        await run(commands => {
            spawned.push(commands.spawn([mark, chunk], { [chunk]: 1 })());
            spawned.push(commands.spawn([mark, chunk], { [chunk]: 2 })());
        });
        await run(commands => {
            spawned.push(commands.spawn([mark, chunk], { [chunk]: 1 })());
            commands.despawnWhere({ with: [mark], where: { [chunk]: 1 } });
            commands.despawnWhere({ with: [mark], where: { [chunk]: 3 } });
        });
        expect(await aliveEach(world, spawned)).toEqual([false, true, true]);
        await run(commands => commands.despawnWhere({ with: [mark], where: {} }));
        expect(await aliveEach(world, spawned)).toEqual([false, false, false]);
        await world.dispose();
    });

    it("throws for a where that isn't values of shared components, queuing nothing", async () => {
        const { world, run } = withCommands();
        let entity = Entity.none;
        await run(commands => { entity = commands.spawn([mark, chunk], { [chunk]: 1 })(); });
        // @ts-expect-error where names only shared components
        await expect(run(commands => commands.despawnWhere({ with: [mark], where: { [value]: 1 } }))).rejects.toThrow(/where names "despawnWhereTest\/value", which isn't a shared component/);
        // @ts-expect-error where takes values, not predicates
        await expect(run(commands => commands.despawnWhere({ with: [mark], where: { [chunk]: (given: number) => given === 1 } }))).rejects.toThrow(/gives "despawnWhereTest\/chunk" a predicate/);
        // @ts-expect-error a value of the component's type
        await expect(run(commands => commands.despawnWhere({ with: [mark], where: { [chunk]: "1" } }))).rejects.toThrow(/isn't one of its type's values/);
        expect(await alive(world, entity)).toBe(true);
        await world.dispose();
    });
});
