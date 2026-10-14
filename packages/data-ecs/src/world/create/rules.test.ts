import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { Rule } from "../../rule/rule.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";
import { createRegistrar } from "./register.js";
import { createState } from "./state.js";

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
    }
    export interface Rules {
        "rulesTest/slots": true;
        "rulesTest/visible": true;
        "rulesTest/sprites": true;
        "rulesTest/bad": true;
    }
    export interface Systems {
        "rulesTest/edit": true;
        "rulesTest/spawn": true;
        "rulesTest/write": true;
        "rulesTest/added": true;
        "rulesTest/visible": true;
        "rulesTest/cycle": true;
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

const slots = Rule.create({ name: "rulesTest/slots", query: { has: [source], not: [hidden] }, derives: [slot] });
const shown = Rule.create({ name: "rulesTest/visible", query: { has: [slot] }, derives: [visible] });
const sprites = Rule.create({ name: "rulesTest/sprites", query: { has: [sprite] }, derives: [visible] });

/** Runs `edit` with commands once, as its own run. */
const edit = System.create({ name: "rulesTest/edit", args: { type: "integer" } }, (_, { args }, commands) => {
    for (const step of steps[args] ?? []) step(commands);
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
        await world.systems.register(edit, slots, shown, sprites);
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
        const write = System.create({ name: "rulesTest/write", query: { write: [slot] } }, row => { row[slot] = 99; });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, slots, write);
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

    it("apply to entities that exist when they're registered, and to batch spawns", async () => {
        let added = 0;
        const observe = System.create({ name: "rulesTest/added", query: { added: [slot] } }, () => { added++; });
        const spawn = System.create({ name: "rulesTest/spawn" }, (_, __, commands) => { for (let i = 0; i < 3; i++) commands.spawn({ [source]: i }); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn, observe);
        await world.run(spawn);
        await world.run(observe);
        expect(world.query.count([slot])).toBe(0);
        await world.systems.register(slots);
        await world.run(spawn);
        expect(world.query.count([slot])).toBe(6);
        await world.run(observe);
        expect(added).toBe(6);
        await world.dispose();
    });

    it("are rejected when they can't hold", async () => {
        const world = createWorld({ workers: 0 });
        // @ts-expect-error a rule derives only derived components
        await expect(world.systems.register(Rule.create({ name: "rulesTest/bad", query: { has: [source] }, derives: [mark] }))).rejects.toThrow(`derives "${mark}", which isn't declared derived`);
        const oscillates = Rule.create({ name: "rulesTest/bad", query: { has: [source], not: [visible] }, derives: [slot] });
        await expect(world.systems.register(shown, oscillates)).rejects.toThrow("cycle through a negation, which could oscillate");
        // A failed registration records nothing, so the rest still registers.
        await world.systems.register(shown);
        await expect(world.systems.register(System.create({ name: "rulesTest/visible" }, () => {}))).rejects.toThrow('A different system, rule or finalizer named "rulesTest/visible"');
        // @ts-expect-error a reference changes only through commands
        const writes = System.create({ name: "rulesTest/write", query: { write: [owned] } }, row => { row[owned] = Entity.none; });
        await expect(world.systems.register(writes)).rejects.toThrow("a reference, which changes only through commands");
        const cycle = System.create({ name: "rulesTest/cycle", query: { has: [left] } }, () => {});
        await expect(world.systems.register(cycle)).rejects.toThrow("within each other in a cycle: rulesTest/left, rulesTest/right");
        await world.dispose();
    });
});

describe("registration", () => {
    it("rolls back only its own rules, re-deriving what they derived", () => {
        const state = createState(true);
        const registrar = createRegistrar(state);
        const first = registrar.register([slots]);
        registrar.register([sprites]);
        state.structure.rederive = false;
        first.rollback();
        expect(state.structure.rules.map(rule => rule.name)).toEqual(["rulesTest/sprites"]);
        expect(state.structure.rederive).toBe(true);
    });
});

describe("within", () => {
    it("removes a dependent with its host, by any cause, transitively, and in command order", async () => {
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, slots);
        const step = at(world);
        let a = Entity.none, b = Entity.none, c = Entity.none;
        await step(commands => {
            a = commands.spawn({ [source]: 1, [ready]: 1, [glow]: true });
            b = commands.spawn({ [source]: 2, [ready]: 2 });
            c = commands.spawn({ [mark]: 3, [ready]: 3 });
        });
        expect(components(world, a)).toEqual([source, slot, ready, glow]);
        // Dropped: c has no slot, so its ready can't be.
        expect(components(world, c)).toEqual([mark]);
        await step(commands => commands.add(a, { [hidden]: true }));
        expect(components(world, a)).toEqual([source, hidden]);
        // Removing a host and adding it back still ends its dependent, as each removal does; a derived host that a
        // rule keeps never leaves, so its dependent stays.
        await step(commands => { commands.add(b, { [glow]: true }); });
        await step(commands => { commands.remove(b, ready); commands.add(b, { [ready]: 5 }); commands.remove(b, source); commands.add(b, { [source]: 5 }); });
        expect(components(world, b)).toEqual([source, slot, ready]);
        await world.dispose();
    });
});

describe("references", () => {
    it("despawn owned holders and drop weak references when their target despawns, transitively", async () => {
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit);
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
        await world.systems.register(edit);
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
        await world.systems.register(edit);
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
