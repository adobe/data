// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { entitled, headlined, released, type Released } from "./remote-finalizers.test-helper.js";

/**
 * A thread joining a world through the port it's sent, claiming "remoteFinalizersTest", whose finalizer it imports: it
 * tells what its finalizers saw when asked, or spins, without yielding, for a while or for good.
 */

type Port = MessagePort | NodeMessagePort;
export type ToRemoteFinalizersWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "released" }
    | { readonly kind: "entitled" }
    | { readonly kind: "headlined" }
    | { readonly kind: "pause"; readonly milliseconds: number }
    | { readonly kind: "spin" };
export type FromRemoteFinalizersWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "released"; readonly released: readonly Released[] }
    | { readonly kind: "entitled"; readonly entitled: readonly { readonly serial: number; readonly title: string }[] }
    | { readonly kind: "headlined"; readonly headlined: readonly { readonly serial: number; readonly heading: string }[] }
    | { readonly kind: "spinning" };

const channel = scopeChannel<FromRemoteFinalizersWorker, ToRemoteFinalizersWorker>();
channel.onMessage(message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        join(message.port, { threads: ["remoteFinalizersTest"] });
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "released") channel.post({ kind: "released", released });
    else if (message.kind === "entitled") channel.post({ kind: "entitled", entitled });
    else if (message.kind === "headlined") channel.post({ kind: "headlined", headlined });
    else if (message.kind === "pause") {
        channel.post({ kind: "spinning" });
        // Runs nothing meanwhile, finalizers included, then goes on.
        const until = performance.now() + message.milliseconds;
        while (performance.now() < until) { /* busy */ }
    }
    else {
        channel.post({ kind: "spinning" });
        // Never yields again, from before the world stops anything, so nothing here runs: no finalizer, no acknowledgement.
        for (;;) { /* never yields */ }
    }
});
