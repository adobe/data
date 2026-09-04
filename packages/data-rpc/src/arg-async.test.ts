// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { type Service } from "@adobe/data/service";
import { createRpcEndpoint } from "./create-endpoint.js";
import { createRpcLoopbackTransport } from "./transports/loopback-transport.js";
import { createMessagePortTransport } from "./transports/message-port-transport.js";

// Promise and AsyncGenerator values passed as (and nested inside) arguments —
// serviced from the caller over the reverse channel; only Data crosses.
interface AsyncArgService extends Service {
    awaitAndDouble: (p: Promise<number>) => Promise<number>;
    sumStream: (g: AsyncGenerator<number>) => Promise<number>;
    first: (g: AsyncGenerator<number>) => Promise<number>;
    combine: (foo: { label: Promise<string>; nums: AsyncGenerator<number> }) => Promise<string>;
}

namespace AsyncArgService {
    const promiseNum = { type: "promise", value: { type: "number" } } as const;
    const genNum = { type: "generator", value: { type: "number" } } as const;
    export const schema = {
        type: "object",
        properties: {
            awaitAndDouble: { type: "function", signature: { parameters: [promiseNum], returns: promiseNum } },
            sumStream: { type: "function", signature: { parameters: [genNum], returns: promiseNum } },
            first: { type: "function", signature: { parameters: [genNum], returns: promiseNum } },
            combine: {
                type: "function",
                signature: {
                    parameters: [
                        {
                            type: "object",
                            properties: { label: { type: "promise", value: { type: "string" } }, nums: genNum },
                            required: ["label", "nums"],
                            additionalProperties: false,
                        },
                    ],
                    returns: { type: "promise", value: { type: "string" } },
                },
            },
        },
        required: ["awaitAndDouble", "sumStream", "first", "combine"],
        additionalProperties: false,
    } as const satisfies Schema;
}

function makeAsyncArg(): AsyncArgService {
    return {
        serviceName: "async-arg",
        schema: Observe.fromConstant(AsyncArgService.schema),
        awaitAndDouble: async (p) => (await p) * 2,
        sumStream: async (g) => {
            let sum = 0;
            for await (const n of g) sum += n;
            return sum;
        },
        first: async (g) => {
            for await (const n of g) return n; // early exit → the arg generator's return() runs
            return -1;
        },
        combine: async (foo) => {
            const label = await foo.label;
            let sum = 0;
            for await (const n of foo.nums) sum += n;
            return `${label}:${sum}`;
        },
    };
}

const flush = async (times = 10) => {
    for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup() {
    const { a, b } = createRpcLoopbackTransport();
    const ea = createRpcEndpoint(a);
    const eb = createRpcEndpoint(b);
    ea.expose("async", makeAsyncArg(), AsyncArgService.schema);
    const svc = eb.consume("async", AsyncArgService.schema);
    return { ea, eb, svc };
}

describe("Promise arguments", () => {
    it("resolves a promise argument from the caller", async () => {
        const { ea, eb, svc } = setup();
        expect(await svc.awaitAndDouble(Promise.resolve(21))).toBe(42);
        ea.close();
        eb.close();
    });

    it("propagates a rejected promise argument", async () => {
        const { ea, eb, svc } = setup();
        await expect(svc.awaitAndDouble(Promise.reject(new Error("bad input")))).rejects.toThrowError("bad input");
        ea.close();
        eb.close();
    });
});

describe("AsyncGenerator arguments", () => {
    it("streams a generator argument from the caller (host consumes fully)", async () => {
        const { ea, eb, svc } = setup();
        async function* nums() {
            yield 1;
            yield 2;
            yield 3;
        }
        expect(await svc.sumStream(nums())).toBe(6);
        ea.close();
        eb.close();
    });

    it("runs the caller generator's finally when the host ends it early", async () => {
        const { ea, eb, svc } = setup();
        let ranFinally = false;
        async function* provider() {
            try {
                yield 10;
                yield 20;
                yield 30;
            } finally {
                ranFinally = true;
            }
        }
        expect(await svc.first(provider())).toBe(10);
        await flush();
        expect(ranFinally).toBe(true); // host's early return propagated back to the caller
        ea.close();
        eb.close();
    });
});

describe("mixed constructor arguments in a nested object", () => {
    it("services a Promise and an AsyncGenerator inside one object argument", async () => {
        const { ea, eb, svc } = setup();
        async function* nums() {
            yield 4;
            yield 5;
        }
        const result = await svc.combine({ label: Promise.resolve("total"), nums: nums() });
        expect(result).toBe("total:9");
        ea.close();
        eb.close();
    });

    it("works over a real MessageChannel", async () => {
        const { port1, port2 } = new MessageChannel();
        const ea = createRpcEndpoint(createMessagePortTransport(port1));
        const eb = createRpcEndpoint(createMessagePortTransport(port2));
        ea.expose("async", makeAsyncArg(), AsyncArgService.schema);
        const svc = eb.consume("async", AsyncArgService.schema);

        async function* nums() {
            yield 7;
            yield 8;
        }
        expect(await svc.awaitAndDouble(Promise.resolve(5))).toBe(10);
        expect(await svc.sumStream(nums())).toBe(15);

        ea.close();
        eb.close();
    });
});
