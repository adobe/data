// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { entitled, gauged, headlined, headlinedBoth, released, surveyed, type Released, type Surveyed } from "./remote-finalizers.test-helper.js";

/**
 * A thread joining a world through the port it's sent, claiming "remoteFinalizersTest", whose finalizer it imports: it
 * tells what its finalizers saw when asked, blocks until a shared flag is set, or spins, without yielding, for good.
 */

type Port = MessagePort | NodeMessagePort;
export type ToRemoteFinalizersWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "released" }
    | { readonly kind: "entitled" }
    | { readonly kind: "headlined" }
    | { readonly kind: "gauged" }
    | { readonly kind: "hold"; readonly flag: Int32Array }
    | { readonly kind: "spin" };
export type FromRemoteFinalizersWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "released"; readonly released: readonly Released[] }
    | { readonly kind: "entitled"; readonly entitled: readonly { readonly serial: number; readonly title: string }[] }
    | {
        readonly kind: "headlined";
        readonly headlined: readonly { readonly serial: number; readonly heading: string }[];
        readonly both: readonly { readonly serial: number; readonly heading: string; readonly subheading: string }[];
    }
    | {
        readonly kind: "gauged";
        readonly gauged: readonly { readonly serial: number; readonly level: number; readonly origin: readonly number[] }[];
        readonly surveyed: readonly Surveyed[];
    }
    | { readonly kind: "held" }
    | { readonly kind: "spinning" };

const channel = scopeChannel<FromRemoteFinalizersWorker, ToRemoteFinalizersWorker>();
channel.onMessage(async message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        await join(message.port, { threads: ["remoteFinalizersTest"] });
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "released") channel.post({ kind: "released", released });
    else if (message.kind === "entitled") channel.post({ kind: "entitled", entitled });
    else if (message.kind === "gauged") channel.post({ kind: "gauged", gauged, surveyed });
    else if (message.kind === "headlined") channel.post({ kind: "headlined", headlined, both: headlinedBoth });
    else if (message.kind === "hold") {
        channel.post({ kind: "held" });
        // Runs nothing, finalizers included, until the flag over shared memory is set.
        Atomics.wait(message.flag, 0, 0);
    }
    else {
        channel.post({ kind: "spinning" });
        // Never yields again, from before the world stops anything, so nothing here runs: no finalizer, no acknowledgement.
        for (;;) { /* never yields */ }
    }
});
