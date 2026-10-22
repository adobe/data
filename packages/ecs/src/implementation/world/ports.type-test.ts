// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import type { MessagePort as NodeMessagePort, Worker as NodeWorker } from "node:worker_threads";
import type { World } from "../../interface/world/world.js";
import { join } from "./create.js";

// Node's ports are ports too: a worker_threads MessagePort, Worker and parentPort.
declare const port: NodeMessagePort;
declare const worker: NodeWorker;
declare const world: World;
world.share(port);
world.share(worker);
join(port, { threads: ["main"] });
const parent: NodeMessagePort | null = globalThis.process.getBuiltinModule("node:worker_threads").parentPort;
if (parent !== null) join(parent);
