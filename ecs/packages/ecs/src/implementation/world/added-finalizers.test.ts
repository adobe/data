// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { read } from "./reads.test-helper.js";
import { workers } from "../../interface/resources/workers.js";

const held = Symbol("addedFinalizersTest/held");
const other = Symbol("addedFinalizersTest/other");
const total = Symbol("addedFinalizersTest/total");

declare module "@adobe/ecs" {
    export interface Components {
        [held]: { type: number };
        [other]: { type: number };
    }
    export interface Resources {
        [total]: { type: number };
    }
}

let steps: ((commands: System.Commands) => void)[] = [];
const edit = System.create({}, ({ commands }, input: { readonly step: number }) => {
    steps[input.step]?.(commands);
});
const step = (world: ReturnType<typeof createWorld>) => (run: (commands: System.Commands) => void) => {
    steps = [...steps, run];
    return world.run(edit, { step: steps.length - 1 });
};

/** A world with entities holding `held` values 1, 2 and 3. */
const withHeld = async () => {
    const world = createWorld({ [workers]: 0 });
    const entities: Entity[] = [];
    await step(world)(commands => { for (const value of [1, 2, 3]) entities.push(commands.spawn([held])({ [held]: value })); });
    return { world, entities };
};

describe("changes and removed systems", () => {
    it("aren't run, alone or within a composite, by untyped callers either", async () => {
        const world = createWorld({ [workers]: 0 });
        const release = System.removed({ components: { with: [held] } }, () => {});
        const watch = System.changes({ watch: [held] }, () => {});
        const tick = System.create({}, () => {});
        const run = (system: object): Promise<unknown> => Reflect.apply(world.run, world, [system]);
        await expect(run(release)).rejects.toThrow(`is a changes or removed system, which runs in sync points while it's added; add it to the world rather than run it.`);
        await expect(run(watch)).rejects.toThrow("is a changes or removed system");
        await expect(run(System.create([tick, release]))).rejects.toThrow(`holds "release", a changes or removed system, which runs in sync points while it's added; add the composite to the world rather than run it.`);
        await expect(run(System.create([System.create([watch]), tick]))).rejects.toThrow(`holds "watch"`);
        await world.dispose();
    });

    it("run only while added, from the next sync point on", async () => {
        const { world, entities } = await withHeld();
        const seen: number[] = [];
        const changed: number[] = [];
        const release = System.removed({ components: { with: [held] } }, row => { seen.push(row[held]); });
        const watch = System.changes({ watch: [held] }, changes => { for (const group of changes.groups) changed.push(group.entities.length); });
        await step(world)(commands => commands.despawn(entities[0]));
        expect([seen, changed]).toEqual([[], []]);
        world.add(release);
        world.add(watch);
        // Added late, a removed system still runs for entities that matched before it was.
        await step(world)(commands => commands.despawn(entities[1]));
        expect([seen, changed]).toEqual([[2], [1]]);
        world.remove(watch);
        await step(world)(commands => commands.spawn([held])({ [held]: 4 }));
        expect(changed).toEqual([1]);
        await world.dispose();
    });

    it("don't make a world tick", async () => {
        let ticks = 0;
        const frames: (() => void)[] = [];
        const world = createWorld({ [workers]: 0 }, { loop: { frame: callback => { frames.push(() => callback(0)); ticks++; return () => {}; } } });
        world.add(System.removed({ components: { with: [held] } }, () => {}));
        world.add(System.changes({ watch: [held] }, () => {}));
        await step(world)(() => {});
        expect(ticks).toBe(0);
        await world.dispose();
    });

    it("run, removed, for every entity they still match, and a composite pairing a release with what creates it releases on removal", async () => {
        const { world } = await withHeld();
        const seen: number[] = [];
        const release = System.removed({ components: { with: [held] } }, row => { seen.push(row[held]); });
        const create = System.create({}, () => {});
        const paired = System.create([create, release]);
        world.add(paired);
        await step(world)(() => {});
        world.remove(paired);
        await step(world)(() => {});
        expect(seen.sort()).toEqual([1, 2, 3]);
        // Removed, it never runs again, nor at disposal.
        await world.dispose();
        expect(seen).toHaveLength(3);
    });

    it("issue commands as they're removed, which apply at the next sync point", async () => {
        const { world, entities } = await withHeld();
        const release = System.removed({ components: { with: [held] } }, (row, { commands }) => { commands.add(row.entity, other, row[held]); });
        world.add(release);
        await step(world)(() => {});
        world.remove(release);
        await step(world)(() => {});
        expect(await read(world, entities[2], other)).toBe(3);
        await world.dispose();
    });

    it("added twice, alone and within a composite, run once and stay until both are removed", async () => {
        const { world, entities } = await withHeld();
        const seen: number[] = [];
        const release = System.removed({ components: { with: [held] } }, row => { seen.push(row[held]); });
        const composite = System.create([System.create({}, () => {}), release]);
        world.add(release);
        world.add(composite);
        world.add(release);
        await step(world)(commands => commands.despawn(entities[0]));
        expect(seen).toEqual([1]);
        world.remove(composite);
        await step(world)(commands => commands.despawn(entities[1]));
        expect(seen).toEqual([1, 2]);
        world.remove(release);
        await step(world)(() => {});
        expect(seen).toEqual([1, 2, 3]);
        await world.dispose();
    });

    it("run in the order added, but for before and after", async () => {
        const { world, entities } = await withHeld();
        const order: string[] = [];
        const first = System.removed({ components: { with: [held] } }, () => { order.push("first"); });
        const second = System.removed({ components: { with: [held] } }, () => { order.push("second"); });
        const third = System.changes({ watch: [held], before: [second] }, () => { order.push("third"); });
        world.add(second);
        world.add(first);
        world.add(third);
        await step(world)(commands => commands.despawn(entities[0]));
        // "second" waits for "third", which must run before it; "first" was added before "third".
        expect(order).toEqual(["first", "third", "second"]);
        order.length = 0;
        world.remove(second);
        world.add(second);
        await step(world)(commands => commands.despawn(entities[1]));
        expect(order).toEqual(["first", "third", "second"]);
        await world.dispose();
    });

    it("conflict once added together: two writing a resource unordered, or ordered in a cycle, throw at add, adding nothing", async () => {
        const world = createWorld({ [workers]: 0 });
        const writeA = System.removed({ components: { with: [held] } }, (_, { resources }) => { resources[total] = 1; });
        const writeB = System.changes({ watch: [held] }, (_, { resources }) => { resources[total] = 2; });
        world.add(writeA);
        expect(() => world.add(writeB)).toThrow(`Systems "writeA" and "writeB" both access "addedFinalizersTest/total", one writing it; order them with before or after.`);
        expect(() => world.add(System.create([System.create({}, () => {}), writeB]))).toThrow("both access");
        const late: System<never>[] = [];
        const early = System.removed({ components: { with: [held] }, before: late }, () => {});
        late.push(System.removed({ components: { with: [held] }, before: [early] }, () => {}));
        expect(() => world.add(System.create([early, ...late]))).toThrow("are ordered in a cycle");
        world.remove(writeA);
        world.add(writeB);
        await world.dispose();
    });
});
