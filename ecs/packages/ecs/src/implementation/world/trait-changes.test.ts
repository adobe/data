// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, join } from "./create.js";

// Readonly systems filtering on a trait's changes: run once something declaring it changed, on any thread.

const saved = Symbol("traitChangesTest/saved");
const size = Symbol("traitChangesTest/size");
const tint = Symbol("traitChangesTest/tint");
const other = Symbol("traitChangesTest/other");
const title = Symbol("traitChangesTest/title");
const view = Symbol("traitChangesTest/view");
declare module "@adobe/ecs" {
    export interface Threads {
        traitChangesTest: true;
    }
    export interface Traits<N> {
        readonly [saved]: N extends unknown ? true : never;
    }
    export interface Components {
        [size]: { type: number; [saved]: true };
        [tint]: { type: number; [saved]: true };
        [other]: { type: number };
    }
    export interface Resources {
        [title]: { type: string; default: ""; [saved]: true };
        [view]: { type: { readonly zoom: number } | null; default: null; thread: "traitChangesTest"; [saved]: true };
    }
}

const ran = { count: 0 };
const notice = System.create({ readonly: true, changed: [saved] }, () => { ran.count++; });

const input: { entity: Entity } = { entity: Entity.none };
const spawnSized = System.create(({ commands }) => { input.entity = commands.spawn([size, other])({ [size]: 1, [other]: 1 }); });
const writeOther = System.create({ components: { with: [other] } }, row => { row[other] = row[other] + 1; });
const writeSize = System.create({ components: { with: [size] } }, row => { row[size] = row[size] + 1; });
const addTint = System.create(({ commands }) => { commands.add(input.entity, tint, 3); });
const removeTint = System.create(({ commands }) => { commands.remove(input.entity, tint); });
const despawn = System.create(({ commands }) => { commands.despawn(input.entity); });
const retitle = System.create({}, ({ resources }) => { resources[title] = `${resources[title]}!`; });
const setView = System.create(({ commands }) => { commands.spawnTables([], { resources: { [view]: { zoom: 2 } } }); });
const idle = System.create({}, () => {});
/** Writes only its own thread's object, so it runs there as a tail, after the sync point. */
const zoomIn = System.create({}, ({ resources }) => { resources[view] = { zoom: (resources[view]?.zoom ?? 1) * 2 }; });

/** How many times the notice ran over a run of `system`. */
const runsOver = async (world: { run: (system: System<undefined>) => Promise<unknown> }, system: System<undefined>): Promise<number> => {
    const before = ran.count;
    await world.run(system);
    return ran.count - before;
};

describe("a readonly system filtering on a trait's changes", () => {
    it("runs once a component or resource declaring the trait was written, added, removed, spawned or despawned", async () => {
        await using world = createWorld({ [workers]: 0 });
        world.add(notice);
        await world.run(spawnSized);
        await world.run(idle);
        expect(await runsOver(world, idle)).toBe(0);
        expect(await runsOver(world, writeOther)).toBe(0);
        expect(await runsOver(world, writeSize)).toBe(1);
        expect(await runsOver(world, addTint)).toBe(1);
        expect(await runsOver(world, idle)).toBe(0);
        expect(await runsOver(world, removeTint)).toBe(1);
        expect(await runsOver(world, retitle)).toBe(1);
        expect(await runsOver(world, despawn)).toBe(1);
        expect(await runsOver(world, idle)).toBe(0);
    });
    it("runs once a resource declaring the trait that a joined thread fills was given a value", async () => {
        await using world = createWorld({ [workers]: 0 });
        const channel = new MessageChannel();
        const shared = world.share(channel.port1);
        const remote = await join(channel.port2, { threads: ["traitChangesTest"] });
        await shared;
        world.add(notice);
        await world.run(idle);
        expect(await runsOver(world, idle)).toBe(0);
        expect(await runsOver(world, setView)).toBe(1);
        expect(await runsOver(world, idle)).toBe(0);
        // Written there by a tail, which ends after the run's readonly systems ran: a later run sees it.
        expect(await runsOver(world, zoomIn) + await runsOver(world, idle)).toBe(1);
        expect(await runsOver(world, idle)).toBe(0);
        // A joined thread's own runs where it is, which can't see a trait's keys on other threads.
        await expect(remote.run(notice)).rejects.toThrow('Observer system "notice" filters on traits\' changes, so it runs only on the world\'s thread.');
        await remote.dispose();
    });
    it("is refused naming what isn't a trait", () => {
        // @ts-expect-error a key isn't a trait
        expect(() => System.create({ readonly: true, changed: [size] }, () => {})).toThrow(/"traitChangesTest\/size", which isn't a registered trait/);
    });
});
