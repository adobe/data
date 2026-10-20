import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { gate, tallies, watchTally } from "./synced-contained.test-helper.js";

/**
 * A thread joining a world through the port it's sent, which adds the watcher with the gate it's sent, and tells what it
 * saw. It says it added the watcher once a run of its own resolved: sent after the add through the same port, so the
 * world placed the watcher by that run's sync point, which posts the watcher's first run.
 */

type Port = MessagePort | NodeMessagePort;
export type ToContainedWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "add"; readonly gate: Int32Array }
    | { readonly kind: "seen" };
export type FromContainedWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "added" }
    | { readonly kind: "seen"; readonly tallies: readonly number[] };

const channel = scopeChannel<FromContainedWorker, ToContainedWorker>();
let remote: World | null = null;
const placed = System.create({ name: "syncedContainedTest/placed", synced: true }, () => {});

channel.onMessage(message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        remote = join(message.port, {});
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "add") {
        gate.words = message.gate;
        remote?.add(watchTally);
        void remote?.run(placed).then(() => channel.post({ kind: "added" }));
    }
    else channel.post({ kind: "seen", tallies: [...tallies] });
});
