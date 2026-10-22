// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { asEntity } from "./entities.js";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { watch, type Observers, type Watched } from "./remote-objects.test-helper.js";

/** A thread joining a world through the port it's sent, claiming "remoteObjects", and watching an entity there. */

type Port = MessagePort | NodeMessagePort;
export type ToRemoteObjectsWorker = { readonly kind: "watch"; readonly port: Port; readonly entity: number; readonly count: number; readonly observers: Observers };
export type FromRemoteObjectsWorker = { readonly kind: "watched"; readonly watched: Watched };

const channel = scopeChannel<FromRemoteObjectsWorker, ToRemoteObjectsWorker>();
channel.onMessage(async message => {
    if ("protocol" in message) return;
    const remote = join(message.port, { threads: ["remoteObjects"] });
    const watched = await watch(remote, asEntity(message.entity), message.count, message.observers);
    await remote.dispose();
    channel.post({ kind: "watched", watched });
});
