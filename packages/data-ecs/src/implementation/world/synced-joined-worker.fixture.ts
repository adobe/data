import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import type { Entity } from "../../interface/entity/entity.js";
import type { World } from "../../interface/world/world.js";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { gate, hold, lookRows, looked, seen, stamp, watchRows, type Seen } from "./synced-joined.test-helper.js";
import { tailSnapshots } from "./thread-systems.js";

/**
 * A thread joining a world through the port it's sent, claiming nothing, which adds one of its own synced systems
 * when asked, with the gate its runs wait on; holds its event loop when asked, until the gate releases it; and tells
 * what they saw, and how often they read from a copy, when asked.
 */

type Port = MessagePort | NodeMessagePort;
export type ToSyncedWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "add"; readonly system: "rows" | "lookups"; readonly gate: Int32Array }
    | { readonly kind: "hold" }
    | { readonly kind: "seen" };
export type FromSyncedWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "added" }
    | { readonly kind: "holding" }
    | { readonly kind: "seen"; readonly seen: readonly Seen[]; readonly switched: number; readonly late: number; readonly timers: number };

const channel = scopeChannel<FromSyncedWorker, ToSyncedWorker>();
let remote: World | null = null;
/** Timers that ran here since the system was added: this thread returns to its event loop while the world ticks. */
let timers = 0;
const timer = (): void => {
    timers++;
    setTimeout(timer, 0);
};

/** The entities the world holds, once it holds `count`. */
const entities = (world: World, count: number): Promise<readonly Entity[]> => new Promise(resolve => {
    let done = false;
    const stop = world.observe.select({ required: [stamp] })(found => {
        if (done || found.length < count) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(found);
    });
});

channel.onMessage(async message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        remote = join(message.port, {});
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "add") {
        if (remote === null) return;
        gate.words = message.gate;
        if (message.system === "lookups") looked.push(...await entities(remote, 1000));
        remote.add(message.system === "rows" ? watchRows : lookRows);
        setTimeout(timer, 0);
        channel.post({ kind: "added" });
    }
    else if (message.kind === "hold") {
        channel.post({ kind: "holding" });
        hold();
    }
    else channel.post({ kind: "seen", seen, switched: tailSnapshots.switched, late: tailSnapshots.late, timers });
});
