import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Observe } from "../../observe/index.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { tablesAfterCollecting } from "./lifetime.test-helper.js";
import { backToBack } from "./loop.js";

const value = Symbol("removeTest/value");
const parent = Symbol("removeTest/parent");
const shared = Symbol("removeTest/shared");

declare module "@adobe/data-ecs" {
    interface Components {
        [value]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [shared]: { type: number };
    }
}

Component.register(value, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(shared, { type: { type: "number" } });

/** How many times each system's body was called. */
const calls = { kept: 0, held: 0, alone: 0, other: 0, late: 0, self: 0, writer: 0, reader: 0 };
/** The world the systems that remove others act on. */
let current: World | null = null;
/** What `selfRemoving` removes, once its body has been called this many times. */
let removeAfter = Infinity;

const seed = System.create({ name: "removeTest/seed" }, ({ commands }) => {
    const root = commands.spawn([value, shared])({ [value]: 0, [shared]: 0 });
    for (let i = 1; i < 10; i++) commands.spawn([value, parent, shared])({ [value]: i, [parent]: root, [shared]: 0 });
});

/** Run before tables are taken, so `value` and `parent` keep ticks then, as they do once any system filters on them. */
const ticksValue = System.create({ name: "removeTest/ticksValue", components: { added: [value, parent] } }, () => {});

/** Added for the whole of each test, so ticks go on. */
const kept = System.create({ name: "removeTest/kept" }, () => { calls.kept++; });

/** Holds what systems can on the world's thread: an `up` order, a change filter's count, command buffers. */
const held = System.create({ name: "removeTest/held", components: { read: [value], changed: [value] }, up: { through: parent, read: [value] } }, (row, { up }) => {
    calls.held++;
    void (row[value] + (up?.[value] ?? 0));
});

const alone = System.create({ name: "removeTest/alone" }, () => { calls.alone++; });
const other = System.create({ name: "removeTest/other" }, () => { calls.other++; });
const pair = System.create({ name: "removeTest/pair", systems: [alone, other] });

/** In a later tier than `remover`, which removes it during the tick. */
const late = System.create({ name: "removeTest/late", components: { read: [value] } }, row => { calls.late += row[value] >= 0 ? 1 : 0; });
const remover = System.create({ name: "removeTest/remover", before: [late] }, () => { current?.remove(late); });

/** Removes itself partway through its rows. */
const selfRemoving = System.create({ name: "removeTest/selfRemoving", components: { read: [value] } }, row => {
    calls.self += row[value] >= 0 ? 1 : 0;
    if (calls.self === removeAfter) current?.remove(selfRemoving);
});

/** Ordered only through `phase`: removing `phase` would leave them conflicting with no order between them. */
const phase = System.create({ name: "removeTest/phase" }, () => {});
const writer = System.create({ name: "removeTest/writer", components: { write: [shared] }, before: [phase] }, row => { calls.writer++; row[shared] += 1; });
const reader = System.create({ name: "removeTest/reader", components: { read: [shared] }, after: [phase] }, row => { calls.reader++; void row[shared]; });

/** A world ticking back to back once something is added, with `kept` added. */
const ticking = async (): Promise<{ readonly world: CreatedWorld; readonly ticks: (count: number) => Promise<void>; readonly close: () => Promise<void> }> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    current = world;
    await world.run(seed);
    world.add(kept);
    /** Waits for `count` more ticks. */
    const ticks = async (count: number): Promise<void> => {
        const first = (await Observe.toPromise(Observe.resource(world, clock))).tick;
        await new Promise<void>(resolve => {
            const stop = Observe.resource(world, clock)(({ tick }) => {
                if (tick < first + count) return;
                queueMicrotask(() => stop());
                resolve();
            });
        });
    };
    await ticks(2);
    return { world, ticks, close: async () => { await world.dispose(); driver.close(); current = null; } };
};

describe("world.remove", () => {
    it("never calls a removed system's body again, and releases what it held", async () => {
        const { world, ticks, close } = await ticking();
        await world.run(ticksValue);
        const before = await tablesAfterCollecting(world);
        world.add(held);
        await ticks(3);
        expect(calls.held).toBeGreaterThan(0);
        world.remove(held);
        const removed = calls.held;
        await ticks(3);
        expect(calls.held).toBe(removed);
        expect(await tablesAfterCollecting(world)).toEqual(before);
        await close();
    });

    it("keeps a system added alone and within an added composite until both are removed", async () => {
        const { world, ticks, close } = await ticking();
        world.add(pair);
        world.add(alone);
        await ticks(2);
        world.remove(alone);
        const [aloneThen, otherThen] = [calls.alone, calls.other];
        await ticks(2);
        expect(calls.alone).toBeGreaterThan(aloneThen);
        world.remove(pair);
        const [aloneAfter, otherAfter] = [calls.alone, calls.other];
        await ticks(2);
        expect([calls.alone, calls.other]).toEqual([aloneAfter, otherAfter]);
        expect(otherAfter).toBeGreaterThan(otherThen);
        await close();
    });

    it("does nothing for a value that isn't added, and throws for one no constructor returned", async () => {
        const { world, ticks, close } = await ticking();
        world.remove(other);
        world.remove(kept);
        world.remove(kept);
        expect(() => world.remove({ name: "not a system" })).toThrow("isn't a system");
        world.add(kept);
        await ticks(1);
        await close();
    });

    it("throws, removing nothing, when the systems left would conflict with no order between them", async () => {
        const { world, ticks, close } = await ticking();
        world.add(writer);
        world.add(phase);
        world.add(reader);
        await ticks(1);
        expect(() => world.remove(phase)).toThrow('both access "removeTest/shared"');
        const [written, read] = [calls.writer, calls.reader];
        await ticks(2);
        expect(calls.writer).toBeGreaterThan(written);
        expect(calls.reader).toBeGreaterThan(read);
        world.remove(reader);
        world.remove(phase);
        world.remove(writer);
        await close();
    });

    it("skips a system removed during a tick in progress from its next tier on", async () => {
        const { world, ticks, close } = await ticking();
        world.add(late);
        await ticks(2);
        const before = calls.late;
        expect(before).toBeGreaterThan(0);
        // In the tick `remover` runs, `late` follows it in a later tier.
        world.add(remover);
        await ticks(3);
        expect(calls.late).toBe(before);
        world.remove(remover);
        await close();
    });

    it("calls no row of a system that removed itself partway through its rows", async () => {
        const { world, ticks, close } = await ticking();
        calls.self = 0;
        removeAfter = 3;
        world.add(selfRemoving);
        await ticks(3);
        expect(calls.self).toBe(3);
        removeAfter = Infinity;
        await close();
    });

    it("skips a removed system in a run of a composite holding it that was queued before", async () => {
        const { world, close } = await ticking();
        world.add(pair);
        const ran = world.run(pair);
        world.remove(pair);
        const [aloneThen, otherThen] = [calls.alone, calls.other];
        await ran;
        expect([calls.alone, calls.other]).toEqual([aloneThen, otherThen]);
        // Run again, it's registered anew.
        await world.run(pair);
        expect([calls.alone, calls.other]).toEqual([aloneThen + 1, otherThen + 1]);
        await close();
    });
});
