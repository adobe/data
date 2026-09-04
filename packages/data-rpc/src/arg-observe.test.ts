// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { type Service } from "@adobe/data/service";
import { createRpcEndpoint } from "./create-endpoint.js";
import { createRpcLoopbackTransport } from "./transports/loopback-transport.js";
import { createMessagePortTransport } from "./transports/message-port-transport.js";

// The user's example: a member whose named object argument carries Observe
// values, returning an Observe. The arg observes live on the CALLER; the callee
// subscribes back to them over the reverse channel — only Data crosses the wire.
interface DisplayService extends Service {
    display: (foo: { alpha: Observe<number>; beta: Observe<string> }) => Observe<string>;
}

namespace DisplayService {
    export const schema = {
        type: "object",
        properties: {
            display: {
                type: "function",
                signature: {
                    parameters: [
                        {
                            type: "object",
                            properties: {
                                alpha: { type: "observe", value: { type: "number" } },
                                beta: { type: "observe", value: { type: "string" } },
                            },
                            required: ["alpha", "beta"],
                            additionalProperties: false,
                        },
                    ],
                    returns: { type: "observe", value: { type: "string" } },
                },
            },
        },
        required: ["display"],
        additionalProperties: false,
    } as const satisfies Schema;
}

// The callee combines the two caller-side observes into a derived string observe.
function makeDisplay(): DisplayService {
    return {
        serviceName: "display",
        schema: Observe.fromConstant(DisplayService.schema),
        display: (foo) =>
            Observe.withMap(
                Observe.fromProperties({ a: foo.alpha, b: foo.beta }),
                ({ a, b }) => `${b}=${a}`,
            ),
    };
}

const flush = async (times = 10) => {
    for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

/** A value observe that also counts how many active subscriptions it has. */
function tracked<T>(initial: T): { observe: Observe<T>; set: (v: T) => void; active: () => number } {
    const [raw, set] = Observe.createState(initial);
    let active = 0;
    const observe: Observe<T> = (notify) => {
        active++;
        const un = raw(notify);
        return () => {
            active--;
            un();
        };
    };
    return { observe, set, active: () => active };
}

describe("observe values as named object arguments", () => {
    it("streams caller-side arg observes to the callee and reacts to updates", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        ea.expose("display", makeDisplay(), DisplayService.schema);
        const svc = eb.consume("display", DisplayService.schema);

        const alpha = tracked(1);
        const beta = tracked("x");

        const seen: string[] = [];
        const un = svc.display({ alpha: alpha.observe, beta: beta.observe })((v) => seen.push(v));

        await flush();
        expect(seen.at(-1)).toBe("x=1");
        expect(alpha.active()).toBe(1); // callee subscribed back to the caller's arg observe
        expect(beta.active()).toBe(1);

        alpha.set(2);
        await flush();
        expect(seen.at(-1)).toBe("x=2");

        beta.set("y");
        await flush();
        expect(seen.at(-1)).toBe("y=2");

        // Unsubscribing the returned observe tears down the reverse subscriptions too.
        un();
        await flush();
        expect(alpha.active()).toBe(0);
        expect(beta.active()).toBe(0);

        const count = seen.length;
        alpha.set(99);
        await flush();
        expect(seen.length).toBe(count); // no further values after teardown

        ea.close();
        eb.close();
    });

    it("works over a real MessageChannel and releases providers on channel close", async () => {
        const { port1, port2 } = new MessageChannel();
        const ea = createRpcEndpoint(createMessagePortTransport(port1));
        const eb = createRpcEndpoint(createMessagePortTransport(port2));
        ea.expose("display", makeDisplay(), DisplayService.schema);
        const svc = eb.consume("display", DisplayService.schema);

        const alpha = tracked(10);
        const beta = tracked("v");
        const seen: string[] = [];
        svc.display({ alpha: alpha.observe, beta: beta.observe })((v) => seen.push(v));

        await flush();
        expect(seen.at(-1)).toBe("v=10");
        expect(alpha.active()).toBe(1);

        // Closing the consuming endpoint releases the callee's reverse subscriptions.
        eb.close();
        await flush();
        expect(alpha.active()).toBe(0);
        expect(beta.active()).toBe(0);

        ea.close();
    });
});
