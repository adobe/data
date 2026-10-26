// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { lentPort, serveLent } from "./port.js";

describe("a lent worker's owner", () => {
    it("reports a worker it ends as terminated by its owner, though the worker's own end is heard of first", async () => {
        let died: ((error: Error) => void) | null = null;
        // As a node worker's `exit` can be, before its `terminate` resolves.
        const worker = {
            onDeath: (handler: (error: Error) => void) => { died = handler; },
            terminate: async () => { died?.(new Error("A world worker exited with code 1.")); },
        };
        const { port1, port2 } = new MessageChannel();
        const reported = new Promise<unknown>(resolve => {
            port2.addEventListener("message", event => resolve(event.data));
            port2.start();
        });
        await serveLent(worker, port1).terminate();
        expect(await reported).toEqual({ kind: "death", message: "A world worker was terminated by its owner." });
        port1.close();
        port2.close();
    });
});

describe("a lent worker", () => {
    it("is reported terminated by its owner when its owner ends it, though its port's close is heard of first", async () => {
        const data = new MessageChannel();
        const control = new MessageChannel();
        const lent = lentPort<unknown, unknown>({ port: data.port2, owner: control.port2 });
        const reported = new Promise<string>(resolve => lent.onDeath(error => resolve(error.message)));
        const portClosed = new Promise<void>(resolve => data.port2.addEventListener("close", () => resolve()));
        // Ending the worker closes its port, and the thread it's lent to hears of that before `terminate` resolves.
        const worker = {
            onDeath: () => {},
            terminate: async () => {
                data.port1.close();
                await portClosed;
            },
        };
        await serveLent(worker, control.port1).terminate();
        expect(await reported).toBe("A world worker was terminated by its owner.");
        control.port1.close();
        control.port2.close();
    });
});
