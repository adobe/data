import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { released, type Released } from "./remote-finalizers.test-helper.js";

/**
 * A thread joining a world through the port it's sent, claiming "remoteFinalizersTest", whose finalizer it imports: it
 * tells what that finalizer saw when asked, or spins without yielding.
 */

type Port = MessagePort | NodeMessagePort;
export type ToRemoteFinalizersWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "released" }
    | { readonly kind: "spin" };
export type FromRemoteFinalizersWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "released"; readonly released: readonly Released[] }
    | { readonly kind: "spinning" };

const channel = scopeChannel<FromRemoteFinalizersWorker, ToRemoteFinalizersWorker>();
channel.onMessage(message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        join(message.port, { threads: ["remoteFinalizersTest"] });
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "released") channel.post({ kind: "released", released });
    else {
        channel.post({ kind: "spinning" });
        // Never yields again, from before the world stops anything, so nothing here runs: no finalizer, no acknowledgement.
        for (;;) { /* never yields */ }
    }
});
