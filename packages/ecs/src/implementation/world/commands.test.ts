// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Archetype } from "../../interface/archetype/archetype.js";
import { Report } from "../../interface/report/report.js";
import { Component } from "../../interface/component/component.js";
import type { Essential } from "../../interface/component/value.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { Rule } from "../../interface/rule/rule.js";
import type { Schema } from "../../interface/schema/schema.js";
import type { Commands } from "../../interface/system/commands.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { Observe } from "../../observe/index.js";
import { count, read, readEntity, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { runReported } from "./reports.test-helper.js";

type Vec3 = readonly [number, number, number];
const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;
const position = Symbol("commandsTest/position");
const score = Symbol("commandsTest/score");
const health = Symbol("commandsTest/health");
const label = Symbol("commandsTest/label");
const tag = Symbol("commandsTest/tag");
const other = Symbol("commandsTest/other");
const slot = Symbol("commandsTest/slot");
const unregistered = Symbol("commandsTest/unregistered");
const level = Symbol("commandsTest/level");
const bit0 = Symbol("commandsTest/bit0");
const bit1 = Symbol("commandsTest/bit1");
const bit2 = Symbol("commandsTest/bit2");
const bit3 = Symbol("commandsTest/bit3");
const bits = [bit0, bit1, bit2, bit3] as const;
declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: readonly [number, number, number] };
        [score]: { type: number };
        [health]: { type: number };
        [label]: { type: string | null };
        [tag]: { type: true };
        [other]: { type: true };
        [slot]: { type: number; derived: true };
        [unregistered]: { type: number };
        [bit0]: { type: true };
        [bit1]: { type: true };
        [bit2]: { type: true };
        [bit3]: { type: true };
    }
    export interface Resources {
        [level]: { type: number };
    }
}
Component.register(position, { type: vec3 });
Component.register(score, { type: { type: "number", precision: 1 } });
Component.register(health, { type: { type: "number" } });
Component.register(label, { type: { anyOf: [{ type: "string" }, { type: "null" }] } });
Component.register(tag, { type: { const: true } });
Component.register(other, { type: { const: true } });
Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Component.register(bit0, { type: { const: true } });
Component.register(bit1, { type: { const: true } });
Component.register(bit2, { type: { const: true } });
Component.register(bit3, { type: { const: true } });
Resource.register(level, { type: { type: "number", default: 0 } });
Rule.create({ name: "commandsTest/slots", components: { has: [other, score] }, derive: [slot] });

const unit = Archetype.create([position, score, tag]);
const made = Archetype.create([score, tag]);
const marks = Archetype.create([other, label]);

/** Every component of these tests an entity has, or `null` if it is dead. */
const components = (world: World, entity: Entity) =>
    Observe.toPromise(Observe.entity(world, entity, { optional: [position, score, health, label, tag, other, slot, bit0, bit1, bit2, bit3] }));

/** Spawns and adds with literal values, which the plugin passes positionally, from one site over several lists. */
const literals: Entity[] = [];
const spawnLiterals = System.create({ name: "commandsTest/spawnLiterals" }, ({ commands }) => {
    for (let i = 0; i < 6; i++) literals.push(commands.spawn(i % 3 === 0 ? defaulted : i % 3 === 1 ? made : [score, label])({ [score]: i }));
});
const addLiterals = System.create({ name: "commandsTest/addLiterals", components: { has: [score], not: [health] } }, (row, { commands }) => {
    commands.add(row.entity, [health, label], { [label]: "x", [health]: 5 });
});

const spawnFrom = System.create({ name: "commandsTest/spawnFrom", kernel: "cpu", components: { read: [score], not: [tag, other] } }, (row, { commands }) => {
    commands.spawn(made)({ [score]: row[score] + 10 });
});
const mark = System.create({ name: "commandsTest/mark", kernel: "cpu", components: { has: [tag], not: [other] } }, (row, { commands }) => {
    commands.add(row.entity, marks, {});
});
const unmark = System.create({ name: "commandsTest/unmark", kernel: "cpu", components: { has: [other] } }, (row, { commands }) => {
    commands.remove(row.entity, marks);
});
const defaulted = Archetype.create([score, label, tag]);

/** A world, and a function running `body` once in a system with the world's commands, rejecting with what it threw. */
const withCommands = () => {
    const world = createWorld({ [workers]: 0 });
    let body: (commands: Commands) => void = () => {};
    const issue = System.create({ name: "commandsTest/issue" }, ({ commands }) => body(commands));
    const run = async (next: (commands: Commands) => void): Promise<void> => {
        body = next;
        const [failure] = (await runReported(world, issue)).failures;
        if (failure !== undefined) throw new Error(failure.message);
    };
    return { world, run };
};

describe("spawn", () => {
    it("spawns exactly the components listed, through Archetype.create, plain and inline lists", async () => {
        const { world, run } = withCommands();
        const plain: readonly Essential[] = [score, tag];
        const spawned: Entity[] = [];
        await run(commands => {
            spawned.push(commands.spawn(unit)({ [position]: [1, 2, 3], [score]: 4 }));
            spawned.push(commands.spawn(plain)({ [score]: 5 }));
            spawned.push(commands.spawn([position, score])({ [position]: [6, 6, 6], [score]: 6 }));
        });
        expect(await components(world, spawned[0])).toEqual({ [position]: [1, 2, 3], [score]: 4, [tag]: true });
        expect(await components(world, spawned[1])).toEqual({ [score]: 5, [tag]: true });
        expect(await components(world, spawned[2])).toEqual({ [position]: [6, 6, 6], [score]: 6 });
        await world.dispose();
    });
    it("starts a tag or a component whose type allows null, left out or given undefined, at true or null, never leaving it out", async () => {
        const { world, run } = withCommands();
        const spawned: Entity[] = [];
        await run(commands => {
            spawned.push(commands.spawn(defaulted)({ [score]: 1 }));
            spawned.push(commands.spawn(defaulted)({ [score]: 2, [label]: undefined, [tag]: undefined }));
            spawned.push(commands.spawn(defaulted)({ [score]: 3, [label]: "a", [tag]: true }));
        });
        expect(await Promise.all(spawned.map(entity => components(world, entity)))).toEqual([
            { [score]: 1, [label]: null, [tag]: true },
            { [score]: 2, [label]: null, [tag]: true },
            { [score]: 3, [label]: "a", [tag]: true },
        ]);
        await world.dispose();
    });
    it("reads only the listed components' values", async () => {
        const { world, run } = withCommands();
        let spawned = Entity.none;
        await run(commands => {
            spawned = Reflect.apply(commands.spawn([score]), undefined, [{ [score]: 1, [position]: [1, 1, 1], [tag]: true, "commandsTest/score": 2 }]);
        });
        expect(await components(world, spawned)).toEqual({ [score]: 1 });
        await world.dispose();
    });
    it("gives the same spawner for a world and set of components, from any system, for a new list or another order", async () => {
        const { world, run } = withCommands();
        const spawners: unknown[] = [];
        await run(commands => {
            spawners.push(commands.spawn(unit), commands.spawn(unit), commands.spawn([position, score, tag]), commands.spawn([score, tag, position]));
        });
        await run(commands => { spawners.push(commands.spawn(unit)); });
        expect(spawners[1]).toBe(spawners[0]);
        expect(spawners[2]).toBe(spawners[0]);
        expect(spawners[4]).toBe(spawners[0]);
        // A list in another order names the same components.
        expect(spawners[3]).toBe(spawners[0]);
        const another = withCommands();
        await another.run(commands => { spawners.push(commands.spawn(unit)); });
        expect(spawners[5]).not.toBe(spawners[0]);
        await Promise.all([world.dispose(), another.world.dispose()]);
    });
    it("spawns into more archetypes than spawns cache, each with its values", async () => {
        const { world, run } = withCommands();
        const lists = Array.from({ length: 16 }, (_, set): (typeof score | (typeof bits)[number])[] => [score, ...bits.filter((_, bit) => (set & (1 << bit)) !== 0)]);
        const archetypes = lists.map(list => Archetype.create([...list]));
        const spawned: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 64; i++) spawned.push(commands.spawn(i % 2 === 0 ? archetypes[i % 16] : [...lists[i % 16]])({ [score]: i }));
        });
        for (let i = 0; i < 64; i++) {
            expect(Object.getOwnPropertySymbols(await components(world, spawned[i])).length).toBe(1 + bits.filter((_, bit) => ((i % 16) & (1 << bit)) !== 0).length);
            expect(await read(world, spawned[i], score)).toBe(i);
        }
        await world.dispose();
    });
    it("throws at first use for a key that isn't a registered component a command may add, or one listed twice", async () => {
        const { world, run } = withCommands();
        const tried = (list: readonly unknown[]) => run(commands => { Reflect.apply(commands.spawn, commands, [list]); });
        await expect(tried([score, unregistered])).rejects.toThrow(`"commandsTest/unregistered" has no registered schema`);
        await expect(tried([score, slot])).rejects.toThrow("is derived, so only rules add and remove it");
        await expect(tried([level])).rejects.toThrow(`"commandsTest/level" is a resource, not a component`);
        await expect(tried([score, score])).rejects.toThrow(`lists "commandsTest/score" twice`);
        await expect(tried(["commandsTest/score"])).rejects.toThrow("a component's key is a symbol");
        // Nothing spawned but the failed runs' reports.
        expect(await count(world, { not: [Report.run] })).toBe(0);
        await world.dispose();
    });
});

describe("literal values in a system's body", () => {
    it("spawn and add through one site over several lists, starting what they leave out", async () => {
        const world = createWorld({ [workers]: 0 });
        literals.length = 0;
        await world.run(spawnLiterals);
        expect(await Promise.all(literals.map(entity => components(world, entity)))).toEqual([0, 1, 2, 3, 4, 5].map(i =>
            i % 3 === 0 ? { [score]: i, [label]: null, [tag]: true } : i % 3 === 1 ? { [score]: i, [tag]: true } : { [score]: i, [label]: null }));
        await world.run(addLiterals);
        expect(await Promise.all(literals.map(entity => readEntity(world, entity, [score, health, label])))).toEqual([0, 1, 2, 3, 4, 5].map(i => ({ [score]: i, [health]: 5, [label]: "x" })));
        await world.dispose();
    });
});

/** Three adds of one component to each row, by systems ordered first to third, the second adding twice. */
const first = System.create({ name: "commandsTest/firstAdd", kernel: "cpu", components: { has: [position] } }, (row, { commands }) => {
    commands.add(row.entity, score, 1);
});
const second = System.create({ name: "commandsTest/secondAdd", components: { has: [position] }, after: [first] }, (row, { commands }) => {
    commands.add(row.entity, score, 2);
    commands.add(row.entity, score, 3);
});
const third = System.create({ name: "commandsTest/thirdAdd", kernel: "cpu", components: { has: [position] }, after: [second] }, (row, { commands }) => {
    commands.add(row.entity, score, 4);
});

describe("add and remove", () => {
    it("add one component with its value, a tag without one, or a list with its values and defaults", async () => {
        const { world, run } = withCommands();
        let entity = Entity.none;
        await run(commands => { entity = commands.spawn([position])({ [position]: [0, 0, 0] }); });
        await run(commands => {
            commands.add(entity, score, 2);
            commands.add(entity, tag);
            commands.add(entity, [health, label, other], { [health]: 100 });
        });
        expect(await components(world, entity)).toEqual({ [position]: [0, 0, 0], [score]: 2, [tag]: true, [health]: 100, [label]: null, [other]: true, [slot]: 0 });
        await run(commands => { commands.add(entity, [score, health], { [score]: 3, [health]: 4 }); });
        expect(await readEntity(world, entity, [score, health])).toEqual({ [score]: 3, [health]: 4 });
        await world.dispose();
    });
    it("apply in the order issued: of systems in schedule order, and in each by row, so a later add of a component wins", async () => {
        const { world, run } = withCommands();
        let entity = Entity.none;
        await run(commands => { entity = commands.spawn([position, score])({ [position]: [0, 0, 0], [score]: 0 }); });
        await world.run(System.create([third, first, second]));
        expect(await read(world, entity, score)).toBe(4);
        await world.run(System.create([second, first]));
        expect(await read(world, entity, score)).toBe(3);
        await world.dispose();
    });
    it("remove one component or a list", async () => {
        const { world, run } = withCommands();
        let entity = Entity.none;
        await run(commands => { entity = commands.spawn([position, score, tag, other, health])({ [position]: [0, 0, 0], [score]: 1, [health]: 100 }); });
        await run(commands => { commands.remove(entity, tag); });
        expect(await components(world, entity)).toEqual({ [position]: [0, 0, 0], [score]: 1, [other]: true, [health]: 100, [slot]: 0 });
        await run(commands => { commands.remove(entity, [other, health]); });
        expect(await components(world, entity)).toEqual({ [position]: [0, 0, 0], [score]: 1 });
        await world.dispose();
    });
    it("throw at first use for a key that isn't a component a command may add", async () => {
        const { world, run } = withCommands();
        let entity = Entity.none;
        await run(commands => { entity = commands.spawn([score])({ [score]: 1 }); });
        await expect(run(commands => { Reflect.apply(commands.add, commands, [entity, slot, 1]); })).rejects.toThrow("is derived");
        await expect(run(commands => { Reflect.apply(commands.add, commands, [entity, [score, unregistered], {}]); })).rejects.toThrow("has no registered schema");
        await expect(run(commands => { Reflect.apply(commands.remove, commands, [entity, [level]]); })).rejects.toThrow("is a resource, not a component");
        // A kernel's command names a list declared in another module as if it were one component.
        await expect(run(commands => { Reflect.apply(commands.remove, commands, [entity, [[score]]]); })).rejects.toThrow("A command names a list of components where one component's symbol goes.");
        expect(await components(world, entity)).toEqual({ [score]: 1 });
        await world.dispose();
    });
    it("move rows from several source archetypes in one sync point, keeping values, and stamping only what changed", async () => {
        const { world, run } = withCommands();
        const spawned: Entity[] = [];
        await run(commands => {
            for (let i = 0; i < 40; i++) spawned.push(commands.spawn(i % 2 === 0 ? [position, score] : [position, score, other])({ [position]: [i, i, i], [score]: i }));
        });
        const added: Entity[] = [];
        const changed: Entity[] = [];
        const watchAdded = System.create({ name: "commandsTest/watchAdded", components: { has: [score], added: [tag] } }, row => { added.push(row.entity); });
        const watchChanged = System.create({ name: "commandsTest/watchChanged", components: { has: [score], changed: [position] } }, row => { changed.push(row.entity); });
        const watch = System.create({ name: "commandsTest/watch", systems: [watchAdded, watchChanged] });
        await world.run(watch);
        added.length = changed.length = 0;
        await run(commands => {
            for (let i = 0; i < 40; i++) {
                if (i % 4 < 2) commands.add(spawned[i], tag);
                if (i % 4 === 3) commands.add(spawned[i], position, [-i, -i, -i]);
                if (i % 5 === 0) commands.remove(spawned[i], [score]);
            }
        });
        await world.run(watch);
        const expected = spawned.filter((_, i) => i % 4 < 2 && i % 5 !== 0);
        expect([...added].sort((a, b) => a - b)).toEqual(expected);
        expect([...changed].sort((a, b) => a - b)).toEqual(spawned.filter((_, i) => i % 4 === 3 && i % 5 !== 0));
        for (let i = 0; i < 40; i++) {
            expect(await read(world, spawned[i], position)).toEqual(i % 4 === 3 ? [-i, -i, -i] : [i, i, i]);
            expect(await read(world, spawned[i], score)).toBe(i % 5 === 0 ? null : i);
            expect(await read(world, spawned[i], tag)).toBe(i % 4 < 2 ? true : null);
        }
        expect(await select(world, { required: [tag, other] })).toEqual(expect.arrayContaining(spawned.filter((_, i) => i % 4 === 1)));
        await world.dispose();
    });
});

describe("spawners where code can't be generated", () => {
    it("loop over the values", async () => {
        const generate = globalThis.Function;
        // A content security policy without 'unsafe-eval' makes `new Function` throw.
        globalThis.Function = new Proxy(generate, { construct: () => { throw new EvalError("blocked"); } });
        try {
            const { world, run } = withCommands();
            const spawned: Entity[] = [];
            await run(commands => {
                for (let i = 0; i < 3; i++) spawned.push(commands.spawn([position, score, label, bit3])({ [position]: [i, i, i], [score]: i }));
                const values = { [score]: 9, [label]: "a" };
                spawned.push(commands.spawn([score, label])(values));
            });
            // A spawn with literal values in a system's body, which the plugin passes positionally.
            const literal = System.create({ name: "commandsTest/literal" }, ({ commands }) => {
                spawned.push(commands.spawn([score, bit2, label])({ [label]: "b", [score]: 8 }));
            });
            await world.run(literal);
            expect(await Promise.all(spawned.map(entity => components(world, entity)))).toEqual([
                ...[0, 1, 2].map(i => ({ [position]: [i, i, i], [score]: i, [label]: null, [bit3]: true })),
                { [score]: 9, [label]: "a" },
                { [score]: 8, [label]: "b", [bit2]: true },
            ]);
            await world.dispose();
        }
        finally {
            globalThis.Function = generate;
        }
    });
});

describe("kernels", () => {
    it("spawn, add and remove through Archetype.create bindings", async () => {
        const { world, run } = withCommands();
        await run(commands => { for (let i = 0; i < 3; i++) commands.spawn([score])({ [score]: i }); });
        await world.run(spawnFrom);
        const spawned = await select(world, { required: [score, tag] });
        expect(await Promise.all(spawned.map(entity => components(world, entity)))).toEqual([10, 11, 12].map(value => ({ [score]: value, [tag]: true })));
        await world.run(mark);
        expect(await Promise.all(spawned.map(entity => components(world, entity)))).toEqual([10, 11, 12].map(value => ({ [score]: value, [tag]: true, [other]: true, [label]: null, [slot]: 0 })));
        await world.run(unmark);
        expect(await count(world, { required: [other] })).toBe(0);
        expect(await count(world, { required: [tag, score] })).toBe(3);
        await world.dispose();
    });
});
