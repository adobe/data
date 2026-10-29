// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity, System, workers } from "../../index.js";
import type { F32, Vec2 } from "../../interface/math/index.js";
import type { Commands } from "../../interface/system/commands.js";
import { createWorld, join } from "./create.js";
import { emptyFor } from "./reclaim.js";
import { whereOf } from "./where.js";

const cell = Symbol("reclaimTest/cell");
const position = Symbol("reclaimTest/position");
const seen = Symbol("reclaimTest/seen");
const note = Symbol("reclaimTest/note");
const camera = Symbol("reclaimTest/camera");
declare module "@adobe/ecs" {
    interface Components {
        [cell]: { type: Vec2.I32; shared: true };
        [position]: { type: F32 };
        [seen]: { type: F32 };
        [note]: { type: { readonly text: string } | null; thread: "reclaimTest" };
    }
    interface Threads {
        reclaimTest: true;
    }
    interface Resources {
        [camera]: { type: number; default: 0 };
    }
}

const inline = () => createWorld({ [workers]: 0 });

// Systems reading what an archetype holds of its value: a kernel, `where` by predicate and by value.
export const copyCell = System.create({ kernel: true, components: { with: [cell, seen] } }, row => { row[seen] = row[cell][0]; });
const found: string[] = [];
export const atFifty = System.create({ components: { with: [position], where: { [cell]: at => at[0] === 50 } } }, row => { found.push(`where ${row[position]}`); });
export const atLast = System.create({ components: { with: [position], where: { [cell]: [emptyFor + 2, 0] } } }, row => { found.push(`value ${row[position]}`); });
// Kept to the cell the camera names.
export const visiting = System.create({ components: { with: [position], where: { [cell]: (at, { resources }) => at[0] === resources[camera] } } }, () => {});
const visited: number[] = [];
export const visit = System.create({ components: { with: [cell, position], where: { [cell]: (at, { resources }) => at[0] === resources[camera] } } }, row => { visited.push(row[cell][0]); });
const caught: number[] = [];
export const catchUp = System.create({ kernel: false, components: { with: [position], changed: [position], where: { [cell]: (at, { resources }) => at[0] === resources[camera] } } }, row => { caught.push(row[position]); });
// On a joined thread.
const heard: number[] = [];
export const hear = System.create({ readonly: true, components: { with: [cell, position], where: { [cell]: at => at[0] === 50 } } }, row => { heard.push(row[cell][0] * 1000 + row[position]); });

/** Moves an entity to cell `[x, 0]`. */
const step = System.create({}, ({ commands }, input: { readonly entity: Entity; readonly x: number }) => { commands.add(input.entity, cell, [input.x, 0]); });

/** Spawns an entity at `[x, 0]`, returning it. */
const spawnAt = (world: ReturnType<typeof inline>, x: number, components: readonly symbol[] = [cell, position]): Promise<Entity> => {
    let spawned = Entity.none;
    return world.run(System.create(({ commands }) => {
        const untyped: (list: readonly symbol[], constants: object) => (values: object) => Entity = (list, constants) => Reflect.apply(commands.spawn, commands, [list, constants]);
        spawned = untyped(components, { [cell]: [x, 0] })({ [position]: x });
    })).then(() => spawned);
};

/** Every row's cell and position, by position. */
const cellsOf = async (world: ReturnType<typeof inline>): Promise<readonly string[]> => {
    const found: [number, string][] = [];
    await world.run(System.create({ readonly: true, components: { with: [cell, position] } }, row => { found.push([row[position], `${row[cell][0]}:${row[position]}`]); }));
    return found.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
};

describe("reclaiming archetypes of shared values", () => {
    it(`keeps an emptied archetype for ${emptyFor} sync points, then reclaims it and reuses it for another value`, async () => {
        await using world = inline();
        const walker = await spawnAt(world, 0);
        const archetypes = (await world.tables()).archetypes;
        await world.run(step, { entity: walker, x: 1 });
        // Cell 0's archetype is empty: kept for now, so a row coming back finds it.
        for (let k = 1; k < emptyFor; k++) await world.run(step, { entity: walker, x: 1 + (k % 2) });
        expect((await world.tables()).sharing.pooled).toBe(0);
        await world.run(step, { entity: walker, x: 3 });
        // Reclaimed as that sync point ends, cell 3's archetype made before it.
        const reclaimed = await world.tables();
        expect(reclaimed.sharing.pooled).toBe(1);
        expect(reclaimed.sharing.membership).toBe(1);
        await world.run(step, { entity: walker, x: 4 });
        // Cell 4 takes cell 0's archetype rather than a new one.
        const reused = await world.tables();
        expect(reused.sharing.pooled).toBe(0);
        expect(reused.sharing.membership).toBe(2);
        expect(reused.archetypes).toBe(reclaimed.archetypes);
        expect(reused.archetypes).toBe(archetypes + 3);
        expect(await cellsOf(world)).toEqual(["4:0"]);
    });

    it("keeps an archetype a row leaves and enters again each sync point", async () => {
        await using world = inline();
        const walker = await spawnAt(world, 0);
        for (let k = 1; k <= 40; k++) await world.run(step, { entity: walker, x: k % 2 });
        const { sharing, archetypes } = await world.tables();
        expect(sharing.membership).toBe(0);
        expect(archetypes).toBe(3);
    });

    it("holds as much after 100,000 cells walked, and spawners with constants for each, as after 1,000", async () => {
        await using world = inline();
        const walker = await spawnAt(world, 0);
        const walk = System.create({}, ({ commands }, input: { readonly from: number; readonly to: number }) => {
            for (let x = input.from; x < input.to; x++) commands.add(walker, cell, [x, 0]);
            // A spawner of the last cell, its spawn moving with the walker.
            const at = commands.spawn([cell, position], { [cell]: [input.to - 1, 0] })({ [position]: -1 });
            commands.despawn(at);
        });
        const walked = async (from: number, to: number): Promise<void> => {
            for (let x = from; x < to; x += 1) await world.run(walk, { from: x, to: x + 1 });
        };
        await walked(1, 1_000);
        const early = await world.tables();
        await walked(1_000, 100_000);
        const late = await world.tables();
        expect(late.archetypes).toBe(early.archetypes);
        expect(late.arena).toBe(early.arena);
        expect(late.sharing.values).toBe(early.sharing.values);
        expect(late.sharing.batches).toBe(early.sharing.batches);
        expect(late.sharing.presets).toBe(early.sharing.presets);
        expect(late.sharing.values).toBeLessThan(2 * emptyFor + 4);
        expect(await cellsOf(world)).toEqual(["99999:0"]);
    }, 60_000);

    it("reads a reused archetype's own value in rows, kernels, where and lookups", async () => {
        await using world = inline();
        const walker = await spawnAt(world, 0, [cell, position, seen]);
        const other = await spawnAt(world, 100, [cell, position, seen]);
        for (let x = 1; x <= emptyFor + 2; x++) await world.run(step, { entity: walker, x });
        // The other's archetype is cell 0's, reused.
        await world.run(step, { entity: other, x: 50 });
        expect((await world.tables()).sharing.membership).toBeGreaterThan(0);
        found.length = 0;
        await world.run(System.create({ kernel: false, components: { with: [cell, position] } }, row => { found.push(`body ${row[cell][0]}`); }));
        await world.run(copyCell);
        await world.run(System.create({ readonly: true, components: { with: [cell, seen] } }, row => { found.push(`kernel ${row[seen]}`); }));
        await world.run(atFifty);
        await world.run(atLast);
        expect(found.sort()).toEqual(["body 50", `body ${emptyFor + 2}`, "kernel 50", `kernel ${emptyFor + 2}`, "value 0", "where 100"].sort());
    });

    it("leaves a system's matches as archetypes go, and matches one reused for a value it passes", async () => {
        await using world = inline();
        const walker = await spawnAt(world, 0);
        await world.run(visiting);
        for (let x = 1; x <= 60; x++) {
            await world.run(step, { entity: walker, x });
            await world.run(visiting);
        }
        const where = whereOf(visiting);
        // Its matches are those not reclaimed: as many as the world keeps of the walk.
        expect(where?.evaluated).toBeLessThanOrEqual(emptyFor + 3);
        await world.run(System.create(({ resources }) => { resources[camera] = 60; }));
        visited.length = 0;
        await world.run(visit);
        expect(visited).toEqual([60]);
    });

    it("counts a row moved out of an archetype before it was reclaimed as changed by that archetype's point", async () => {
        await using world = inline();
        caught.length = 0;
        const far = await spawnAt(world, 5);
        await spawnAt(world, 0);
        await world.run(catchUp);
        // Out of view, it changes, then moves into view's cell, and its old archetype is reclaimed and reused.
        await world.run(System.create({ components: { with: [position] } }, row => { row[position] += 0.5; }));
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toEqual([0.5]);
        await world.run(step, { entity: far, x: 0 });
        const walker = await spawnAt(world, 7);
        for (let x = 8; x < 8 + emptyFor + 2; x++) await world.run(step, { entity: walker, x });
        await world.run(step, { entity: walker, x: 5 });
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toContain(5.5);
    });

    it("revives a spawner's batch let go with its value, spawning into that value's archetype", async () => {
        await using world = inline();
        let kept: ((values: { readonly [position]: number }) => Entity) | null = null;
        await world.run(System.create(({ commands }: { readonly commands: Commands }) => {
            kept = commands.spawn([cell, position], { [cell]: [9, 0] });
        }));
        // Nothing holds cell 9: its value, spawner and batch are let go of.
        await spawnAt(world, 1);
        expect((await world.tables()).sharing.batches).toBe(1);
        await world.run(System.create(() => { kept?.({ [position]: 9 }); }));
        expect(await cellsOf(world)).toEqual(["1:1", "9:9"]);
    });

    it("reads a reused archetype's own value on a joined thread, in where and rows", async () => {
        const channel = new MessageChannel();
        await using world = inline();
        heard.length = 0;
        const [joined] = await Promise.all([
            join(channel.port2, { threads: ["reclaimTest"] }).then(thread => {
                thread.add(hear);
                return thread;
            }),
            world.share(channel.port1),
        ]);
        await using thread = joined;
        const walker = await spawnAt(world, 0);
        const other = await spawnAt(world, 100);
        for (let x = 1; x <= emptyFor + 2; x++) await world.run(step, { entity: walker, x });
        await world.run(step, { entity: other, x: 50 });
        expect((await world.tables()).sharing.membership).toBeGreaterThan(0);
        const idle = System.create(() => {});
        const end = performance.now() + 2000;
        while (!heard.includes(50_100) && performance.now() < end) await world.run(idle);
        expect(heard).toEqual([50_100]);
        void thread;
    });
});
