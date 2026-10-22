// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { first, firstTail, second, secondTail, setPause, ticking } from "./remove.test-helper.js";

/** A thread joining a world through the port it's sent, claiming "removeTest", whose systems it imports. */

/** Named, so the bundle keeps the module declaring them: the package is free of side effects. */
const imported = [first, second, firstTail, secondTail, ticking, setPause];

type Port = MessagePort | NodeMessagePort;
export type ToRemovalWorker = { readonly kind: "join"; readonly port: Port };
export type FromRemovalWorker = { readonly kind: "joined"; readonly systems: number };

const channel = scopeChannel<FromRemovalWorker, ToRemovalWorker>();
channel.onMessage(message => {
    if ("protocol" in message) return;
    join(message.port, { threads: ["removeTest"] });
    channel.post({ kind: "joined", systems: imported.length });
});
