/// <reference types="node" />
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { join } from "../implementation/index.js";
import { scopeChannel } from "../implementation/world/port.js";
import type { World } from "../interface/world/world.js";
import { counter, empty, order, remoteRuns, type FromJoined, type ToJoined } from "./remote.js";
import { handoffSystems } from "./handoff.js";
import { requireDefinition } from "../interface/registry/index.js";

/**
 * A thread joined to a benchmark's world: it times runs, or observes through a mailbox until asked to stop, or claims
 * the thread the handoff benchmarks' systems run on.
 */
type Message = ToJoined | { readonly kind: "port"; readonly port: MessagePort | NodeMessagePort; readonly threads?: readonly "handoffBenchmark"[] };

const channel = scopeChannel<FromJoined | { readonly kind: "joined" }, Message>();
let remote: World | null = null;
let stop: (() => void) | null = null;
let last = 0;
let notified = 0;

channel.onMessage(async message => {
    if (message.kind === "port") {
        // The systems the handoff benchmarks place on the thread it claims, which it imports so it runs them.
        if (message.threads !== undefined) for (const system of handoffSystems) requireDefinition(system);
        remote = join(message.port, { threads: message.threads ?? [] });
        channel.post({ kind: "joined" });
        return;
    }
    if (remote === null) return;
    if (message.kind === "runs") {
        for (let k = 0; k < 100; k++) await remote.run(empty);
        let best = Infinity;
        for (let stretch = 0; stretch < message.stretches; stretch++) {
            const start = performance.now();
            for (let k = 0; k < remoteRuns; k++) await remote.run(empty);
            best = Math.min(best, performance.now() - start);
        }
        channel.post({ kind: "ran", milliseconds: best });
        return;
    }
    if (message.kind === "stop") {
        stop?.();
        channel.post({ kind: "stopped", last, notified });
        return;
    }
    let first = true;
    const observing = (value: unknown): void => {
        notified++;
        last = typeof value === "number" ? value : Array.isArray(value) ? value.length : -1;
        if (!first) return;
        first = false;
        channel.post({ kind: "observing" });
    };
    stop = message.kind === "resource"
        ? remote.observe.resource(counter)(observing)
        : remote.observe.select({ required: [order], order: { [order]: true } })(observing);
});
