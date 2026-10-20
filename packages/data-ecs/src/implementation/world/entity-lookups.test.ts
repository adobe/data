import { describe, expect, it } from "vitest";
import { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { backToBack } from "./loop.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { bumpKernel, edit, expected, lateProbe, probe, scenario, scene, threadProbe } from "./entity-lookups.test-helper.js";

const keepTicking = System.create({ name: "entityLookupsTest/keepTicking" }, () => {});

/** A world shared with a thread on this one, through a MessageChannel, which claims the probes' thread. */
const joined = async () => {
    const world: CreatedWorld = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["entityLookupsTest"] });
    await new Promise<void>(resolve => {
        let done = false;
        const stop = world.threads(threads => {
            if (done || threads.at(-1)?.status !== "joined") return;
            done = true;
            queueMicrotask(() => stop());
            resolve();
        });
    });
    return { world, remote };
};

describe("lookups by entity with changed", () => {
    it("report a listed component's writes since the system last ran, on the world's thread", async () => {
        const world = createWorld({ [workers]: 0 });
        const { seen, reused } = await scenario(world, probe);
        expect(reused).toBe(true);
        expect(seen).toEqual(expected);
        // A system registered now sees every row as changed on its first run, then nothing.
        scene.seen = [];
        await world.run(lateProbe);
        await world.run(lateProbe);
        expect(scene.seen).toEqual([expected.at(-2), expected.at(-1)]);
        await world.dispose();
    });
    it("report the same on a joined thread", async () => {
        const { world, remote } = await joined();
        const { seen, reused } = await scenario(world, threadProbe);
        expect(reused).toBe(true);
        expect(seen).toEqual(expected);
        expect((await world.run(threadProbe)).warnings.map(warning => warning.name)).toEqual(["entityLookupsTest/threadProbe"]);
        await remote.dispose();
        await world.dispose();
    });
    for (const wasm of [false, true]) {
        it(`see a ${wasm ? "WASM" : "JS"} kernel's writes to what they watch, which keeps its stamps`, async () => {
            const world = createWorld({ [workers]: 0 }, { wasm });
            await world.run(edit, { action: "spawn" });
            scene.seen = [];
            await world.run(probe);
            await world.run(probe);
            await world.run(bumpKernel);
            await world.run(probe);
            await world.run(probe);
            expect(scene.seen.map(seen => [seen.found, seen.value])).toEqual([[true, 1], [false, 1], [true, 2], [false, 2]]);
            await world.dispose();
        });
    }
    it("watch what they name while their system lives", async () => {
        const driver = backToBack();
        await using world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
        await world.run(edit, { action: "spawn" });
        /** Once `count` more ticks ran. */
        const ticks = async (count: number): Promise<void> => {
            const first = (await Observe.toPromise(world.observe.resource(clock))).tick;
            await new Promise<void>(resolve => {
                const stop = world.observe.resource(clock)(({ tick }) => {
                    if (tick < first + count) return;
                    queueMicrotask(() => stop());
                    resolve();
                });
            });
        };
        world.add(keepTicking);
        await ticks(1);
        const before = (await world.tables()).observed;
        world.add(probe);
        await ticks(2);
        expect((await world.tables()).observed).toBe(before + 2);
        world.remove(probe);
        await ticks(2);
        expect((await world.tables()).observed).toBe(before);
        driver.close();
    });
});
