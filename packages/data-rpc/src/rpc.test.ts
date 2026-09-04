// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect, vi } from "vitest";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";
import { createRpcEndpoint } from "./create-endpoint.js";
import type { RpcEndpointOptions } from "./endpoint.js";
import { createRpcLoopbackTransport } from "./transports/loopback-transport.js";

// ---------------------------------------------------------------------------
// A demo service exercising every member kind (observe / fn:observe / promise /
// generator / void) plus failure paths (rejecting promise, throwing generator,
// throwing void). Exposed by BOTH endpoints so every kind runs in both directions.
// ---------------------------------------------------------------------------

interface DemoService extends Service {
    value: Observe<number>;
    tracked: Observe<number>;
    selectDouble: (n: number) => Observe<number>;
    add: (a: number, b: number) => Promise<number>;
    fail: (message: string) => Promise<number>;
    countUp: (to: number) => AsyncGenerator<number>;
    explode: (to: number) => AsyncGenerator<number>;
    bump: () => void;
    boom: () => void;
}

namespace DemoService {
    export const schema = {
        type: "object",
        properties: {
            value: { type: "observe", value: { type: "number" } },
            tracked: { type: "observe", value: { type: "number" } },
            selectDouble: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "observe", value: { type: "number" } } } },
            add: { type: "function", signature: { parameters: [{ type: "number" }, { type: "number" }], returns: { type: "promise", value: { type: "number" } } } },
            fail: { type: "function", signature: { parameters: [{ type: "string" }], returns: { type: "promise", value: { type: "number" } } } },
            countUp: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "generator", value: { type: "number" } } } },
            explode: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "generator", value: { type: "number" } } } },
            bump: { type: "function" },
            boom: { type: "function" },
        },
        required: ["value", "tracked", "selectDouble", "add", "fail", "countUp", "explode", "bump", "boom"],
        additionalProperties: false,
    } as const satisfies Schema;
}

// Compile-time proof: DemoService is a valid AsyncDataService fully described by its schema.
type _ValidDemo = Assert<AsyncDataService.IsValid<DemoService>>;
type _CompleteDemo = Assert<AsyncDataService.IsValidWithCompleteSchema<DemoService, typeof DemoService.schema>>;

function makeDemo(seed: number) {
    const [value, setValue] = Observe.createState(seed);
    let current = seed;
    let activeObservers = 0;
    const stats = { countUpFinally: 0, explodeFinally: 0, get activeObservers() { return activeObservers; } };

    // A hand-written observe so we can prove the host unsubscribes on unsubscribe/close.
    const tracked: Observe<number> = (notify) => {
        activeObservers++;
        notify(seed);
        return () => { activeObservers--; };
    };

    const service: DemoService = {
        serviceName: `demo-${seed}`,
        schema: Observe.fromConstant(DemoService.schema),
        value,
        tracked,
        selectDouble: (n) => Observe.fromConstant(n * 2),
        add: async (a, b) => a + b,
        fail: async (message) => { throw new Error(message); },
        countUp: async function* (to) {
            try { for (let i = 1; i <= to; i++) yield i; }
            finally { stats.countUpFinally++; }
        },
        explode: async function* (to) {
            try { for (let i = 1; i <= to; i++) yield i; throw new Error("explode"); }
            finally { stats.explodeFinally++; }
        },
        bump: () => { current += 1; setValue(current); },
        boom: () => { throw new Error("boom"); },
    };
    return { service, stats };
}

const flush = async (times = 8) => {
    for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup(opts?: { a?: RpcEndpointOptions; b?: RpcEndpointOptions }) {
    const { a, b } = createRpcLoopbackTransport();
    const demoA = makeDemo(10);
    const demoB = makeDemo(20);
    const ea = createRpcEndpoint(a, opts?.a);
    const eb = createRpcEndpoint(b, opts?.b);
    const unExposeA = ea.expose("A", demoA.service, DemoService.schema);
    const unExposeB = eb.expose("B", demoB.service, DemoService.schema);
    const aToB = ea.consume("B", DemoService.schema); // A consumes B's service
    const bToA = eb.consume("A", DemoService.schema); // B consumes A's service
    return { ea, eb, demoA, demoB, aToB, bToA, unExposeA, unExposeB };
}

describe("promise members (both directions)", () => {
    it("resolves across the wire in both directions", async () => {
        const { aToB, bToA } = setup();
        expect(await aToB.add(2, 3)).toBe(5);
        expect(await bToA.add(10, 1)).toBe(11);
    });

    it("propagates a rejection with reconstructed name/message", async () => {
        const { aToB } = setup();
        await expect(aToB.fail("kaboom")).rejects.toThrowError("kaboom");
    });

    it("keeps ids independent per originator (bidirectional, both id=1)", async () => {
        const { aToB, bToA } = setup();
        const [r1, r2] = await Promise.all([aToB.add(1, 2), bToA.add(3, 4)]);
        expect(r1).toBe(3);
        expect(r2).toBe(7);
    });
});

describe("observe members (both directions)", () => {
    it("streams the initial value asynchronously and reacts to a void mutation", async () => {
        const { aToB, demoB } = setup();
        const seen: number[] = [];
        const un = aToB.value((v) => seen.push(v));
        // First value is a round-trip → NOT synchronous (unlike a local Observe).
        expect(seen).toEqual([]);
        await flush();
        expect(seen).toEqual([20]);
        aToB.bump(); // void member, other direction of the same channel
        await flush();
        expect(seen).toEqual([20, 21]);
        expect(demoB.stats.activeObservers).toBe(0); // value uses createState, tracked is separate
        un();
    });

    it("fn:observe forwards args and streams the derived value", async () => {
        const { bToA } = setup();
        const seen: number[] = [];
        const un = bToA.selectDouble(21)((v) => seen.push(v));
        await flush();
        expect(seen).toEqual([42]);
        un();
    });

    it("drops an in-flight next after unsubscribe", async () => {
        const { aToB } = setup();
        const seen: number[] = [];
        const un = aToB.value((v) => seen.push(v));
        un(); // unsubscribe before the first (async) next can arrive
        await flush();
        expect(seen).toEqual([]);
    });

    it("releases the host subscription on unsubscribe", async () => {
        const { aToB, demoB } = setup();
        const un = aToB.tracked(() => undefined);
        await flush();
        expect(demoB.stats.activeObservers).toBe(1);
        un();
        await flush();
        expect(demoB.stats.activeObservers).toBe(0);
    });
});

describe("generator members (both directions)", () => {
    it("streams pull-based values in both directions", async () => {
        const { aToB, bToA } = setup();
        const collect = async (gen: AsyncGenerator<number>) => {
            const out: number[] = [];
            for await (const n of gen) out.push(n);
            return out;
        };
        expect(await collect(aToB.countUp(3))).toEqual([1, 2, 3]);
        expect(await collect(bToA.countUp(2))).toEqual([1, 2]);
    });

    it("propagates a generator throw to the consumer", async () => {
        const { aToB } = setup();
        const gen = aToB.explode(2);
        expect((await gen.next()).value).toBe(1);
        expect((await gen.next()).value).toBe(2);
        await expect(gen.next()).rejects.toThrowError("explode");
    });

    it("runs host finally on early return / dispose", async () => {
        const { aToB, demoB } = setup();
        const gen = aToB.countUp(100);
        expect((await gen.next()).value).toBe(1);
        await gen.return(undefined);
        await flush();
        expect(demoB.stats.countUpFinally).toBe(1);
        expect((await gen.next()).done).toBe(true);
    });
});

describe("void members", () => {
    it("routes a host-handler throw to onError (no wire reply)", async () => {
        const onError = vi.fn();
        const { aToB } = setup({ b: { onError } });
        aToB.boom();
        await flush();
        expect(onError).toHaveBeenCalledOnce();
        expect((onError.mock.calls[0][0] as Error).message).toBe("boom");
    });
});

describe("schema discovery", () => {
    it("consumes with a runtime-fetched schema (after expose)", async () => {
        const { eb } = setup();
        const svc = (await eb.consume("A")) as DemoService;
        expect(await svc.add(4, 5)).toBe(9);
    });

    it("supports consume-before-expose ordering", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const ea = createRpcEndpoint(a);
        const eb = createRpcEndpoint(b);
        const pending = eb.consume("late"); // not yet exposed
        const demo = makeDemo(7);
        ea.expose("late", demo.service, DemoService.schema);
        const svc = (await pending) as DemoService;
        expect(await svc.add(1, 1)).toBe(2);
    });

    it("republishes the schema on the projected service's observable slot", async () => {
        const { aToB } = setup();
        let seen: Schema | undefined;
        aToB.schema?.((s) => { seen = s; });
        expect(seen).toEqual(DemoService.schema);
    });
});

describe("trust boundary", () => {
    it("rejects a call denied by canInvoke", async () => {
        const { aToB } = setup({ b: { canInvoke: (_svc, member) => member !== "add" } });
        await expect(aToB.add(1, 2)).rejects.toThrowError(/not permitted/);
    });

    it("rejects a call with invalid Data arguments (never invokes the member)", async () => {
        const { aToB, demoB } = setup();
        const invoke = vi.spyOn(demoB.service, "add");
        // Untyped path: send a string where the schema requires a number.
        const untyped = aToB as unknown as { add: (...args: unknown[]) => Promise<number> };
        await expect(untyped.add("x", "y")).rejects.toThrowError(/invalid arguments/);
        expect(invoke).not.toHaveBeenCalled();
    });
});

describe("teardown", () => {
    it("rejects a pending call when the endpoint closes mid-flight", async () => {
        const { ea, aToB } = setup();
        const pending = aToB.add(1, 2); // registered synchronously
        ea.close(); // before any reply can arrive
        await expect(pending).rejects.toThrowError(/closed/);
    });

    it("releases host subscriptions when the channel closes", async () => {
        const { ea, aToB, demoB } = setup();
        aToB.tracked(() => undefined);
        await flush();
        expect(demoB.stats.activeObservers).toBe(1);
        ea.close();
        await flush();
        expect(demoB.stats.activeObservers).toBe(0);
    });

    it("runs host generator finally when the channel closes mid-stream", async () => {
        const { ea, aToB, demoB } = setup();
        const gen = aToB.countUp(100);
        expect((await gen.next()).value).toBe(1);
        ea.close();
        await flush();
        expect(demoB.stats.countUpFinally).toBe(1);
    });

    it("ends a consumed generator gracefully after close", async () => {
        const { ea, aToB } = setup();
        const gen = aToB.countUp(100);
        expect((await gen.next()).value).toBe(1);
        ea.close();
        expect((await gen.next()).done).toBe(true);
    });
});
