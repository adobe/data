import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { requireDefinition } from "../../interface/registry/index.js";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { changed, seen, tailSystems, type Seen } from "./tails.test-helper.js";
import { tailSnapshots } from "./thread-systems.js";

/**
 * A thread joining a world through the port it's sent, claiming "tailsTest", whose systems it imports: it tells what
 * its tails saw, and how often they read from a snapshot, when asked.
 */

type Port = MessagePort | NodeMessagePort;
export type ToTailsWorker = { readonly kind: "join"; readonly port: Port } | { readonly kind: "seen" };
export type FromTailsWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "seen"; readonly seen: readonly Seen[]; readonly changed: readonly (readonly [number, number])[]; readonly late: number; readonly switched: number };

const channel = scopeChannel<FromTailsWorker, ToTailsWorker>();
channel.onMessage(message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        for (const system of tailSystems) requireDefinition(system);
        join(message.port, { threads: ["tailsTest"] });
        channel.post({ kind: "joined" });
    }
    else channel.post({ kind: "seen", seen, changed: [...changed], late: tailSnapshots.late, switched: tailSnapshots.switched });
});
