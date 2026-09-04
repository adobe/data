// © 2026 Adobe. MIT License. See /LICENSE for details.

// Headless end-to-end coverage for the sample's SERVICE layer: wires the real
// main/sub service implementations through two RPC endpoints over a genuine
// MessageChannel (Node global) — the same handshake the frames use — and drives
// every member kind in both directions. The Lit panels themselves are verified
// in a real browser (see README); this keeps the sample's logic covered in CI.

import { describe, it, expect } from "vitest";
import { createRpcEndpoint, createMessagePortTransport } from "@adobe/data-rpc";
import { MainService } from "./shared/main-service.js";
import { SubService } from "./shared/sub-service.js";
import { createMainService } from "./main/create-main-service.js";
import { createSubService } from "./sub/create-sub-service.js";

const nextValue = <T>(observe: (notify: (v: T) => void) => () => void) =>
    new Promise<T>((resolve) => {
        const un = observe((v) => {
            resolve(v);
            queueMicrotask(() => un());
        });
    });

describe("data-rpc-iframe sample wiring", () => {
    it("projects both services across a MessageChannel and runs every kind both ways", async () => {
        const { port1, port2 } = new MessageChannel();
        const mainEndpoint = createRpcEndpoint(createMessagePortTransport(port1));
        const subEndpoint = createRpcEndpoint(createMessagePortTransport(port2));

        mainEndpoint.expose("main", createMainService(), MainService.schema);
        subEndpoint.expose("sub", createSubService(), SubService.schema);

        const main = subEndpoint.consume("main", MainService.schema); // sub → main
        const sub = mainEndpoint.consume("sub", SubService.schema); // main → sub

        // promise, both directions
        expect(await sub.echo("ping")).toBe("sub echoes: ping");
        expect(await main.echo("ping")).toBe("main echoes: ping");

        // generator, both directions
        const drain = async (gen: AsyncGenerator<number>) => {
            const out: number[] = [];
            for await (const n of gen) out.push(n);
            return out;
        };
        expect(await drain(sub.countUp(3))).toEqual([1, 2, 3]);
        expect(await drain(main.countUp(2))).toEqual([1, 2]);

        // void → observed effect, both directions
        sub.notify("from-main");
        expect(await nextValue(sub.inbox)).toContain("from-main");
        main.log("from-sub");
        expect(await nextValue(main.logs)).toContain("from-sub");

        // observe, both directions (initial value)
        expect(typeof (await nextValue(main.time))).toBe("number");
        expect(typeof (await nextValue(sub.status))).toBe("string");

        mainEndpoint.close();
        subEndpoint.close();
    });
});
