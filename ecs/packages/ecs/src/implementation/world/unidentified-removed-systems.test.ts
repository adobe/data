// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, workers } from "../../index.js";
import { createWorld, join } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";

const held = Symbol("unidentifiedRemovedSystems/held");
declare module "@adobe/ecs" {
    interface Threads { unidentifiedRemovedSystems: true }
    interface Components { [held]: { type: { readonly text: string } | null; thread: "unidentifiedRemovedSystems" } }
}

const nothing = System.create(() => {});
const spawn = System.create(({ commands }) => { commands.spawn([held])({ [held]: null }); });
const seen: unknown[] = [];
/** A removed system reading the thread's objects, made where the build gives it no id. */
const unidentified = (): System<never> => System.removed({ components: { with: [held] } }, row => { seen.push(row[held]); });

/** `"joined"` once a share or join resolved, or the message it rejected with. */
const outcomeOf = (promise: Promise<unknown>): Promise<string> => promise.then(() => "joined", (error: unknown) => error instanceof Error ? error.message : String(error));

/**
 * A world shared with a thread on this one claiming the thread, `added` added first: what its share and its join gave,
 * and the joined world.
 */
const shared = async (added: readonly System<never>[] = []) => {
    const world = createWorld({ [workers]: 0 });
    for (const system of added) world.add(system);
    const channel = new MessageChannel();
    const sharing = outcomeOf(world.share(channel.port1));
    const joining = join(channel.port2, { threads: ["unidentifiedRemovedSystems"] });
    const joined = await outcomeOf(joining);
    const remote = joined === "joined" ? await joining : null;
    return { world, remote, shared: await sharing, joined };
};

describe("a removed system without an id on a thread a joined thread fills", () => {
    // Added after the claim, so the claim is made; the next run reports it once and the world goes on without it.
    it("fails once, in a report, and leaves the world running", async () => {
        const { world, remote, shared: share } = await shared();
        expect(share).toBe("joined");
        if (remote === null) throw new Error("The thread didn't join.");
        await remote.run(spawn);
        world.add(unidentified());
        const first = await runReported(world, nothing);
        expect(first.failures.map(failure => [failure.kind, failure.message.includes("has no id")])).toEqual([["sync system", true]]);
        expect((await runReported(world, nothing)).failures).toEqual([]);
        await remote.run(nothing);
        await world.dispose();
    }, 10_000);

    // Added before this thread claims: the claim is refused, and both the world's share and the thread's join say why.
    it("refuses a later claim of its thread, rejecting its share and its join, saying why", async () => {
        const { world, remote, shared: share, joined } = await shared([unidentified()]);
        expect(share).toMatch(/has no id, so a joined thread can't run it/);
        expect(joined).toBe(share);
        expect(remote).toBeNull();
        await world.run(nothing);
        await world.dispose();
    }, 10_000);
});
