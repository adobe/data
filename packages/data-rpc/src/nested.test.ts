// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";
import { createRpcEndpoint } from "./create-endpoint.js";
import { createRpcLoopbackTransport } from "./transports/loopback-transport.js";
import { createMessagePortTransport } from "./transports/message-port-transport.js";

// A service with a NESTED sub-service (`child`), itself described by a child
// object schema whose properties are ordinary observe/promise/generator/void
// members — and a doubly-nested `child.deep` to prove arbitrary depth.
interface ParentService extends Service {
    root: Observe<number>;
    child: {
        value: Observe<number>;
        add: (a: number, b: number) => Promise<number>;
        stream: (to: number) => AsyncGenerator<number>;
        bump: () => void;
        deep: {
            greet: (name: string) => Promise<string>;
        };
    };
}

namespace ParentService {
    export const schema = {
        type: "object",
        properties: {
            root: { type: "observe", value: { type: "number" } },
            child: {
                type: "object",
                properties: {
                    value: { type: "observe", value: { type: "number" } },
                    add: { type: "function", signature: { parameters: [{ type: "number" }, { type: "number" }], returns: { type: "promise", value: { type: "number" } } } },
                    stream: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "generator", value: { type: "number" } } } },
                    bump: { type: "function" },
                    deep: {
                        type: "object",
                        properties: {
                            greet: { type: "function", signature: { parameters: [{ type: "string" }], returns: { type: "promise", value: { type: "string" } } } },
                        },
                        required: ["greet"],
                        additionalProperties: false,
                    },
                },
                required: ["value", "add", "stream", "bump", "deep"],
                additionalProperties: false,
            },
        },
        required: ["root", "child"],
        additionalProperties: false,
    } as const satisfies Schema;
}

// A nested service passes both gates: it is a valid AsyncDataService (nested
// organizational objects are allowed) and its schema describes it exactly.
type _Valid = Assert<AsyncDataService.IsValid<ParentService>>;
type _Complete = Assert<AsyncDataService.IsValidWithCompleteSchema<ParentService, typeof ParentService.schema>>;

function makeParent(seed: number) {
    const [root] = Observe.createState(seed);
    const [value, setValue] = Observe.createState(seed * 10);
    let current = seed * 10;
    const stats = { streamFinally: 0 };

    const service: ParentService = {
        serviceName: `parent-${seed}`,
        schema: Observe.fromConstant(ParentService.schema),
        root,
        child: {
            value,
            add: async (a, b) => a + b,
            stream: async function* (to) {
                try { for (let i = 1; i <= to; i++) yield i; }
                finally { stats.streamFinally++; }
            },
            bump: () => setValue((current += 1)),
            deep: {
                greet: async (name) => `hello ${name}`,
            },
        },
    };
    return { service, stats };
}

const flush = async (times = 8) => {
    for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("nested services", () => {
    it("shims nested members on both sides and round-trips every kind", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        const host = makeParent(3);
        ea.expose("parent", host.service, ParentService.schema);
        const parent = eb.consume("parent", ParentService.schema);

        // nested promise + doubly-nested promise
        expect(await parent.child.add(2, 3)).toBe(5);
        expect(await parent.child.deep.greet("world")).toBe("hello world");

        // nested generator
        const out: number[] = [];
        for await (const n of parent.child.stream(3)) out.push(n);
        expect(out).toEqual([1, 2, 3]);
        expect(host.stats.streamFinally).toBe(1);

        // nested observe + nested void mutation
        const seen: number[] = [];
        const un = parent.child.value((v) => seen.push(v));
        await flush();
        expect(seen).toEqual([30]); // seed*10
        parent.child.bump();
        await flush();
        expect(seen).toEqual([30, 31]);
        un();

        // top-level observe still works alongside the nested tree
        let rootSeen: number | undefined;
        const un2 = parent.root((v) => { rootSeen = v; });
        await flush();
        expect(rootSeen).toBe(3);
        un2();

        ea.close();
        eb.close();
    });

    it("rejects a nested call with invalid arguments (path-addressed validation)", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        ea.expose("parent", makeParent(1).service, ParentService.schema);
        const parent = eb.consume("parent", ParentService.schema);

        const untyped = parent as unknown as { child: { add: (...args: unknown[]) => Promise<number> } };
        await expect(untyped.child.add("nope", 2)).rejects.toThrowError(/invalid arguments.*parent\.child\.add/);

        ea.close();
        eb.close();
    });

    it("addresses nested members over a real MessageChannel (the iframe transport)", async () => {
        const { port1, port2 } = new MessageChannel();
        const ea = createRpcEndpoint(createMessagePortTransport(port1));
        const eb = createRpcEndpoint(createMessagePortTransport(port2));
        ea.expose("parent", makeParent(2).service, ParentService.schema);
        const parent = eb.consume("parent", ParentService.schema);

        expect(await parent.child.deep.greet("port")).toBe("hello port");
        expect(await parent.child.add(20, 22)).toBe(42);

        ea.close();
        eb.close();
    });
});
