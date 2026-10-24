// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Finalizer, System, workers } from "../../index.js";
import { createWorld, join } from "./create.js";
import { runReported } from "./reports.test-helper.js";

const held = Symbol("unidentifiedFinalizers/held");
declare module "@adobe/ecs" {
    interface Threads { unidentifiedFinalizers: true }
    interface Components { [held]: { type: { readonly text: string } | null; thread: "unidentifiedFinalizers" } }
}

const nothing = System.create(() => {});
const spawn = System.create(({ commands }) => { commands.spawn([held])({ [held]: null }); });
const seen: unknown[] = [];
/** A finalizer reading the thread's objects, made where the build gives it no id. */
const unidentified = (): void => { Finalizer.create({ components: { with: [held] } }, row => { seen.push(row[held]); }); };

/** A world shared with a thread on this one claiming the thread, and its status once settled: joined or gone. */
const shared = async () => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    let status = "";
    const settled = new Promise<void>(resolve => {
        world.threads(threads => {
            status = threads.at(-1)?.status ?? "";
            if (status === "joined" || status === "gone") resolve();
        });
    });
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: ["unidentifiedFinalizers"] });
    await settled;
    return { world, remote, status: () => status };
};

describe("a finalizer without an id on a thread a joined thread fills", () => {
    // Created after the claim, so the claim is made; the next run reports it once and the world goes on without it.
    it("fails once, in a report, and leaves the world running", async () => {
        const { world, remote, status } = await shared();
        expect(status()).toBe("joined");
        await remote.run(spawn);
        unidentified();
        const first = await runReported(world, nothing);
        expect(first.failures.map(failure => [failure.kind, failure.message.includes("has no id")])).toEqual([["finalizer", true]]);
        expect((await runReported(world, nothing)).failures).toEqual([]);
        await remote.run(nothing);
        await world.dispose();
    }, 10_000);

    // Finalizers are program-wide, so the one the test above made is present when this thread claims: the claim is
    // refused, and the joined thread's runs say why.
    it("refuses a later claim of its thread, saying why", async () => {
        const { world, remote, status } = await shared();
        expect(status()).toBe("gone");
        await expect(remote.run(nothing)).rejects.toThrow(/has no id, so a joined thread can't run it/);
        await world.run(nothing);
        await world.dispose();
    }, 10_000);
});
