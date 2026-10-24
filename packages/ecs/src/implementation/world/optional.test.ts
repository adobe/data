// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity, Finalizer, Index, System, workers } from "../../index.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { runReported } from "./reports.test-helper.js";

const position = Symbol("optionalTest/position");
const velocity = Symbol("optionalTest/velocity");
const label = Symbol("optionalTest/label");
const order = Symbol("optionalTest/order");
const marker = Symbol("optionalTest/marker");
declare module "@adobe/ecs" {
    interface Threads {
        optionalTest: true;
    }
    interface Components {
        [marker]: { type: { readonly text: string } | null; thread: "optionalTest" };
        [position]: { type: number };
        [velocity]: { type: number };
        [label]: { type: string };
        [order]: { type: number };
    }
}

const spawn = System.create(({ commands }) => {
    commands.spawn([position, order])({ [position]: 1, [order]: 2 });
    commands.spawn([position, velocity, order])({ [position]: 10, [velocity]: 5, [order]: 1 });
    commands.spawn([position, velocity, label, order])({ [position]: 100, [velocity]: 50, [label]: "c", [order]: 0 });
    commands.spawn([velocity])({ [velocity]: 7 });
});

// Moves what has a velocity, and leaves the rest where they are.
const move = System.create({ components: { with: [position], optional: [velocity] } }, row => {
    const speed = row[velocity];
    if (speed !== undefined) row[position] += speed;
});

/** As `move`, asserted a kernel. */
const moveKernel = System.create({ kernel: true, components: { with: [position], optional: [velocity] } }, row => {
    const speed = row[velocity];
    if (speed !== undefined) row[position] += speed;
});
const writeKernel = System.create({ kernel: true, components: { with: [position], optional: [velocity] } }, row => {
    row[velocity] = row[position];
});

/** Rows naming another entity, whose optional velocity a lookup reads. */
const other = Symbol("optionalTest/other");
declare module "@adobe/ecs" {
    interface Components {
        [other]: { type: Entity };
    }
}
let pointed: Entity[] = [];
const spawnPointing = System.create(({ commands }) => {
    const still = commands.spawn([position])({ [position]: 1 });
    const moving = commands.spawn([position, velocity])({ [position]: 2, [velocity]: 7 });
    pointed = [still, moving];
    commands.spawn([other, order])({ [other]: still, [order]: 0 });
    commands.spawn([other, order])({ [other]: moving, [order]: 0 });
});
const copySpeed = System.create({
    kernel: false, components: { with: [other, order] }, lookup: { target: { with: [position], optional: [velocity] } },
}, (row, { lookup }) => {
    const found = lookup.target(row[other]);
    if (found !== null) row[order] = found[velocity] === undefined ? -found[position] : found[velocity];
});
const copySpeedKernel = System.create({
    kernel: true, components: { with: [other, order] }, lookup: { target: { with: [position], optional: [velocity] } },
}, (row, { lookup }) => {
    const found = lookup.target(row[other]);
    if (found !== null) row[order] = found[velocity] === undefined ? -found[position] : found[velocity];
});
const speeds: number[] = [];
const readSpeeds = System.create({ observer: true, components: { with: [other, order] } }, row => { speeds.push(row[order]); });

/** What finalizers read of rows that stopped, on the world's thread and on the markers'. */
const stopped: string[] = [];
const stoppedThere: string[] = [];
export const finalizeHere = Finalizer.create({ components: { with: [position, order], optional: [velocity] } }, row => {
    stopped.push(`${row[position]}:${row[velocity] ?? "none"}`);
});
export const finalizeThere = Finalizer.create({ components: { with: [position, marker], optional: [velocity] } }, row => {
    stoppedThere.push(`${row[position]}:${row[velocity] ?? "none"}:${row[marker] === null ? "null" : "marked"}`);
});
const despawnAll = System.create({ components: { with: [position] } }, (row, { commands }) => { commands.despawn(row.entity); });

let seen: (readonly [number, number | undefined, string | undefined])[] = [];
const read = System.create({ observer: true, components: { with: [position], optional: [velocity, label] } }, row => {
    seen.push([row[position], row[velocity], row[label]]);
});
const sorted = () => [...seen].sort((a, b) => a[0] - b[0]);

const inline = () => createWorld({ [workers]: 0 });

const spawnMarked = System.create(({ commands }) => {
    commands.spawn([position, marker])({ [position]: 1 });
    commands.spawn([position, velocity, marker])({ [position]: 10, [velocity]: 5 });
});
// Placed on the markers' thread by reading them.
const there = System.create({ components: { with: [position, marker], optional: [velocity] } }, row => {
    if (row[marker] === null) row[position] = row[velocity] ?? -1;
});

// On the markers' thread too, reading the row's own entity through a lookup with an optional component.
const lookedThere = System.create({ components: { with: [position, marker] }, lookup: { self: { with: [position], optional: [velocity] } } }, (row, { lookup }) => {
    if (row[marker] === null) row[position] = lookup.self(row.entity)?.[velocity] ?? -1;
});
// An observer system there reads copies of rows across archetypes, which tell which have the optional component.
let watched: (readonly [number, number | undefined])[] = [];
const watchThere = System.create({ observer: true, components: { with: [position], optional: [velocity] } }, row => {
    watched.push([row[position], row[velocity]]);
});
// A tail there: it writes only its thread's objects, so it runs after the sync point, reading copies of rows.
const labelThere = System.create({ components: { with: [position, marker], optional: [velocity] } }, row => {
    row[marker] = { text: `${row[position]}:${row[velocity] ?? "none"}` };
});
const labels: string[] = [];
const readLabels = System.create({ components: { with: [marker] } }, row => { labels.push(row[marker]?.text ?? "null"); });

/** A world shared with a thread on this one, which claims the thread markers live on. */
const joined = async (): Promise<{ readonly world: CreatedWorld; readonly remote: ReturnType<typeof join> }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["optionalTest"] });
    await new Promise<void>(resolve => {
        const stop = world.threads(threads => {
            if (threads.at(-1)?.status !== "joined") return;
            queueMicrotask(() => stop());
            resolve();
        });
    });
    return { world, remote };
};


/** Keys of systems whose rows have the same keys but other optional ones, and of stamps under two presence tests. */
const near = Symbol("optionalTest/near");
const far = Symbol("optionalTest/far");
const mark = Symbol("optionalTest/mark");
declare module "@adobe/ecs" {
    interface Components {
        [near]: { type: number };
        [far]: { type: number };
        [mark]: { type: number };
    }
}
const spawnApart = System.create(({ commands }) => {
    commands.spawn([near])({ [near]: 1 });
    commands.spawn([far])({ [far]: 7 });
});
const nearSeen: unknown[] = [];
const farSeen: unknown[] = [];
const fromFar = System.create({ kernel: false, components: { with: [near], optional: [far] } }, row => {
    const value = row[far];
    nearSeen.push(value);
    row[near] = value ?? -1;
});
const fromNear = System.create({ kernel: false, components: { with: [far], optional: [near] } }, row => {
    const at = row[near];
    farSeen.push([at, row[far]]);
    if (at !== undefined) row[near] = row[far];
});
const spawnStamped = System.create(({ commands }) => {
    commands.spawn([mark, near])({ [mark]: 0, [near]: 1 });
});
const markEither = System.create({ kernel: true, components: { with: [mark], optional: [near, far] } }, row => {
    if (row[near] !== undefined) row[mark] = 1;
    if (row[far] !== undefined) row[mark] = 2;
});
const marked: number[] = [];
const watchStamped = System.create({ observer: true, components: { with: [mark], changed: [mark] } }, row => { marked.push(row[mark]); });
const clearNear = System.create({ kernel: false, components: { with: [mark], optional: [near] } }, row => {
    if (row[near] !== undefined) row[near] = undefined;
});

describe("optional components", () => {
    it("never narrow what a system matches, and read undefined where an entity lacks one", async () => {
        await using world = inline();
        await world.run(spawn);
        seen = [];
        await world.run(read);
        expect(sorted()).toEqual([[1, undefined, undefined], [10, 5, undefined], [100, 50, "c"]]);
        await world.run(move);
        seen = [];
        await world.run(read);
        expect(sorted()).toEqual([[1, undefined, undefined], [15, 5, undefined], [150, 50, "c"]]);
    });

    it("are written where an entity has one, and fail their system where it doesn't", async () => {
        const write = System.create({ components: { with: [position], optional: [velocity] } }, row => {
            row[velocity] = row[position];
        });
        await using world = inline();
        await world.run(spawn);
        const report = await runReported(world, write);
        expect(report.failures.map(failure => failure.message)).toEqual([`An entity lacks "optionalTest/velocity", optional in its system: add it with commands.add rather than assigning it.`]);
    });

    it("pass change filters on other components, and are stamped changed when written", async () => {
        const changed: number[] = [];
        const watch = System.create({ observer: true, components: { with: [velocity], changed: [velocity] } }, row => { changed.push(row[velocity]); });
        const speedUp = System.create({ components: { with: [position], optional: [velocity] } }, row => {
            const speed = row[velocity];
            if (speed !== undefined && row[position] > 50) row[velocity] = speed + 1;
        });
        await using world = inline();
        await world.run(spawn);
        await world.run(watch);
        changed.length = 0;
        await world.run(speedUp);
        await world.run(watch);
        expect(changed).toEqual([51]);
    });

    it("run in an index's order across archetypes that have them and don't", async () => {
        const byOrder = Index.create({ key: [order], sorted: true });
        const ordered: (number | undefined)[] = [];
        const list = System.create({ observer: true, components: { with: [position], optional: [velocity] }, order: byOrder }, row => {
            ordered.push(row[velocity]);
        });
        await using world = inline();
        await world.run(spawn);
        await world.run(list);
        expect(ordered).toEqual([50, 5, undefined]);
    });

    it("conflict with systems using them as members do", () => {
        const writes = System.create({ components: { with: [position], optional: [velocity] } }, row => { row[velocity] = 0; });
        const reads = System.create({ components: { with: [velocity, position] } }, row => { row[position] = row[velocity]; });
        expect(() => System.create([writes, reads])).toThrow();
    });

    it("are read on a joined thread, where a system reading the thread's objects runs", async () => {
        const { world, remote } = await joined();
        await world.run(spawnMarked);
        await world.run(there);
        seen = [];
        await world.run(read);
        expect(sorted()).toEqual([[-1, undefined, undefined], [5, 5, undefined]]);
        await remote.dispose();
        await world.dispose();
    });

    it("are read by lookups on a joined thread, undefined where the entity lacks one", async () => {
        const { world, remote } = await joined();
        await world.run(spawnMarked);
        await world.run(lookedThere);
        seen = [];
        await world.run(read);
        expect(sorted()).toEqual([[-1, undefined, undefined], [5, 5, undefined]]);
        await remote.dispose();
        await world.dispose();
    });

    it("are read by observer systems on a joined thread, undefined where an archetype lacks one", async () => {
        const { world, remote } = await joined();
        await world.run(spawnMarked);
        watched = [];
        await remote.run(watchThere);
        expect([...watched].sort((a, b) => a[0] - b[0])).toEqual([[1, undefined], [10, 5]]);
        await remote.dispose();
        await world.dispose();
    });

    it("are read by tails on a joined thread, undefined where an archetype lacks one", async () => {
        const { world, remote } = await joined();
        await world.run(spawnMarked);
        const report = await runReported(world, labelThere);
        expect(report.warnings).toEqual([]);
        labels.length = 0;
        await world.run(readLabels);
        expect(labels.sort()).toEqual(["10:5", "1:none"]);
        await remote.dispose();
        await world.dispose();
    });

    it("compile to kernels, which read undefined where an archetype lacks one, as a body run as written does", async () => {
        expect(kernelOf(move)).toBeDefined();
        expect(kernelOf(moveKernel)).toBeDefined();
        for (const system of [move, moveKernel]) {
            await using world = inline();
            await world.run(spawn);
            await world.run(system);
            seen = [];
            await world.run(read);
            expect(sorted()).toEqual([[1, undefined, undefined], [15, 5, undefined], [150, 50, "c"]]);
        }
    });

    it("are read by finalizers where an entity had them, never deciding a stop", async () => {
        await using world = inline();
        await world.run(spawn);
        stopped.length = 0;
        await world.run(despawnAll);
        expect(stopped.sort()).toEqual(["100:50", "10:5", "1:none"]);
    });

    it("are read by finalizers on a joined thread where an entity had them", async () => {
        const { world, remote } = await joined();
        await world.run(spawnMarked);
        stoppedThere.length = 0;
        await world.run(despawnAll);
        await remote.run(System.create({ observer: true }, () => {}));
        expect(stoppedThere.sort()).toEqual(["10:5:null", "1:none:null"]);
        await remote.dispose();
        await world.dispose();
    });

    it("are read by lookups by entity, undefined where the entity lacks one, as written and in kernels", async () => {
        for (const system of [copySpeed, copySpeedKernel]) {
            await using world = inline();
            await world.run(spawnPointing);
            await world.run(system);
            speeds.length = 0;
            await world.run(readSpeeds);
            expect(speeds.sort((a, b) => a - b)).toEqual([-1, 7]);
        }
    });

    it("fail a kernel's system where it assigns one an entity lacks", async () => {
        await using world = inline();
        await world.run(spawn);
        const report = await runReported(world, writeKernel);
        expect(report.failures.map(failure => failure.message)).toEqual([`An entity lacks "optionalTest/velocity", optional in its system: add it with commands.add rather than assigning it.`]);
    });

    it("give systems with the same keys but other optional ones rows of their own", async () => {
        await using world = inline();
        await world.run(spawnApart);
        const first = await runReported(world, fromFar);
        const second = await runReported(world, fromNear);
        expect([...first.failures, ...second.failures]).toEqual([]);
        expect(nearSeen).toEqual([undefined]);
        expect(farSeen).toEqual([[undefined, 7]]);
    });

    it("stamp a chunk changed where tests of two of them write one component", async () => {
        await using world = inline();
        await world.run(spawnStamped);
        await world.run(watchStamped);
        marked.length = 0;
        await world.run(markEither);
        await world.run(watchStamped);
        expect(marked).toEqual([1]);
    });

    it("fail their system when assigned undefined, which removes nothing", async () => {
        await using world = inline();
        await world.run(spawnStamped);
        const report = await runReported(world, clearNear);
        expect(report.failures.map(failure => failure.message)).toEqual([`"optionalTest/near" was assigned undefined, which removes nothing: remove it with commands.remove.`]);
    });

});
