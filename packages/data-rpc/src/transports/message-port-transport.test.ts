// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { type Service } from "@adobe/data/service";
import { createRpcEndpoint } from "../create-endpoint.js";
import type { RpcMessage } from "../protocol.js";
import { createMessagePortTransport } from "./message-port-transport.js";

interface Calc extends Service {
    value: Observe<number>;
    add: (a: number, b: number) => Promise<number>;
}
const calcSchema = {
    type: "object",
    properties: {
        value: { type: "observe", value: { type: "number" } },
        add: { type: "function", signature: { parameters: [{ type: "number" }, { type: "number" }], returns: { type: "promise", value: { type: "number" } } } },
    },
    required: ["value", "add"],
    additionalProperties: false,
} as const satisfies Schema;

function makeCalc(): Calc {
    return {
        serviceName: "calc",
        schema: Observe.fromConstant(calcSchema),
        value: Observe.fromConstant(1),
        add: async (a: number, b: number) => a + b,
    };
}

describe("createMessagePortTransport", () => {
    it("carries a full RPC round-trip over a MessageChannel", async () => {
        const { port1, port2 } = new MessageChannel();
        const ea = createRpcEndpoint(createMessagePortTransport(port1));
        const eb = createRpcEndpoint(createMessagePortTransport(port2));
        ea.expose("calc", makeCalc(), calcSchema);
        const remote = eb.consume("calc", calcSchema);
        expect(await remote.add(2, 40)).toBe(42);
        ea.close();
        eb.close();
    });

    it("buffers messages that arrive before a listener registers, then flushes them", async () => {
        const { port1, port2 } = new MessageChannel();
        // Send on port1 before wrapping port2 with a transport/listener.
        port1.postMessage({ kind: "hello", protocol: 1 } satisfies RpcMessage);

        const transport = createMessagePortTransport(port2);
        // Give the port a tick to receive-and-buffer the pre-listener message.
        await new Promise((r) => setTimeout(r, 0));

        const received: RpcMessage[] = [];
        transport.onMessage((m) => received.push(m));
        await new Promise((r) => setTimeout(r, 0));

        expect(received).toEqual([{ kind: "hello", protocol: 1 }]);
        transport.close();
        port1.close();
    });
});
