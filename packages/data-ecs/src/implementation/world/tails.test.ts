import { describe, expect, it } from "vitest";
import { threadStatus } from "../../interface/components/index.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { report } from "../../interface/resources/report.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";
import { backToBack } from "./loop.js";
import { blocking, seed, seen, setFailAt, ticked } from "./tails.test-helper.js";

// Tails, with the world and the thread filling "tailsTest" on this one, joined through a MessageChannel.

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

const joined = async (options: Parameters<typeof createWorld>[1] = {}, resources: Parameters<typeof createWorld>[0] = {}): Promise<{ readonly world: World; readonly remote: World }> => {
    const world = createWorld({ [workers]: 0, ...resources }, options);
    const channel = new MessageChannel();
    const thread = world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["tailsTest"] });
    await statusOf(world, thread, "joined");
    return { world, remote };
};

describe("tails", () => {
    it("run terminal systems on a joined thread after the sync point, unwarned, each seeing one tick's values; a run waits for them", async () => {
        seen.length = 0;
        const { world, remote } = await joined();
        await world.run(seed, { count: 300 });
        for (let k = 0; k < 5; k++) expect(await world.run(ticked)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(seen.map(({ counter, rows, wrong, labels }) => [counter, rows, wrong, labels])).toEqual([1, 2, 3, 4, 5].map(value => [value, 300, 0, 0]));
        await remote.dispose();
        await world.dispose();
    });
    it("block in their tier where a body reaches its commands, which isn't terminal", async () => {
        const { world, remote } = await joined();
        expect((await world.run(blocking)).warnings.map(warning => warning.name)).toEqual(["tailsTest/blocking"]);
        await remote.dispose();
        await world.dispose();
    });
    it("report what they throw in their run's report, and in their tick's report resource, written after them", async () => {
        seen.length = 0;
        const driver = backToBack();
        const { world, remote } = await joined({ loop: driver }, { [always]: true });
        await world.run(seed, { count: 10 });
        await world.run(setFailAt, { at: 1 });
        const ran = await world.run(ticked);
        expect(ran.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["system", "tailsTest/watch", "tailsTest failure at 1"]]);
        await world.run(setFailAt, { at: 6 });
        world.add(ticked);
        const failed = await until(world.observe.resource(report), value => value.failures.length > 0);
        expect(failed.failures.map(failure => [failure.kind, failure.name, failure.message])).toEqual([["system", "tailsTest/watch", "tailsTest failure at 6"]]);
        await remote.dispose();
        await world.dispose();
        driver.close();
    });
    it("are skipped with a \"thread\" failure once their thread is gone, then run on the world's thread", async () => {
        seen.length = 0;
        const { world, remote } = await joined();
        await world.run(seed, { count: 10 });
        await world.run(ticked);
        const leaving = remote.dispose();
        const report = await world.run(ticked);
        await leaving;
        expect(report.failures.map(failure => [failure.kind, failure.name])).toEqual([["thread", "tailsTest/lead"], ["thread", "tailsTest/watch"]]);
        expect(report.skipped).toEqual(["tailsTest/lead", "tailsTest/watch"]);
        expect(await world.run(ticked)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(seen.map(({ counter, rows, wrong }) => [counter, rows, wrong])).toEqual([[1, 10, 0], [3, 10, 0]]);
        // A registration waits for tails in flight, of which a thread that's gone has none.
        expect((await world.run(blocking)).failures).toEqual([]);
        await world.dispose();
    });
});
