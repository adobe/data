import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { Observe } from "../../interface/observe/observe.js";
import { createWorld, join } from "./create.js";
import { scopeChannel } from "./port.js";
import { drive, idle, names, total, until, type Driven } from "./joining.test-helper.js";

/** A thread joining a world through the port it's sent and driving it, or holding a world it shares through it. */

/** A system only this thread imports, which a world elsewhere never did. */
const unimportedByMain = System.create({ name: "joiningTest/unimportedByMain" }, () => {});

type Port = MessagePort | NodeMessagePort;
export type ToJoiningWorker =
    | { readonly kind: "join"; readonly port: Port; readonly threads: readonly "main"[] }
    | { readonly kind: "idle"; readonly port: Port; readonly threads: readonly "main"[] }
    | { readonly kind: "host"; readonly port: Port }
    /** Hold a world shared through this worker's own scope, which this fixture's messages share. */
    | { readonly kind: "host scope" }
    | { readonly kind: "state" };
export type FromJoiningWorker =
    | { readonly kind: "driven"; readonly driven: Driven }
    | { readonly kind: "joined"; readonly ran: string }
    | { readonly kind: "shared" }
    | { readonly kind: "state"; readonly total: number; readonly names: readonly string[]; readonly status: string | null };

const channel = scopeChannel<FromJoiningWorker, ToJoiningWorker>();
let hosted: ReturnType<typeof createWorld> | null = null;
channel.onMessage(async message => {
    // The world's own messages, where it shares the scope.
    if ("protocol" in message) return;
    if (message.kind === "host scope") {
        const world = createWorld({ [workers]: 0 });
        const scope = globalThis.process?.getBuiltinModule?.("node:worker_threads")?.parentPort ?? self;
        world.share(scope);
        hosted = world;
        channel.post({ kind: "shared" });
    }
    else if (message.kind === "join") {
        const remote = join(message.port, { threads: message.threads });
        channel.post({ kind: "driven", driven: await drive(remote, unimportedByMain) });
        await remote.dispose();
    }
    else if (message.kind === "idle") {
        // Joins and stays, its one run's outcome posted.
        const remote = join(message.port, { threads: message.threads });
        const ran = await remote.run(idle).then(() => "ran", (error: unknown) => error instanceof Error ? error.message : String(error));
        channel.post({ kind: "joined", ran });
    }
    else if (message.kind === "host") {
        const world = createWorld({ [workers]: 0 });
        world.share(message.port);
        hosted = world;
        channel.post({ kind: "shared" });
    }
    else if (hosted !== null) {
        // Once the thread that joined has left.
        const threads = await until(hosted.threads, shown => shown[0]?.status === "gone");
        channel.post({
            kind: "state",
            total: await Observe.toPromise(hosted.observe.resource(total)),
            names: await Observe.toPromise(hosted.observe.resource(names)),
            status: threads[0]?.status ?? null,
        });
    }
});
