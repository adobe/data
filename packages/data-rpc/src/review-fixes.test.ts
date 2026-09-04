// © 2026 Adobe. MIT License. See /LICENSE for details.

// Red tests pinning the PR #197 review findings. Each fails before its fix.

import { describe, it, expect } from "vitest";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { type Service } from "@adobe/data/service";
import { createRpcEndpoint } from "./create-endpoint.js";
import type { RpcMessage } from "./protocol.js";
import { createRpcLoopbackTransport } from "./transports/loopback-transport.js";

const flush = async (times = 12) => {
    for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---------------------------------------------------------------------------
// B1: a rejecting promise argument the member ignores must not surface as an
// unhandled rejection on the callee.
// ---------------------------------------------------------------------------
interface IgnoreService extends Service {
    ignoreArg: (p: Promise<number>) => Promise<void>;
}
const ignoreSchema = {
    type: "object",
    properties: {
        ignoreArg: { type: "function", signature: { parameters: [{ type: "promise", value: { type: "number" } }], returns: { type: "promise" } } },
    },
    required: ["ignoreArg"],
    additionalProperties: false,
} as const satisfies Schema;

describe("B1 — rejecting promise arg ignored by the member", () => {
    it("does not raise an unhandled rejection", async () => {
        const rejections: unknown[] = [];
        const onUnhandled = (r: unknown) => rejections.push(r);
        process.on("unhandledRejection", onUnhandled);
        try {
            const { a, b } = createRpcLoopbackTransport();
            const ea = createRpcEndpoint(a);
            const eb = createRpcEndpoint(b);
            const service: IgnoreService = {
                serviceName: "ignore",
                schema: Observe.fromConstant(ignoreSchema),
                ignoreArg: async () => undefined, // never touches the promise arg
            };
            ea.expose("ignore", service, ignoreSchema);
            const svc = eb.consume("ignore", ignoreSchema);

            await svc.ignoreArg(Promise.reject(new Error("boom")));
            await flush();
            await new Promise((r) => setTimeout(r, 30)); // let any unhandledRejection fire

            expect(rejections).toEqual([]);
            ea.close();
            eb.close();
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });
});

// ---------------------------------------------------------------------------
// S1: a promise/generator arg must be settled on the callee when the call
// completes before the member consumes it (no hang).
// ---------------------------------------------------------------------------
interface LateService extends Service {
    lateAwait: (p: Promise<number>) => Promise<void>;
    result: Observe<string>;
    lateDrain: (g: AsyncGenerator<number>) => Promise<void>;
    drained: Observe<string>;
}
const lateSchema = {
    type: "object",
    properties: {
        lateAwait: { type: "function", signature: { parameters: [{ type: "promise", value: { type: "number" } }], returns: { type: "promise" } } },
        result: { type: "observe", value: { type: "string" } },
        lateDrain: { type: "function", signature: { parameters: [{ type: "generator", value: { type: "number" } }], returns: { type: "promise" } } },
        drained: { type: "observe", value: { type: "string" } },
    },
    required: ["lateAwait", "result", "lateDrain", "drained"],
    additionalProperties: false,
} as const satisfies Schema;

function makeLate(): LateService {
    const [result, setResult] = Observe.createState("pending");
    const [drained, setDrained] = Observe.createState("pending");
    return {
        serviceName: "late",
        schema: Observe.fromConstant(lateSchema),
        result,
        drained,
        lateAwait: async (p) => {
            // Return immediately; consume the arg later, in the background.
            void p.then(
                (v) => setResult(`resolved:${v}`),
                (e) => setResult(`rejected:${(e as Error).message}`),
            );
        },
        lateDrain: async (g) => {
            void (async () => {
                let sum = 0;
                try {
                    for await (const n of g) sum += n;
                    setDrained(`done:${sum}`);
                } catch (e) {
                    setDrained(`err:${(e as Error).message}`);
                }
            })();
        },
    };
}

describe("S1 — arg consumed after the call completes", () => {
    it("settles a promise arg instead of hanging the callee", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        ea.expose("late", makeLate(), lateSchema);
        const svc = eb.consume("late", lateSchema);

        const seen: string[] = [];
        svc.result((v) => seen.push(v));

        let resolveArg!: (n: number) => void;
        const arg = new Promise<number>((r) => (resolveArg = r));
        await svc.lateAwait(arg); // call resolves before the arg is consumed
        resolveArg(42);
        await flush();

        expect(seen.at(-1)).not.toBe("pending"); // callee's arg promise must settle
        ea.close();
        eb.close();
    });

    it("terminates a generator arg instead of hanging the callee", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        ea.expose("late", makeLate(), lateSchema);
        const svc = eb.consume("late", lateSchema);

        const seen: string[] = [];
        svc.drained((v) => seen.push(v));

        async function* nums() {
            yield 1;
            yield 2;
            yield 3;
        }
        await svc.lateDrain(nums());
        await flush();

        expect(seen.at(-1)).not.toBe("pending"); // callee's for-await must terminate
        ea.close();
        eb.close();
    });
});

// ---------------------------------------------------------------------------
// S2: a wire-supplied member path must not reach inherited/prototype members.
// ---------------------------------------------------------------------------
interface GreetService extends Service {
    greet: () => Promise<string>;
}
const greetSchema = {
    type: "object",
    properties: { greet: { type: "function", signature: { returns: { type: "promise", value: { type: "string" } } } } },
    required: ["greet"],
    additionalProperties: false,
} as const satisfies Schema;

describe("S2 — prototype-chain path traversal", () => {
    it("rejects path ['constructor'] rather than invoking Object", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const service: GreetService = {
            serviceName: "greet",
            schema: Observe.fromConstant(greetSchema),
            greet: async () => "hi",
        };
        ea.expose("greet", service, greetSchema);

        const responses: RpcMessage[] = [];
        b.onMessage((m) => responses.push(m));
        b.send({ kind: "call", id: 999, service: "greet", path: ["constructor"], args: [] });
        await flush();

        const resp = responses.find((m) => "id" in m && m.id === 999);
        expect(resp?.kind).toBe("reject"); // not a resolve from calling Object()
        ea.close();
    });
});

// ---------------------------------------------------------------------------
// S4: constructor-typed arguments on a void member are unsupported.
// ---------------------------------------------------------------------------
interface VoidArgService extends Service {
    logObs: (o: Observe<number>) => void;
}
const voidArgSchema = {
    type: "object",
    properties: {
        logObs: { type: "function", signature: { parameters: [{ type: "observe", value: { type: "number" } }] } },
    },
    required: ["logObs"],
    additionalProperties: false,
} as const satisfies Schema;

describe("S4 — constructor arg on a void member", () => {
    it("throws rather than silently leaking a provider", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        const service: VoidArgService = {
            serviceName: "voidarg",
            schema: Observe.fromConstant(voidArgSchema),
            logObs: () => undefined,
        };
        ea.expose("voidarg", service, voidArgSchema);
        const svc = eb.consume("voidarg", voidArgSchema);

        expect(() => svc.logObs(Observe.fromConstant(1))).toThrowError(/void member/i);
        ea.close();
        eb.close();
    });
});

// ---------------------------------------------------------------------------
// N2: a raw value at a constructor position must not be mistaken for a ref.
// ---------------------------------------------------------------------------
interface AwaitService extends Service {
    awaitIt: (p: Promise<number>) => Promise<number>;
}
const awaitSchema = {
    type: "object",
    properties: {
        awaitIt: { type: "function", signature: { parameters: [{ type: "promise", value: { type: "number" } }], returns: { type: "promise", value: { type: "number" } } } },
    },
    required: ["awaitIt"],
    additionalProperties: false,
} as const satisfies Schema;

describe("N2 — raw value at a constructor position", () => {
    it("passes a bare number through instead of treating it as a ref", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b, { defaultTimeoutMs: 250 });
        const service: AwaitService = {
            serviceName: "await",
            schema: Observe.fromConstant(awaitSchema),
            awaitIt: async (p) => await p,
        };
        ea.expose("await", service, awaitSchema);
        const svc = eb.consume("await", awaitSchema);

        // Caller misuse: a raw number where the schema says `promise`.
        const untyped = svc as unknown as { awaitIt: (p: unknown) => Promise<number> };
        expect(await untyped.awaitIt(5)).toBe(5);
        ea.close();
        eb.close();
    });
});
