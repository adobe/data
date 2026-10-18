import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import type { World } from "../../interface/world/world.js";
import { asEntity } from "./entities.js";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { idle } from "./joining.test-helper.js";
import { objectsThere } from "./thread-systems.test-helper.js";

/**
 * A thread joining a world through the port it's sent, claiming "threadSystemsTest", whose systems it imports: it reads
 * its objects when asked, spins without yielding, or tells why the world refused it.
 */

type Port = MessagePort | NodeMessagePort;
export type ToThreadSystemsWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "objects"; readonly entities: readonly number[] }
    | { readonly kind: "spin" }
    | { readonly kind: "refused"; readonly port: Port };
export type FromThreadSystemsWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "objects"; readonly objects: readonly { readonly [name: string]: unknown }[] }
    | { readonly kind: "spinning" }
    | { readonly kind: "refused"; readonly message: string };

const channel = scopeChannel<FromThreadSystemsWorker, ToThreadSystemsWorker>();
let remote: World | null = null;
channel.onMessage(async message => {
    if ("protocol" in message) return;
    if (message.kind === "join") {
        remote = join(message.port, { threads: ["threadSystemsTest"] });
        channel.post({ kind: "joined" });
    }
    else if (message.kind === "objects") {
        const objects = remote === null ? [] : await objectsThere(remote)(message.entities.map(asEntity));
        channel.post({ kind: "objects", objects });
    }
    else if (message.kind === "spin") {
        channel.post({ kind: "spinning" });
        // Never yields again, so nothing here runs: no task, no observer.
        setTimeout(() => { for (;;) { /* never yields */ } }, 0);
    }
    else {
        const refused = join(message.port, { threads: ["threadSystemsTest"] });
        const ran = await refused.run(idle).then(() => "ran", (error: unknown) => error instanceof Error ? error.message : String(error));
        await refused.dispose();
        channel.post({ kind: "refused", message: ran });
    }
});
