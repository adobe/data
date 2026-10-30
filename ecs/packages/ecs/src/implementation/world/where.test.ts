// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity, System, workers } from "../../index.js";
import type { F32, Vec2 } from "../../interface/math/index.js";
import { createWorld, join, startTicksAt } from "./create.js";
import { whereOf } from "./where.js";

const team = Symbol("whereTest/team");
const note = Symbol("whereTest/note");
const cell = Symbol("whereTest/cell");
const position = Symbol("whereTest/position");
const seen = Symbol("whereTest/seen");
const camera = Symbol("whereTest/camera");
const other = Symbol("whereTest/other");
declare module "@adobe/ecs" {
    interface Components {
        [team]: { type: "red" | "blue"; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [position]: { type: F32 };
        [seen]: { type: F32 };
        [note]: { type: { readonly text: string } | null; thread: "whereTest" };
    }
    interface Threads {
        whereTest: true;
    }
    interface Resources {
        [camera]: { type: { readonly x: number; readonly radius: number }; default: { x: 0; radius: 1 } };
        [other]: { type: number; default: 0 };
    }
}

/** Whether a cell is within the camera's radius of its center, along x. */
const visible = (at: Vec2.I32, x: number, radius: number): boolean => Math.abs(at[0] - x) <= radius;

const spawn = System.create(({ commands }) => {
    for (let x = -3; x <= 3; x++) {
        for (let k = 0; k < 4; k++) commands.spawn([cell, team, position, seen], { [cell]: [x, 0], [team]: k % 2 === 0 ? "red" : "blue" })({ [position]: x * 10 + k, [seen]: 0 });
    }
});

// By value: only the red archetypes.
export const reds = System.create({ components: { with: [position, seen], where: { [team]: "red" } } }, row => { row[seen] += 1; });

// By a predicate of the value and a resource.
export const inView = System.create({ kernel: false, components: { with: [position, seen], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, row => { row[seen] += 100; });
// The same, as a kernel.
export const inViewKernel = System.create({ kernel: true, components: { with: [position, seen], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, row => { row[seen] += 100; });

// With a change filter: each archetype counts as changed since this system last saw it.
const caught: number[] = [];
export const catchUp = System.create({ kernel: false, components: { with: [position], changed: [position], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, row => { caught.push(row[position]); });

export const look = System.create({}, ({ resources }, input: { readonly x: number; readonly radius: number }) => { resources[camera] = { x: input.x, radius: input.radius }; });
export const touch = System.create(({ resources }) => { resources[other] += 1; });
export const nudge = System.create({ components: { with: [position, cell] } }, row => { row[position] += 0.5; });

// On a joined thread: a system placed there by writing its objects, and an observer system added there.
export const spawnNoted = System.create(({ commands }) => {
    for (let x = -3; x <= 3; x++) commands.spawn([cell, position, note], { [cell]: [x, 0] })({ [position]: x });
});
export const noteInView = System.create({ components: { with: [position, note], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, row => {
    row[note] = { text: `${row[position]}` };
});
const heard: number[] = [];
export const hearInView = System.create({ readonly: true, components: { with: [position], changed: [position], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, row => { heard.push(row[position]); });
// Filtered by a resource the predicate doesn't read: a culled archetype coming into view catches up on its change.
const signalled: number[] = [];
export const signalInView = System.create({ readonly: true, components: { with: [position], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } }, resources: { changed: [other] } }, row => { signalled.push(row[position]); });
// A system moving the camera its own predicate reads: its next run sees the new view.
const followed: number[] = [];
export const follow = System.create({ components: { with: [position], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, (row, { resources }) => {
    followed.push(row[position]);
    resources[camera] = { x: 3, radius: 0 };
});
// Placed on the joined thread by writing its objects, with a change filter: what it saw changed, by position.
const notedChanged: number[] = [];
export const noteChanged = System.create({ components: { with: [position, note], changed: [position], where: { [cell]: (at, { resources }) => visible(at, resources[camera].x, resources[camera].radius) } } }, row => {
    notedChanged.push(row[position]);
    row[note] = { text: `${row[position]}` };
});
const notes: string[] = [];
export const readNotes = System.create({ readonly: true, components: { with: [note] } }, row => { if (row[note] !== null) notes.push(row[note].text); });
export const nudgeNoted = System.create({ components: { with: [position, note] } }, row => { row[position] += 0.5; });

/** Waits a turn at a time until `done`, for two seconds at most. */
const until = async (done: () => boolean): Promise<void> => {
    const end = performance.now() + 2000;
    while (!done() && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 1));
};

/** Every row's position and how often it was seen, by position. */
const seenOf = async (world: ReturnType<typeof createWorld>): Promise<readonly string[]> => {
    const read: [number, string][] = [];
    await world.run(System.create({ readonly: true, components: { with: [position, seen] } }, row => { read.push([row[position], `${row[position]}:${row[seen]}`]); }));
    return read.sort((a, b) => a[0] - b[0]).map(([, text]) => text).filter(text => !text.endsWith(":0"));
};

describe("where", () => {
    it("runs a system over the archetypes holding an equal shared value", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(reds);
        expect(await seenOf(world)).toEqual([-30, -28, -20, -18, -10, -8, 0, 2, 10, 12, 20, 22, 30, 32].map(position => `${position}:1`));
    });
    for (const system of [inView, inViewKernel]) {
        it(`runs ${system === inView ? "a body" : "a kernel"} over the archetypes a predicate passes, as resources it reads change`, async () => {
            await using world = createWorld({ [workers]: 0 });
            await world.run(spawn);
            await world.run(system);
            expect(await seenOf(world)).toEqual([-10, -9, -8, -7, 0, 1, 2, 3, 10, 11, 12, 13].map(position => `${position}:100`));
            await world.run(look, { x: 3, radius: 0 });
            await world.run(system);
            expect((await seenOf(world)).filter(text => Number.parseFloat(text) >= 30)).toEqual(["30:100", "31:100", "32:100", "33:100"]);
        });
    }
    it("evaluates a predicate once per archetype as it appears, and again for every one only when a resource it reads changed", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(inView);
        const where = whereOf(inView);
        expect(where?.evaluations).toBe(14);
        const passing = where?.passing;
        for (let k = 0; k < 5; k++) await world.run(inView);
        await world.run(touch);
        await world.run(inView);
        expect(where?.evaluations).toBe(14);
        // The run's list of archetypes is one buffer, reused.
        expect(where?.passing).toBe(passing);
        expect(where?.count).toBe(6);
        await world.run(look, { x: 2, radius: 1 });
        await world.run(inView);
        expect(where?.evaluations).toBe(28);
        expect(where?.passing).toBe(passing);
        // A new archetype is evaluated as it appears.
        await world.run(System.create(({ commands }) => { commands.spawn([cell, team, position, seen], { [cell]: [9, 0], [team]: "red" })({ [position]: 90, [seen]: 0 }); }));
        await world.run(inView);
        expect(where?.evaluations).toBe(29);
    });
    it("keeps each archetype's last run, so one a predicate skipped catches up on its changes when it passes again", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(catchUp);
        caught.length = 0;
        // Every row changes; only those in view are visited.
        await world.run(nudge);
        await world.run(catchUp);
        expect(caught.sort((a, b) => a - b)).toEqual([-9.5, -8.5, -7.5, -6.5, 0.5, 1.5, 2.5, 3.5, 10.5, 11.5, 12.5, 13.5]);
        caught.length = 0;
        // Nothing changed since: nothing in view is visited, and cells coming into view catch up.
        await world.run(look, { x: 2, radius: 1 });
        await world.run(catchUp);
        expect(caught.sort((a, b) => a - b)).toEqual([20.5, 21.5, 22.5, 23.5, 30.5, 31.5, 32.5, 33.5]);
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toEqual([]);
    });
    it("counts a row moved from a skipped archetype into a passing one as changed since the system last saw it", async () => {
        await using world = createWorld({ [workers]: 0 });
        let far = Entity.none;
        await world.run(System.create(({ commands }) => {
            far = commands.spawn([cell, position], { [cell]: [5, 0] })({ [position]: 50 });
            commands.spawn([cell, position], { [cell]: [1, 0] })({ [position]: 1 });
        }));
        await world.run(catchUp);
        // Both change; only the one in view is visited, and its archetype's point moves on.
        await world.run(nudge);
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toEqual([1.5]);
        // The other moves into that archetype, holding a change its system never saw.
        await world.run(System.create(({ commands }) => { commands.add(far, cell, [1, 0]); }));
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toContain(50.5);
    });
    it("counts a moved row as changed by its old archetype's point before the run, whichever runs first", async () => {
        await using world = createWorld({ [workers]: 0 });
        let far = Entity.none;
        await world.run(System.create(({ commands }) => {
            // Its archetype is the first, so a run reaches it before the one its row moves into.
            far = commands.spawn([cell, position], { [cell]: [2, 0] })({ [position]: 20 });
            commands.spawn([cell, position], { [cell]: [0, 0] })({ [position]: 0 });
        }));
        await world.run(look, { x: 1, radius: 1 });
        await world.run(catchUp);
        await world.run(look, { x: 0, radius: 1 });
        await world.run(nudge);
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toEqual([0.5]);
        await world.run(System.create(({ commands }) => { commands.add(far, cell, [0, 0]); }));
        await world.run(look, { x: 1, radius: 1 });
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toContain(20.5);
    });
    it("counts a moved row as changed after its old archetype comes into view and its new one only later", async () => {
        await using world = createWorld({ [workers]: 0 });
        let far = Entity.none;
        await world.run(System.create(({ commands }) => {
            far = commands.spawn([cell, position], { [cell]: [2, 0] })({ [position]: 20 });
            commands.spawn([cell, position], { [cell]: [0, 0] })({ [position]: 0 });
        }));
        await world.run(catchUp);
        await world.run(nudge);
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toEqual([0.5]);
        await world.run(System.create(({ commands }) => { commands.add(far, cell, [0, 0]); }));
        // Its old archetype, empty now, is run over while its new one is out of view.
        await world.run(look, { x: 2, radius: 0 });
        await world.run(catchUp);
        await world.run(look, { x: 0, radius: 1 });
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toContain(20.5);
    });
    it("counts a row moved between archetypes it saw as unchanged, however long ago it saw another", async () => {
        await using world = createWorld({ [workers]: 0 });
        let moving = Entity.none;
        await world.run(System.create(({ commands }) => {
            commands.spawn([cell, position], { [cell]: [5, 0] })({ [position]: 50 });
            moving = commands.spawn([cell, position], { [cell]: [0, 0] })({ [position]: 0 });
            commands.spawn([cell, position], { [cell]: [1, 0] })({ [position]: 10 });
        }));
        await world.run(catchUp);
        await world.run(nudge);
        caught.length = 0;
        await world.run(catchUp);
        expect(caught.sort((a, b) => a - b)).toEqual([0.5, 10.5]);
        // Out of view from the start, its archetype's point is the oldest; the move is between two seen since.
        await world.run(System.create(({ commands }) => { commands.add(moving, cell, [1, 0]); }));
        caught.length = 0;
        await world.run(catchUp);
        expect(caught).toEqual([]);
    });
    it("runs on a joined thread for the systems placed there and the observer systems added there, catching up there too", async () => {
        const channel = new MessageChannel();
        await using world = createWorld({ [workers]: 0 });
        heard.length = notes.length = 0;
        const [joined] = await Promise.all([
            join(channel.port2, { threads: ["whereTest"] }).then(thread => {
                thread.add(hearInView);
                return thread;
            }),
            world.share(channel.port1),
        ]);
        await using thread = joined;
        await world.run(spawnNoted);
        await world.run(noteInView);
        await thread.run(readNotes);
        expect(notes.sort()).toEqual(["-1", "0", "1"]);
        await until(() => heard.length >= 3);
        expect(heard.sort((a, b) => a - b)).toEqual([-1, 0, 1]);
        heard.length = 0;
        // Every row changes; the observer hears those in view, and those coming into view when they do.
        await world.run(nudgeNoted);
        await until(() => heard.length >= 3);
        expect(heard.sort((a, b) => a - b)).toEqual([-0.5, 0.5, 1.5]);
        heard.length = 0;
        await world.run(look, { x: 3, radius: 1 });
        // A pass while its last post still runs skips it; later passes post it, as ticks would.
        const idle = System.create(() => {});
        const end = performance.now() + 2000;
        while (heard.length < 2 && performance.now() < end) await world.run(idle);
        expect(heard.sort((a, b) => a - b)).toEqual([2.5, 3.5]);
    });
    // From a tick past 2^32 too, the moves crossing it.
    for (const start of [0, 2 ** 32 - 8]) it(`counts a moved row as changed by its old archetype's point on a joined thread, from tick ${start}`, async () => {
        const channel = new MessageChannel();
        await using world = createWorld({ [workers]: 0 });
        startTicksAt(world, start);
        const [joined] = await Promise.all([join(channel.port2, { threads: ["whereTest"] }), world.share(channel.port1)]);
        await using thread = joined;
        let far = Entity.none;
        let moving = Entity.none;
        await world.run(System.create(({ commands }) => {
            far = commands.spawn([cell, position, note], { [cell]: [2, 0] })({ [position]: 20 });
            commands.spawn([cell, position, note], { [cell]: [0, 0] })({ [position]: 0 });
            moving = commands.spawn([cell, position, note], { [cell]: [-1, 0] })({ [position]: -10 });
            commands.spawn([cell, position, note], { [cell]: [1, 0] })({ [position]: 10 });
            commands.spawn([cell, position, note], { [cell]: [9, 0] })({ [position]: 90 });
        }));
        await world.run(look, { x: 1, radius: 1 });
        await world.run(noteChanged);
        await world.run(look, { x: 0, radius: 1 });
        await world.run(nudgeNoted);
        notedChanged.length = 0;
        await world.run(noteChanged);
        expect(notedChanged.sort((a, b) => a - b)).toEqual([-9.5, 0.5, 10.5]);
        // One moves in from an archetype out of view since the change, one between archetypes in view.
        await world.run(System.create(({ commands }) => {
            commands.add(far, cell, [0, 0]);
            commands.add(moving, cell, [1, 0]);
        }));
        await world.run(look, { x: 1, radius: 1 });
        notedChanged.length = 0;
        await world.run(noteChanged);
        expect(notedChanged).toContain(20.5);
        expect(notedChanged).not.toContain(-9.5);
        expect(notedChanged).not.toContain(10.5);
        void thread;
    });
    it("catches up a culled archetype on a resource filter's change on a joined thread", async () => {
        const channel = new MessageChannel();
        await using world = createWorld({ [workers]: 0 });
        signalled.length = 0;
        const [joined] = await Promise.all([
            join(channel.port2, { threads: ["whereTest"] }).then(thread => {
                thread.add(signalInView);
                return thread;
            }),
            world.share(channel.port1),
        ]);
        await using thread = joined;
        const idle = System.create(() => {});
        /** Runs until what the observer system signalled settles. */
        const settled = async (count: number): Promise<number[]> => {
            const end = performance.now() + 2000;
            while (signalled.length < count && performance.now() < end) await world.run(idle);
            return signalled.splice(0).sort((a, b) => a - b);
        };
        await world.run(spawnNoted);
        expect(await settled(3)).toEqual([-1, 0, 1]);
        await world.run(touch);
        expect(await settled(3)).toEqual([-1, 0, 1]);
        await world.run(look, { x: 3, radius: 1 });
        expect(await settled(2)).toEqual([2, 3]);
        void thread;
    });
    it("evaluates a predicate again after its own system wrote what it reads", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnNoted);
        followed.length = 0;
        await world.run(follow);
        expect(followed.sort((a, b) => a - b)).toEqual([-1, 0, 1]);
        followed.length = 0;
        await world.run(follow);
        expect(followed).toEqual([3]);
    });
});

