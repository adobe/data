import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import type { World } from "../../interface/world/world.js";
import { asEntity } from "./entities.js";
import { join } from "./create.js";
import { scopeChannel } from "./port.js";
import { idle } from "./joining.test-helper.js";
import { objectsThere, ranHere } from "./thread-systems.test-helper.js";

/**
 * A thread joining a world through the port it's sent, claiming "threadSystemsTest", whose systems it imports: it reads
 * its objects when asked, spins without yielding, tells how late tasks it queued ran, or tells why the world refused it.
 */

type Port = MessagePort | NodeMessagePort;
export type ToThreadSystemsWorker =
    | { readonly kind: "join"; readonly port: Port }
    | { readonly kind: "objects"; readonly entities: readonly number[] }
    | { readonly kind: "spin" }
    | { readonly kind: "tasks" }
    | { readonly kind: "refused"; readonly port: Port };
export type FromThreadSystemsWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "objects"; readonly objects: readonly { readonly [name: string]: unknown }[] }
    | { readonly kind: "spinning" }
    | { readonly kind: "tasks queued" }
    | { readonly kind: "tasks ran"; readonly late: number; readonly runs: number }
    | { readonly kind: "refused"; readonly message: string };

const channel = scopeChannel<FromThreadSystemsWorker, ToThreadSystemsWorker>();

/**
 * Queues a timer on this thread's event loop, due in `ranHere.due`, which runs only once this thread returns to its
 * event loop: in node due in 5 ms; in a browser due at once, set from a message to itself so it nests in no other
 * timer, since a browser runs a later timer within a leeway it picks, many ticks after it's due.
 */
const later = (task: () => void): void => {
    if (globalThis.process?.versions?.node !== undefined) {
        const delay = 5;
        ranHere.due = performance.now() + delay;
        ranHere.atDue = -1;
        setTimeout(task, delay);
        return;
    }
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
        port1.close();
        ranHere.due = performance.now();
        ranHere.atDue = -1;
        setTimeout(task, 0);
    };
    port2.postMessage(null);
};

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
    else if (message.kind === "tasks") {
        // Tasks, one after another, each running only once this thread returns to its event loop: the latest any ran,
        // and the most tasks that ran on this thread once one was due before it ran.
        let late = 0;
        let runs = 0;
        const next = (left: number): void => {
            later(() => {
                late = Math.max(late, performance.now() - ranHere.due);
                runs = Math.max(runs, ranHere.atDue < 0 ? 0 : ranHere.runs - ranHere.atDue + 1);
                ranHere.due = Infinity;
                if (left > 1) next(left - 1);
                else channel.post({ kind: "tasks ran", late, runs });
            });
        };
        next(40);
        channel.post({ kind: "tasks queued" });
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
