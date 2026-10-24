// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { count, read } from "./reads.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { registerComponent } from "../../interface/registry/declarations.js";
import { programRules } from "../../interface/registry/index.js";

const source = Symbol("rulesTest/source");
const hidden = Symbol("rulesTest/hidden");
const sprite = Symbol("rulesTest/sprite");
const slot = Symbol("rulesTest/slot");
const visible = Symbol("rulesTest/visible");
const ready = Symbol("rulesTest/ready");
const glow = Symbol("rulesTest/glow");
const owned = Symbol("rulesTest/owned");
const follows = Symbol("rulesTest/follows");
const mark = Symbol("rulesTest/mark");
// Within each other, so never declared: the second to register closes a cycle.
const left = Symbol("rulesTest/left");
const right = Symbol("rulesTest/right");
const late = Symbol("rulesTest/late");
const tagged = Symbol("rulesTest/tagged");
const tag = Symbol("rulesTest/tag");

declare module "@adobe/ecs" {
    export interface Components {
        [source]: { type: number };
        [hidden]: { type: true };
        [sprite]: { type: true };
        [slot]: { type: number; derived: true; default: 7 };
        [visible]: { type: true; derived: true };
        [ready]: { type: number; within: typeof slot };
        [glow]: { type: true; within: typeof ready };
        [owned]: { type: Entity; reference: "owner" };
        [follows]: { type: Entity; reference: "weak" };
        [mark]: { type: number };
        [late]: { type: true; derived: true };
        [tagged]: { type: true };
        [tag]: { type: true; derived: true };
    }
}


Rule.create(identify({ components: { with: [source], not: [hidden] }, derive: [slot] }, "rulesTest/rules.ts#slots"));
Rule.create({ components: { with: [slot] }, derive: [visible] });
Rule.create({ components: { with: [sprite] }, derive: [visible] });
Rule.create({ components: { with: [tagged] }, derive: [tag] });

/** Runs `edit` with commands once, as its own run. */
const edit = System.create({}, ({ commands }, input: { readonly step: number }) => {
    for (const step of steps[input.step] ?? []) step(commands);
});
let steps: ((commands: System.Commands) => void)[][] = [];
const at = (world: ReturnType<typeof createWorld>) => async (...run: ((commands: System.Commands) => void)[]) => {
    steps = [...steps, run];
    await world.run(edit, { step: steps.length - 1 });
};

const all: readonly Component.Key[] = [source, hidden, sprite, slot, visible, ready, glow, owned, follows, mark];
const components = async (world: ReturnType<typeof createWorld>, entity: Entity) => {
    const values = await Promise.all(all.map(key => read(world, entity, key)));
    return all.filter((_, i) => values[i] !== null);
};

describe("rules", () => {
    it("accept a rule declared again the same under its id, as a module evaluated again declares it, and reject a different one", () => {
        const rules = programRules().length;
        Rule.create(identify({ components: { with: [source], not: [hidden] }, derive: [slot] }, "rulesTest/rules.ts#slots"));
        expect(() => Rule.create(identify({ components: { with: [source] }, derive: [slot] }, "rulesTest/rules.ts#slots"))).toThrow("reload the page");
        expect(programRules()).toHaveLength(rules);
    });
    it("derive components where they match, from the schema default, and remove them where they stop", async () => {
        const world = createWorld({ [workers]: 0 });
        const step = at(world);
        let a = Entity.none, b = Entity.none, c = Entity.none;
        await step(commands => {
            a = commands.spawn([source])({ [source]: 1 });
            b = commands.spawn([source, hidden])({ [source]: 2, [hidden]: true });
            c = commands.spawn([sprite])({ [sprite]: true });
        });
        expect(await components(world, a)).toEqual([source, slot, visible]);
        expect(await read(world, a, slot)).toBe(7);
        expect(await components(world, b)).toEqual([source, hidden]);
        expect(await components(world, c)).toEqual([sprite, visible]);
        await step(commands => { commands.add(a, hidden, true); commands.remove(b, hidden); commands.remove(c, sprite); });
        expect(await components(world, a)).toEqual([source, hidden]);
        expect(await components(world, b)).toEqual([source, slot, visible]);
        expect(await components(world, c)).toEqual([]);
        await world.dispose();
    });

    it("write the default again where a derived component starts over, on a reused row", async () => {
        const write = System.create({ components: { with: [slot] } }, row => { row[slot] = 99; });
        const world = createWorld({ [workers]: 0 });
        const step = at(world);
        let a = Entity.none;
        await step(commands => { a = commands.spawn([source])({ [source]: 1 }); commands.spawn([source])({ [source]: 2 }); });
        await world.run(write);
        expect(await read(world, a, slot)).toBe(99);
        await step(commands => commands.add(a, hidden, true));
        await step(commands => commands.remove(a, hidden));
        expect(await read(world, a, slot)).toBe(7);
        await world.dispose();
    });

    it("apply in a world from the first sync point after it meets their components, deriving on the first spawn", async () => {
        const spawn = System.create({}, ({ commands }) => { commands.spawn([tagged])({ [tagged]: true }); });
        const world = createWorld({ [workers]: 0 });
        await world.run(edit, { step: -1 });
        expect(await count(world, { required: [tag] })).toBe(0);
        await world.run(spawn);
        expect(await count(world, { required: [tagged, tag] })).toBe(1);
        await world.dispose();
    });

    it("created after a world has entities they match, derive for them at the next run, and for batch spawns", async () => {
        let added = 0;
        const observe = System.create({ components: { added: [late] } }, () => { added++; });
        const spawn = System.create({}, ({ commands }) => { for (let i = 0; i < 3; i++) commands.spawn([mark])({ [mark]: i }); });
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(observe);
        expect(await count(world, { required: [late] })).toBe(0);
        Rule.create({ components: { with: [mark] }, derive: [late] });
        await world.run(spawn);
        expect(await count(world, { required: [late] })).toBe(6);
        await world.run(observe);
        expect(added).toBe(6);
        await world.dispose();
    });

    it("are rejected when they can't hold", async () => {
        // @ts-expect-error a rule derives only derived components
        expect(() => Rule.create({ components: { with: [source] }, derive: [mark] })).toThrow(`derives "rulesTest/mark", which isn't declared derived`);
        expect(() => Rule.create({ components: { with: [source], not: [visible] }, derive: [slot] })).toThrow("cycle through a negation, which could oscillate");
        // @ts-expect-error a reference changes only through commands
        expect(() => System.create({ components: { with: [owned] } }, row => { row[owned] = Entity.none; })).toThrow("a reference, which changes only through commands");
        // The component closing a cycle of within declarations is rejected when it's registered.
        registerComponent(left, { type: { const: true }, within: right });
        expect(() => registerComponent(right, { type: { const: true }, within: left })).toThrow(`Cannot register component "rulesTest/right": components are within each other in a cycle: rulesTest/left, rulesTest/right.`);
    });
});

describe("within", () => {
    it("removes a dependent with its host, by any cause, transitively, and in command order", async () => {
        const world = createWorld({ [workers]: 0 });
        const step = at(world);
        let a = Entity.none, b = Entity.none, c = Entity.none;
        await step(commands => {
            a = commands.spawn([source, ready, glow])({ [source]: 1, [ready]: 1, [glow]: true });
            b = commands.spawn([source, ready])({ [source]: 2, [ready]: 2 });
            c = commands.spawn([mark, ready])({ [mark]: 3, [ready]: 3 });
        });
        expect(await components(world, a)).toEqual([source, slot, visible, ready, glow]);
        // Dropped: c has no slot, so its ready can't be.
        expect(await components(world, c)).toEqual([mark]);
        await step(commands => commands.add(a, hidden, true));
        expect(await components(world, a)).toEqual([source, hidden]);
        // Removing a host and adding it back still ends its dependent, as each removal does; a derived host that a
        // rule keeps never leaves, so its dependent stays.
        await step(commands => { commands.add(b, glow, true); });
        await step(commands => { commands.remove(b, ready); commands.add(b, ready, 5); commands.remove(b, source); commands.add(b, source, 5); });
        expect(await components(world, b)).toEqual([source, slot, visible, ready]);
        await world.dispose();
    });
});

describe("references", () => {
    it("despawn owned holders and drop weak references when their target despawns, transitively", async () => {
        const world = createWorld({ [workers]: 0 });
        const step = at(world);
        let root = Entity.none, child = Entity.none, grandchild = Entity.none, watcher = Entity.none, other = Entity.none, moved = Entity.none;
        await step(commands => {
            root = commands.spawn([mark])({ [mark]: 0 });
            child = commands.spawn([mark, owned])({ [mark]: 1, [owned]: root });
            grandchild = commands.spawn([mark, owned])({ [mark]: 2, [owned]: child });
            watcher = commands.spawn([mark, follows])({ [mark]: 3, [follows]: grandchild });
            other = commands.spawn([mark])({ [mark]: 4 });
            moved = commands.spawn([mark, owned])({ [mark]: 5, [owned]: root });
        });
        await step(commands => { commands.add(moved, owned, other); commands.despawn(root); });
        expect(await read(world, child, mark)).toBeNull();
        expect(await read(world, grandchild, mark)).toBeNull();
        expect(await components(world, watcher)).toEqual([mark]);
        // Pointed elsewhere in the same sync point, so it stays.
        expect(await read(world, moved, owned)).toBe(other);
        await world.dispose();
    });

    it("leave references to Entity.none alone, since they name no entity", async () => {
        const world = createWorld({ [workers]: 0 });
        const step = at(world);
        let holder = Entity.none, cleared = Entity.none;
        await step(commands => {
            holder = commands.spawn([mark, owned, follows])({ [mark]: 1, [owned]: Entity.none, [follows]: Entity.none });
            cleared = commands.spawn([mark, follows])({ [mark]: 2, [follows]: holder });
        });
        await step(commands => commands.add(cleared, follows, Entity.none));
        expect(await read(world, holder, owned)).toBe(Entity.none);
        expect(await read(world, holder, follows)).toBe(Entity.none);
        expect(await read(world, cleared, follows)).toBe(Entity.none);
        await world.dispose();
    });

    it("cascade at once for a reference to an entity that won't be alive, but not to one spawned with it", async () => {
        const world = createWorld({ [workers]: 0 });
        const step = at(world);
        let gone = Entity.none, parent = Entity.none, child = Entity.none, orphan = Entity.none, weakly = Entity.none;
        await step(commands => { gone = commands.spawn([mark])({ [mark]: 0 }); });
        await step(commands => {
            commands.despawn(gone);
            parent = commands.spawn([mark])({ [mark]: 1 });
            child = commands.spawn([mark, owned])({ [mark]: 2, [owned]: parent });
            orphan = commands.spawn([mark, owned])({ [mark]: 3, [owned]: gone });
            weakly = commands.spawn([mark, follows])({ [mark]: 4, [follows]: gone });
        });
        expect(await read(world, child, owned)).toBe(parent);
        expect(await read(world, orphan, mark)).toBeNull();
        expect(await components(world, weakly)).toEqual([mark]);
        await world.dispose();
    });
});
