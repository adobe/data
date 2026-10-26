// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { join } from "../implementation/index.js";
import { scopeChannel } from "../implementation/world/port.js";
import type { World } from "../interface/world/world.js";
import { counter, empty, order, remoteRuns, observerAmounts, observerCaptions, observerCounter, observerSeen, observerSelect, type FromJoined, type ToJoined } from "./remote.js";
import { handoffSystems } from "./handoff.js";
import { release } from "./finalized.js";
import { tailSystems } from "./tails.js";
import { take, transferBatch, transferBytes, transferCount, transferSystems } from "./transfers.js";
import { peersOf } from "../implementation/world/join.js";
import { Observe } from "../observe/index.js";
import { programFinalizers, requireDefinition } from "../interface/registry/index.js";

/**
 * A thread joined to a benchmark's world: it times runs, or reads after each sync point until asked to stop, or claims
 * the thread the handoff benchmarks' systems run on, the one the despawn objects benchmark's finalizer runs on, or the
 * one the tail benchmarks' tails run on.
 */
type Message = ToJoined
    | { readonly kind: "port"; readonly port: MessagePort | NodeMessagePort; readonly threads?: readonly ("handoffBenchmark" | "finalizedBenchmark" | "tailsBenchmark" | "transfersBenchmark")[] }
    | { readonly kind: "transfers"; readonly side: number; readonly fastestOf: number };

const channel = scopeChannel<FromJoined | { readonly kind: "joined" } | { readonly kind: "transferred"; readonly milliseconds: number }, Message>();
let remote: World | null = null;
let stop: (() => void) | null = null;
let last = 0;
let notified = 0;

channel.onMessage(async message => {
    if (message.kind === "port") {
        // The systems the handoff benchmarks place on the thread it claims, which it imports so it runs them.
        if (message.threads !== undefined) for (const system of [...handoffSystems, ...tailSystems, ...transferSystems]) requireDefinition(system);
        // The finalizer the despawn benchmark places there, which importing its module declared.
        if (!programFinalizers().some(finalizer => finalizer === release)) throw new Error("joined: the despawn objects benchmark's finalizer isn't declared here.");
        remote = await join(message.port, { threads: message.threads ?? [] });
        channel.post({ kind: "joined" });
        return;
    }
    if (remote === null) return;
    if (message.kind === "transfers") {
        // The loader moves each run's values straight to the claimed thread once the world gave it a channel there.
        const world = remote;
        while ((peersOf.get(world)?.() ?? 0) === 0) await new Promise(resolve => setTimeout(resolve, 1));
        const pixels = new ImageData(message.side, message.side);
        const batch = async () => {
            const assets = await Promise.all(Array.from({ length: transferBatch }, async () => ({ buffer: new ArrayBuffer(transferBytes), bitmap: await createImageBitmap(pixels) })));
            const start = performance.now();
            await Promise.all(assets.map(asset => world.run(take, asset)));
            return performance.now() - start;
        };
        await batch();
        const batches = transferCount / transferBatch;
        let milliseconds = 0;
        // Every batch's time, or the fastest of `fastestOf` batches for as many transfers.
        if (message.fastestOf === 0) for (let k = 0; k < batches; k++) milliseconds += await batch();
        else {
            let fastest = Infinity;
            for (let k = 0; k < message.fastestOf; k++) fastest = Math.min(fastest, await batch());
            milliseconds = fastest * batches;
        }
        channel.post({ kind: "transferred", milliseconds });
        return;
    }
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
        channel.post({ kind: "stopped", last: Math.max(last, observerSeen.last), notified: notified + observerSeen.notified });
        return;
    }
    if (message.kind === "observer resource" || message.kind === "observer select" || message.kind === "observer captions" || message.kind === "observer amounts") {
        // An observer system of this thread's own, which the world posts here after each sync point.
        const system = message.kind === "observer resource" ? observerCounter : message.kind === "observer select" ? observerSelect
            : message.kind === "observer captions" ? observerCaptions : observerAmounts;
        const world = remote;
        world.add(system);
        stop = () => world.remove(system);
        channel.post({ kind: "observing" });
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
    stop = message.kind === "factory resource"
        ? Observe.resource(remote, counter)(observing)
        : Observe.select(remote, { required: [order], order: { [order]: true } })(observing);
});
