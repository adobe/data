// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { requireDefinition } from "../../interface/registry/index.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, join } from "./create.js";
import { scopeChannel } from "./port.js";
import { changed, gate, seed, seen, tailSystems, ticked, type Seen } from "./tails.test-helper.js";
import { tailSnapshots } from "./thread-systems.js";
import { reportOf, runReported } from "./reports.test-helper.js";

/**
 * A thread joining a world through the port it's sent, claiming "tailsTest", whose systems it imports: it tells what
 * its tails saw, and how often they read from a snapshot, when asked. Or one holding both a world and the thread
 * joining it, which leaves while two runs of its tails are queued: it tells what each reported, once both settled and
 * the world placed the tails here again.
 */

type Port = MessagePort | NodeMessagePort;
export type ToTailsWorker = { readonly kind: "join"; readonly port: Port } | { readonly kind: "seen" } | { readonly kind: "leave queued" } | { readonly kind: "gate"; readonly words: Int32Array };
export type FromTailsWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "gated" }
    | { readonly kind: "left"; readonly skipped: readonly (readonly string[])[]; readonly after: number }
    | { readonly kind: "seen"; readonly seen: readonly Seen[]; readonly changed: readonly (readonly [number, number])[]; readonly late: number; readonly switched: number };

const channel = scopeChannel<FromTailsWorker, ToTailsWorker>();
/**
 * The world and the joined thread on this one: the thread leaves while two runs are queued, so the second posts its
 * tails to a thread already gone. Then a run waits for every tail in flight, as the world placing them here again does.
 */
const leaveQueued = async (): Promise<FromTailsWorker> => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const remote = join(port2, { threads: ["tailsTest"] });
    await new Promise<void>(resolve => {
        const stop = world.threads(threads => {
            if (threads[0]?.status !== "joined") return;
            queueMicrotask(() => stop());
            resolve();
        });
    });
    await world.run(seed, { count: 10 });
    await world.run(ticked);
    const leaving = remote.dispose();
    const runs = [world.run(ticked), world.run(ticked)];
    const reports = await Promise.all((await Promise.all(runs)).map(run => reportOf(world, run)));
    await leaving;
    const after = await runReported(world, ticked);
    await world.dispose();
    return { kind: "left", skipped: reports.map(report => report.skipped), after: after.failures.length };
};

channel.onMessage(async message => {
    if ("protocol" in message) return;
    if (message.kind === "leave queued") channel.post(await leaveQueued());
    else if (message.kind === "join") {
        for (const system of tailSystems) requireDefinition(system);
        join(message.port, { threads: ["tailsTest"] });
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "gate") {
        gate.words = message.words;
        channel.post({ kind: "gated" });
    }
    else channel.post({ kind: "seen", seen, changed: [...changed], late: tailSnapshots.late, switched: tailSnapshots.switched });
});
