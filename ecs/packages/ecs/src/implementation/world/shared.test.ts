// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity, Finalizer, Index, Rule, System, workers } from "../../index.js";
import type { F32, Vec2 } from "../../interface/math/index.js";
import { registerComponent } from "../../interface/registry/declarations.js";
import type { Commands } from "../../interface/system/commands.js";
import { createWorld, join } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";

const team = Symbol("sharedTest/team");
const cell = Symbol("sharedTest/cell");
const weight = Symbol("sharedTest/weight");
const style = Symbol("sharedTest/style");
const health = Symbol("sharedTest/health");
const armed = Symbol("sharedTest/armed");
const banner = Symbol("sharedTest/banner");
const marker = Symbol("sharedTest/marker");
const place = Symbol("sharedTest/place");
declare module "@adobe/ecs" {
    interface Threads {
        sharedTest: true;
    }
    interface Components {
        [team]: { type: "red" | "blue"; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [weight]: { type: F32; shared: true };
        [style]: { type: { readonly color: string; readonly sizes: readonly number[] }; shared: true };
        [health]: { type: number };
        [armed]: { type: true; derived: true };
        [banner]: { type: { readonly text: string } | null; thread: "sharedTest" };
        [marker]: { type: number };
        [place]: { type: readonly [number, number] };
    }
}

export const arming = Rule.create({ components: { with: [team, health] }, derive: [armed] });

const inline = () => createWorld({ [workers]: 0 });

// Systems a joined thread runs, which it names by the ids the build gives them at the top level.
const heard: string[] = [];
export const listen = System.create({ readonly: true, components: { with: [team, health] } }, row => { heard.push(`${row[team]} ${row[health]}`); });
export const spawnBanners = System.create(({ commands }) => {
    commands.spawn([team, health, banner], { [team]: "red" })({ [health]: 1 });
    commands.spawn([team, health, banner], { [team]: "blue" })({ [health]: 2 });
});
// Placed there by writing its objects.
export const writeBanners = System.create({ components: { with: [team, health, banner] } }, row => {
    row[banner] = { text: `${row[team]} ${row[health]}` };
});
const banners: string[] = [];
// A finalizer reading the joined thread's objects runs there, reading each stop's shared value as of before it applied.
const finalized: string[] = [];
export const finalizeBanners = Finalizer.create({ components: { with: [team, health, banner] } }, row => { finalized.push(`${row[team]} ${row[health]} ${row[banner]?.text ?? "none"}`); });
export const despawnBanners = System.create({ components: { with: [banner] } }, (row, { commands }) => { commands.despawn(row.entity); });
// On the joined thread: two lists spawned with one constants object, each spawner its own list's.
const base = { [health]: 7 } as const;
export const spawnThere = System.create({ components: { with: [banner] } }, (row, { commands }) => {
    if (row[banner] === null) return;
    commands.spawn([health, marker], base)({ [marker]: 1 });
    commands.spawn([health], base)({});
});
export const readBanners = System.create({ readonly: true, components: { with: [banner] } }, row => { banners.push(row[banner]?.text ?? "none"); });

/** Every entity's team and health, and whether it's armed, sorted by health. */
const rowsOf = async (world: ReturnType<typeof inline>): Promise<readonly string[]> => {
    const read = System.create({ readonly: true, components: { with: [team, health], optional: [armed] } }, (row) => {
        found.push(`${row[team]} ${row[health]}${row[armed] === true ? " armed" : ""}`);
    });
    const found: string[] = [];
    await world.run(read);
    return found.sort((a, b) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]));
};

describe("a shared component", () => {
    it("is registered only on comparable data, never with a thread, as derived or as a reference", () => {
        expect(() => registerComponent(Symbol("sharedTest/map"), { type: { type: "map", keys: { type: "string" }, values: { type: "number" } }, shared: true }))
            .toThrow("a shared component's value is comparable data: numbers, booleans, strings, and arrays and objects of those");
        expect(() => registerComponent(Symbol("sharedTest/nullable"), { type: { anyOf: [{ type: "number" }, { type: "null" }] }, shared: true }))
            .toThrow("a shared component's value is comparable data");
        expect(() => registerComponent(Symbol("sharedTest/opaque"), { shared: true })).toThrow("a shared component's value is comparable data");
        expect(() => registerComponent(Symbol("sharedTest/placed"), { type: { type: "array", items: { type: "string" } }, shared: true, thread: "main" }))
            .toThrow("a shared value lives in shared memory, so it has no thread");
        expect(() => registerComponent(Symbol("sharedTest/derived"), { type: { type: "number" }, default: 0, derived: true, shared: true }))
            .toThrow("a derived component isn't shared: its rule adds it with its default");
        expect(() => registerComponent(Symbol("sharedTest/reference"), { type: Entity.schema, reference: "owner", shared: true }))
            .toThrow("a reference isn't shared");
        expect(() => registerComponent(Symbol("sharedTest/flag"), { type: { type: "number" }, shared: false })).toThrow("shared is true");
        expect(() => registerComponent(Symbol("sharedTest/tags"), { type: { type: "array", items: { type: "string" } }, shared: true })).not.toThrow();
    });

    it("keeps no index key part: where filters by it", () => {
        // Typed, a shared key part is an error already.
        expect(() => Reflect.apply(Index.create, undefined, [{ key: [weight] }])).toThrow(`has key part "sharedTest/weight", a shared component: filter by it with where`);
    });

    it("chooses the archetype by its value, interned by structure, each value read as stored", async () => {
        await using world = inline();
        const spawned = new Map<string, Entity>();
        await world.run(System.create(({ commands }) => { commands.spawn([health])({ [health]: 0 }); }));
        const before = (await world.tables()).archetypes;
        await world.run(System.create(({ commands }) => {
            spawned.set("a", commands.spawn([cell, health], { [cell]: [1, 2] })({ [health]: 1 }));
            spawned.set("b", commands.spawn([cell, health], { [cell]: [1, 2] })({ [health]: 2 }));
            spawned.set("c", commands.spawn([cell, health], { [cell]: [2, 1] })({ [health]: 3 }));
            // Leaves compare as stored: f32, -0 as 0.
            commands.spawn([weight, health], { [weight]: 0.1 })({ [health]: 4 });
            commands.spawn([weight, health], { [weight]: Math.fround(0.1) })({ [health]: 5 });
            commands.spawn([weight, health], { [weight]: -0 })({ [health]: 6 });
            commands.spawn([weight, health], { [weight]: 0 })({ [health]: 7 });
            commands.spawn([weight, health], { [weight]: NaN })({ [health]: 8 });
            commands.spawn([weight, health], { [weight]: NaN })({ [health]: 9 });
            commands.spawn([style, health], { [style]: { sizes: [1, 2], color: "red" } })({ [health]: 10 });
            commands.spawn([style, health], { [style]: { color: "red", sizes: [1, 2] } })({ [health]: 11 });
        }));
        // Three cells' worth of [1, 2] and [2, 1], three weights and one style.
        expect((await world.tables()).archetypes - before).toBe(2 + 3 + 1);
        const read: string[] = [];
        await world.run(System.create({ readonly: true, components: { with: [health], optional: [cell, weight, style] } }, row => {
            if (row[health] === 0) return;
            read.push(`${row[health]}: ${JSON.stringify(row[cell] ?? row[style] ?? null)} ${String(row[weight])}`);
        }));
        expect(read.sort((a, b) => Number.parseInt(a) - Number.parseInt(b))).toEqual([
            "1: [1,2] undefined", "2: [1,2] undefined", "3: [2,1] undefined",
            `4: null ${Math.fround(0.1)}`, `5: null ${Math.fround(0.1)}`, "6: null 0", "7: null 0", "8: null NaN", "9: null NaN",
            `10: {"color":"red","sizes":[1,2]} undefined`, `11: {"color":"red","sizes":[1,2]} undefined`,
        ]);
    });

    it("gives the same spawner for a world, list and constants, and a constant non-shared value to every entity spawned", async () => {
        await using world = inline();
        const spawners: unknown[] = [];
        const Unit = [team, health] as const;
        await world.run(System.create(({ commands }) => {
            spawners.push(commands.spawn(Unit, { [team]: "red" }), commands.spawn(Unit, { [team]: "red" }), commands.spawn(Unit, { [team]: "blue" }));
            spawners.push(commands.spawn(Unit, { [team]: "red", [health]: 5 }), commands.spawn(Unit, { [team]: "red", [health]: 5 }), commands.spawn(Unit, { [team]: "red", [health]: 6 }));
            commands.spawn(Unit, { [team]: "blue", [health]: 7 })({});
            commands.spawn(Unit, { [team]: "blue", [health]: 7 })({});
        }));
        expect(spawners[0]).toBe(spawners[1]);
        expect(spawners[0]).not.toBe(spawners[2]);
        expect(spawners[3]).toBe(spawners[4]);
        expect(spawners[3]).not.toBe(spawners[5]);
        expect(await rowsOf(world)).toEqual(["blue 7 armed", "blue 7 armed"]);
    });

    it("keeps -0 and 0 apart in constants not shared, whole or in a tuple", async () => {
        await using world = inline();
        const spawned: string[] = [];
        await world.run(System.create(({ commands }) => {
            commands.spawn([team, health], { [team]: "red", [health]: 0 })({});
            commands.spawn([team, health], { [team]: "red", [health]: -0 })({});
            commands.spawn([team, place], { [team]: "red", [place]: [0, 1] })({});
            commands.spawn([team, place], { [team]: "red", [place]: [-0, 1] })({});
        }));
        await world.run(System.create({ components: { with: [team, health] } }, row => { spawned.push(`health ${Object.is(row[health], -0) ? "-0" : row[health]}`); }));
        await world.run(System.create({ components: { with: [team, place] } }, row => { spawned.push(`place ${Object.is(row[place][0], -0) ? "-0" : row[place][0]}`); }));
        expect(spawned).toEqual(["health 0", "health -0", "place 0", "place -0"]);
    });

    it("fails a spawn without its value, or with one not of its type, at the spawner", async () => {
        await using world = inline();
        const untyped = (commands: Commands, ...parameters: unknown[]): unknown => Reflect.apply(commands.spawn, commands, parameters);
        expect((await runReported(world, System.create(({ commands }) => { untyped(commands, [team, health]); }))).failures.map(failure => failure.message)).toEqual([
            expect.stringContaining(`A spawn of "sharedTest/team", a shared component, takes its value first: commands.spawn(components, { [key]: value })`),
        ]);
        expect((await runReported(world, System.create(({ commands }) => { untyped(commands, [team, health], { [team]: { name: "green" } }); }))).failures.map(failure => failure.message)).toEqual([
            expect.stringContaining(`"sharedTest/team" isn't given one of its type's values`),
        ]);
    });

    it("fails a spawn giving a component its constants gave, shared or not, spawning nothing", async () => {
        await using world = inline();
        const untyped = (spawner: unknown, values: object): unknown => Reflect.apply(Function.prototype.call, spawner, [undefined, values]);
        for (const values of [{ [team]: "blue", [health]: 1 }, { [health]: 1 }]) {
            const report = await runReported(world, System.create(({ commands }) => {
                const spawner = commands.spawn([team, health, place], { [team]: "red", [place]: [0, 0] });
                untyped(spawner, { ...values, [place]: [1, 1] });
            }));
            expect(report.failures.map(failure => failure.message)).toEqual([expect.stringMatching(/A spawn gives "sharedTest\/(team|place)" in both its calls: each component's value comes from one/)]);
        }
        expect(await rowsOf(world)).toEqual([]);
    });

    it("reads as its archetype's value in rows, lookups and finalizers, and fails a body assigning it", async () => {
        await using world = inline();
        let red = Entity.none;
        await world.run(System.create(({ commands }) => {
            red = commands.spawn([team, health], { [team]: "red" })({ [health]: 1 });
            commands.spawn([team, health], { [team]: "blue" })({ [health]: 2 });
        }));
        const looked: string[] = [];
        await world.run(System.create({ components: { with: [health] }, lookup: { other: { with: [team] } } }, (row, { lookup }) => {
            looked.push(`${row[health]} sees ${lookup.other(red)?.[team] ?? "none"}`);
        }));
        expect(looked.sort()).toEqual(["1 sees red", "2 sees red"]);
        const assign: (row: object) => void = row => { Reflect.set(row, team, "blue"); };
        const assigning = System.create({ kernel: false, components: { with: [team, health] } }, row => {
            if (row[health] === 1) assign(row);
        });
        // The build takes the row as written whole, since it can't follow it: every member but shared ones and references.
        expect((await runReported(world, assigning)).failures.map(failure => failure.message)).toEqual([
            expect.stringContaining(`"sharedTest/team" is shared: its value is its archetype's, so give it another with commands.add rather than assigning it`),
        ]);
        expect(() => System.create({ components: { with: [team, health] } }, row => {
            // @ts-expect-error a shared component's value is its archetype's
            row[team] = "blue";
        })).toThrow(`writes "sharedTest/team", a shared component, whose value is its archetype's: give it another with commands.add`);
    });

    it("moves its entity on commands.add of another value, marking it changed but not added, and leaves on remove", async () => {
        await using world = inline();
        let entity = Entity.none;
        await world.run(System.create(({ commands }) => {
            entity = commands.spawn([team, health], { [team]: "red" })({ [health]: 1 });
            commands.spawn([team, health], { [team]: "red" })({ [health]: 2 });
        }));
        const changes: string[] = [];
        const watch = System.create({ readonly: true, components: { with: [health], changed: [team] } }, row => { changes.push(`changed ${row[health]}`); });
        const adds = System.create({ readonly: true, components: { with: [health], added: [team] } }, row => { changes.push(`added ${row[health]}`); });
        world.add(watch);
        world.add(adds);
        await world.run(System.create(() => {}));
        changes.length = 0;
        await world.run(System.create(({ commands }) => { commands.add(entity, team, "blue"); }));
        expect(changes.sort()).toEqual(["changed 1"]);
        expect(await rowsOf(world)).toEqual(["blue 1 armed", "red 2 armed"]);
        changes.length = 0;
        // The same value again stays, and is changed as any add is.
        await world.run(System.create(({ commands }) => { commands.add(entity, team, "blue"); }));
        expect(changes).toEqual(["changed 1"]);
        await world.run(System.create(({ commands }) => { commands.remove(entity, team); }));
        expect(await rowsOf(world)).toEqual(["red 2 armed"]);
        changes.length = 0;
        await world.run(System.create(({ commands }) => { commands.add(entity, [team, health], { [team]: "red", [health]: 3 }); }));
        expect(changes.sort()).toEqual(["added 3", "changed 3"]);
        expect(await rowsOf(world)).toEqual(["red 2 armed", "red 3 armed"]);
    });

    it("gives a change's previous and next values, its archetypes told apart by value", async () => {
        await using world = inline();
        const seen: string[] = [];
        const changes = Finalizer.changes({ watch: [team, health] }, (changed) => {
            for (const change of changed.groups) {
                for (const entity of change.entities) {
                    if (change.replaced.includes(team)) seen.push(`${String(changed.previous(entity, team))} to ${String(changed.next(entity, team))}`);
                }
            }
        });
        const stops: string[] = [];
        const stopped = Finalizer.create({ components: { with: [team, health] } }, row => { stops.push(`${row[team]} ${row[health]}`); });
        let entity = Entity.none;
        await world.run(System.create(({ commands }) => { entity = commands.spawn([team, health], { [team]: "red" })({ [health]: 1 }); }));
        await world.run(System.create(({ commands }) => { commands.add(entity, team, "blue"); }));
        expect(seen).toEqual(["red to blue"]);
        await world.run(System.create(({ commands }) => { commands.despawn(entity); }));
        // A change of value moves the entity, and stops nothing: it holds every component it did.
        expect(stops).toEqual(["blue 1"]);
        void changes;
        void stopped;
    });

    it("is read on a joined thread, by the systems placed there and the observer systems added there", async () => {
        const channel = new MessageChannel();
        await using world = createWorld({ [workers]: 0 });
        const [joined] = await Promise.all([
            join(channel.port2, { threads: ["sharedTest"] }).then(thread => {
                thread.add(listen);
                return thread;
            }),
            world.share(channel.port1),
        ]);
        await using thread = joined;
        heard.length = 0;
        banners.length = 0;
        await world.run(spawnBanners);
        await world.run(writeBanners);
        await thread.run(readBanners);
        expect(banners.sort()).toEqual(["blue 2", "red 1"]);
        const end = performance.now() + 2000;
        while (heard.length < 2 && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 1));
        expect(heard.sort().slice(0, 2)).toEqual(["blue 2", "red 1"]);
        await world.run(despawnBanners);
        const finalizing = performance.now() + 2000;
        while (finalized.length < 2 && performance.now() < finalizing) await new Promise(resolve => setTimeout(resolve, 1));
        expect(finalized.sort()).toEqual(["blue 2 blue 2", "red 1 red 1"]);
    });

    it("runs a body a kernel would read it in as written, reading its archetype's value", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => {
            commands.spawn([weight, health], { [weight]: 2 })({ [health]: 1 });
            commands.spawn([weight, health], { [weight]: 3 })({ [health]: 1 });
        }));
        await world.run(System.create({ components: { with: [weight, health] } }, row => { row[health] *= row[weight]; }));
        const read: number[] = [];
        await world.run(System.create({ readonly: true, components: { with: [health] } }, row => { read.push(row[health]); }));
        expect(read.sort()).toEqual([2, 3]);
    });

    it("fails a system adding a value not of its type, queuing nothing of that add, and leaves the run's other commands", async () => {
        await using world = inline();
        let entity = Entity.none;
        await world.run(System.create(({ commands }) => { entity = commands.spawn([team, health], { [team]: "red" })({ [health]: 1 }); }));
        const untyped = (commands: Commands, ...parameters: unknown[]): unknown => Reflect.apply(commands.add, commands, parameters);
        const others = System.create(({ commands }) => { commands.spawn([team, health], { [team]: "blue" })({ [health]: 2 }); });
        const wrong = System.create(({ commands }) => {
            commands.add(entity, health, 5);
            untyped(commands, entity, team, "green");
        });
        const wrongList = System.create(({ commands }) => { untyped(commands, entity, [team, health], { [team]: { name: "green" }, [health]: 9 }); });
        const report = await runReported(world, System.create([others, wrong, wrongList]));
        expect(report.failures.map(failure => [failure.name, failure.message])).toEqual([
            ["wrong", `"sharedTest/team", a shared component, isn't given one of its type's values: green.`],
            ["wrongList", expect.stringContaining(`"sharedTest/team", a shared component, isn't given one of its type's values`)],
        ]);
        expect(await rowsOf(world)).toEqual(["blue 2 armed", "red 5 armed"]);
    });

    it("checks a tuple's every leaf against its type, whatever was interned before", async () => {
        for (const order of [[[1, 2], [1.5, 2], [2 ** 32 + 7, 7], [7, 7]], [[1.5, 2], [2 ** 32 + 7, 7], [1, 2], [7, 7]]]) {
            await using world = inline();
            const untyped = (commands: Commands, ...parameters: unknown[]): unknown => Reflect.apply(commands.spawn, commands, parameters);
            const outcomes: string[] = [];
            for (const at of order) {
                const report = await runReported(world, System.create(({ commands }) => { untyped(commands, [cell, health], { [cell]: at }); }));
                outcomes.push(`${JSON.stringify(at)} ${report.failures.length === 0 ? "ok" : "refused"}`);
            }
            expect(outcomes.sort()).toEqual(["[1,2] ok", "[1.5,2] refused", "[4294967303,7] refused", "[7,7] ok"]);
        }
    });
    it("gives a joined thread's spawners with constants by their list and constants", async () => {
        const channel = new MessageChannel();
        await using world = createWorld({ [workers]: 0 });
        const [joined] = await Promise.all([join(channel.port2, { threads: ["sharedTest"] }), world.share(channel.port1)]);
        await using thread = joined;
        await world.run(spawnBanners);
        await world.run(writeBanners);
        await world.run(spawnThere);
        const found: string[] = [];
        await world.run(System.create({ readonly: true, components: { with: [health], optional: [marker, team] } }, row => {
            if (row[team] === undefined) found.push(`${row[health]} ${row[marker] ?? "none"}`);
        }));
        expect(found.sort()).toEqual(["7 1", "7 1", "7 none", "7 none"]);
        void thread;
    });
});

