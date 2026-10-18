import { describe, expect, it } from "vitest";
import { threadStatus } from "../../interface/components/index.js";
import type { Entity } from "../../interface/entity/entity.js";
import type { Observe } from "../../interface/observe/observe.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";
import { scenario } from "./thread-systems.test-helper.js";

// Systems on a joined thread, with the world and the thread on this one, joined through a MessageChannel.

/** The first value an observer gives that `accept` takes. */
const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

const statusOf = (world: World, thread: Entity, status: "joined" | "gone") =>
    until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === status);

/** A world shared with a thread on this one, which claims the systems' thread. */
const joined = async (): Promise<{ readonly world: World; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    const thread = world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["threadSystemsTest"] });
    await statusOf(world, thread, "joined");
    return { world, remote };
};

describe("systems on a joined thread", () => {
    it("give an inline world's results: rows, commands, spawns, reductions, resources, lookups, filters, conditions and failures", async () => {
        const inline = createWorld({ [workers]: 0 });
        const expected = await scenario(inline, inline);
        await inline.dispose();
        const { world, remote } = await joined();
        const actual = await scenario(world, remote);
        expect(actual.snapshots).toEqual(expected.snapshots);
        expect(actual.reports).toEqual(expected.reports);
        expect(expected.warnings.every(names => names.length === 0)).toBe(true);
        // Every tick waits for the joined thread's tiers.
        expect(actual.warnings[1]).toEqual(["threadSystemsTest/describe", "threadSystemsTest/relabel", "threadSystemsTest/breed", "threadSystemsTest/tally", "threadSystemsTest/watchCaptions", "threadSystemsTest/repaint", "threadSystemsTest/peek"]);
        await remote.dispose();
        await world.dispose();
    });
});
