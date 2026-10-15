import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { Rule } from "../../rule/rule.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const source = "rulesTest/source";
const hidden = "rulesTest/hidden";
const sprite = "rulesTest/sprite";
const slot = "rulesTest/slot";
const visible = "rulesTest/visible";
const ready = "rulesTest/ready";
const glow = "rulesTest/glow";
const owned = "rulesTest/owned";
const follows = "rulesTest/follows";
const mark = "rulesTest/mark";
const left = "rulesTest/left";
const right = "rulesTest/right";
const late = "rulesTest/late";
const tagged = "rulesTest/tagged";
const tag = "rulesTest/tag";

declare module "@adobe/data-ecs" {
    export interface Components {
        [source]: { type: number };
        [hidden]: { type: true };
        [sprite]: { type: true };
        [slot]: { type: number; derived: true };
        [visible]: { type: true; derived: true };
        [ready]: { type: number; within: typeof slot };
        [glow]: { type: true; within: typeof ready };
        [owned]: { type: Entity; reference: "owner" };
        [follows]: { type: Entity; reference: "weak" };
        [mark]: { type: number };
        [left]: { type: true; within: typeof right };
        [right]: { type: true; within: typeof left };
        [late]: { type: true; derived: true };
        [tagged]: { type: true };
        [tag]: { type: true; derived: true };
    }
}

Component.register(source, { type: { type: "number" } });
Component.register(hidden, { type: { const: true } });
Component.register(sprite, { type: { const: true } });
Component.register(slot, { type: { type: "number", default: 7 }, derived: true });
Component.register(visible, { type: { const: true }, derived: true });
Component.register(ready, { type: { type: "number" }, within: slot });
Component.register(glow, { type: { const: true }, within: ready });
Component.register(owned, { type: Entity.schema, reference: "owner" });
Component.register(follows, { type: Entity.schema, reference: "weak" });
Component.register(mark, { type: { type: "number" } });
Component.register(left, { type: { const: true }, within: right });
Component.register(right, { type: { const: true }, within: left });
Component.register(late, { type: { const: true }, derived: true });
Component.register(tagged, { type: { const: true } });
Component.register(tag, { type: { const: true }, derived: true });

Rule.create({ name: "rulesTest/slots", components: { has: [source], not: [hidden] }, derive: [slot] });
Rule.create({ name: "rulesTest/visible", components: { has: [slot] }, derive: [visible] });
Rule.create({ name: "rulesTest/sprites", components: { has: [sprite] }, derive: [visible] });
Rule.create({ name: "rulesTest/tag", components: { has: [tagged] }, derive: [tag] });

/** Runs `edit` with commands once, as its own run. */
const edit = System.create({ name: "rulesTest/edit", input: { type: "integer" } }, ({ input, commands }) => {
    for (const step of steps[input] ?? []) step(commands);
});
let steps: ((commands: System.Commands) => void)[][] = [];
const at = (world: ReturnType<typeof createWorld>) => async (...run: ((commands: System.Commands) => void)[]) => {
    steps = [...steps, run];
    await world.run(edit, steps.length - 1);
};

const all: readonly Component.Name[] = [source, hidden, sprite, slot, visible, ready, glow, owned, follows, mark];
const components = (world: ReturnType<typeof createWorld>, entity: Entity) => all.filter(key => world.read.component(entity, key) !== null);

describe("rules", () => {
    it("derive components where they match, from the schema default, and remove them where they stop", async () => {
        const world = createWorld({ workers: 0 });
        const step = at(world);
        let a = Entity.none, b = Entity.none, c = Entity.none;
        await step(commands => {
            a = commands.spawn({ [source]: 1 });
            b = commands.spawn({ [source]: 2, [hidden]: true });
            c = commands.spawn({ [sprite]: true });
        });
        expect(components(world, a)).toEqual([source, slot, visible]);
        expect(world.read.component(a, slot)).toBe(7);
        expect(components(world, b)).toEqual([source, hidden]);
        expect(components(world, c)).toEqual([sprite, visible]);
        await step(commands => { commands.add(a, { [hidden]: true }); commands.remove(b, hidden); commands.remove(c, sprite); });
        expect(components(world, a)).toEqual([source, hidden]);
        expect(components(world, b)).toEqual([source, slot, visible]);
        expect(components(world, c)).toEqual([]);
        await world.dispose();
    });

    it("write the default again where a derived component starts over, on a reused row", async () => {
        const write = System.create({ name: "rulesTest/write", components: { write: [slot] } }, row => { row[slot] = 99; });
        const world = createWorld({ workers: 0 });
        const step = at(world);
        let a = Entity.none;
        await step(commands => { a = commands.spawn({ [source]: 1 }); commands.spawn({ [source]: 2 }); });
        await world.run(write);
        expect(world.read.component(a, slot)).toBe(99);
        await step(commands => commands.add(a, { [hidden]: true }));
        await step(commands => commands.remove(a, hidden));
        expect(world.read.component(a, slot)).toBe(7);
        await world.dispose();
    });

    it("apply in a world from the first sync point after it meets their components, deriving on the first spawn", async () => {
        const spawn = System.create({ name: "rulesTest/tagged" }, ({ commands }) => { commands.spawn({ [tagged]: true }); });
        const world = createWorld({ workers: 0 });
        await world.run(edit, -1);
        expect(world.query.count([tag])).toBe(0);
        await world.run(spawn);
        expect(world.query.count([tagged, tag])).toBe(1);
        await world.dispose();
    });

    it("created after a world has entities they match, derive for them at the next run, and for batch spawns", async () => {
        let added = 0;
        const observe = System.create({ name: "rulesTest/added", components: { added: [late] } }, () => { added++; });
        const spawn = System.create({ name: "rulesTest/spawn" }, ({ commands }) => { for (let i = 0; i < 3; i++) commands.spawn({ [mark]: i }); });
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        await world.run(observe);
        expect(world.query.count([late])).toBe(0);
        Rule.create({ name: "rulesTest/late", components: { has: [mark] }, derive: [late] });
        await world.run(spawn);
        expect(world.query.count([late])).toBe(6);
        await world.run(observe);
        expect(added).toBe(6);
        await world.dispose();
    });

    it("are rejected when they can't hold", async () => {
        // @ts-expect-error a rule derives only derived components
        expect(() => Rule.create({ name: "rulesTest/bad", components: { has: [source] }, derive: [mark] })).toThrow(`derives "${mark}", which isn't declared derived`);
        expect(() => Rule.create({ name: "rulesTest/bad", components: { has: [source], not: [visible] }, derive: [slot] })).toThrow("cycle through a negation, which could oscillate");
        // A rejected rule records nothing, so its name is still free; a taken one isn't.
        expect(() => Rule.create({ name: "rulesTest/bad", components: { has: [tagged] }, derive: [late] })).not.toThrow();
        expect(() => System.create({ name: "rulesTest/visible" }, () => {})).toThrow('A different system, rule or finalizer named "rulesTest/visible"');
        const world = createWorld({ workers: 0 });
        // @ts-expect-error a reference changes only through commands
        const writes = System.create({ name: "rulesTest/writeReference", components: { write: [owned] } }, row => { row[owned] = Entity.none; });
        await expect(world.run(writes)).rejects.toThrow("a reference, which changes only through commands");
        const cycle = System.create({ name: "rulesTest/cycle", components: { has: [left] } }, () => {});
        await expect(world.run(cycle)).rejects.toThrow("within each other in a cycle: rulesTest/left, rulesTest/right");
        await world.dispose();
    });
});

describe("within", () => {
    it("removes a dependent with its host, by any cause, transitively, and in command order", async () => {
        const world = createWorld({ workers: 0 });
        const step = at(world);
        let a = Entity.none, b = Entity.none, c = Entity.none;
        await step(commands => {
            a = commands.spawn({ [source]: 1, [ready]: 1, [glow]: true });
            b = commands.spawn({ [source]: 2, [ready]: 2 });
            c = commands.spawn({ [mark]: 3, [ready]: 3 });
        });
        expect(components(world, a)).toEqual([source, slot, visible, ready, glow]);
        // Dropped: c has no slot, so its ready can't be.
        expect(components(world, c)).toEqual([mark]);
        await step(commands => commands.add(a, { [hidden]: true }));
        expect(components(world, a)).toEqual([source, hidden]);
        // Removing a host and adding it back still ends its dependent, as each removal does; a derived host that a
        // rule keeps never leaves, so its dependent stays.
        await step(commands => { commands.add(b, { [glow]: true }); });
        await step(commands => { commands.remove(b, ready); commands.add(b, { [ready]: 5 }); commands.remove(b, source); commands.add(b, { [source]: 5 }); });
        expect(components(world, b)).toEqual([source, slot, visible, ready]);
        await world.dispose();
    });
});

describe("references", () => {
    it("despawn owned holders and drop weak references when their target despawns, transitively", async () => {
        const world = createWorld({ workers: 0 });
        const step = at(world);
        let root = Entity.none, child = Entity.none, grandchild = Entity.none, watcher = Entity.none, other = Entity.none, moved = Entity.none;
        await step(commands => {
            root = commands.spawn({ [mark]: 0 });
            child = commands.spawn({ [mark]: 1, [owned]: root });
            grandchild = commands.spawn({ [mark]: 2, [owned]: child });
            watcher = commands.spawn({ [mark]: 3, [follows]: grandchild });
            other = commands.spawn({ [mark]: 4 });
            moved = commands.spawn({ [mark]: 5, [owned]: root });
        });
        await step(commands => { commands.add(moved, { [owned]: other }); commands.despawn(root); });
        expect(world.read.component(child, mark)).toBeNull();
        expect(world.read.component(grandchild, mark)).toBeNull();
        expect(components(world, watcher)).toEqual([mark]);
        // Pointed elsewhere in the same sync point, so it stays.
        expect(world.read.component(moved, owned)).toBe(other);
        await world.dispose();
    });

    it("leave references to Entity.none alone, since they name no entity", async () => {
        const world = createWorld({ workers: 0 });
        const step = at(world);
        let holder = Entity.none, cleared = Entity.none;
        await step(commands => {
            holder = commands.spawn({ [mark]: 1, [owned]: Entity.none, [follows]: Entity.none });
            cleared = commands.spawn({ [mark]: 2, [follows]: holder });
        });
        await step(commands => commands.add(cleared, { [follows]: Entity.none }));
        expect(world.read.component(holder, owned)).toBe(Entity.none);
        expect(world.read.component(holder, follows)).toBe(Entity.none);
        expect(world.read.component(cleared, follows)).toBe(Entity.none);
        await world.dispose();
    });

    it("cascade at once for a reference to an entity that won't be alive, but not to one spawned with it", async () => {
        const world = createWorld({ workers: 0 });
        const step = at(world);
        let gone = Entity.none, parent = Entity.none, child = Entity.none, orphan = Entity.none, weakly = Entity.none;
        await step(commands => { gone = commands.spawn({ [mark]: 0 }); });
        await step(commands => {
            commands.despawn(gone);
            parent = commands.spawn({ [mark]: 1 });
            child = commands.spawn({ [mark]: 2, [owned]: parent });
            orphan = commands.spawn({ [mark]: 3, [owned]: gone });
            weakly = commands.spawn({ [mark]: 4, [follows]: gone });
        });
        expect(world.read.component(child, owned)).toBe(parent);
        expect(world.read.component(orphan, mark)).toBeNull();
        expect(components(world, weakly)).toEqual([mark]);
        await world.dispose();
    });
});
