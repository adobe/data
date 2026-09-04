// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect, vi } from "vitest";
import type { RpcMessage } from "../protocol.js";
import { createRpcLoopbackTransport } from "./loopback-transport.js";

const msg = (protocol: number): RpcMessage => ({ kind: "hello", protocol });

describe("createRpcLoopbackTransport", () => {
    it("delivers asynchronously (never synchronously with send)", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const received: RpcMessage[] = [];
        b.onMessage((m) => received.push(m));
        a.send(msg(1));
        expect(received).toEqual([]); // not yet — delivery is scheduled
        await new Promise((r) => setTimeout(r, 0));
        expect(received).toEqual([msg(1)]);
    });

    it("buffers messages sent before a listener registers, in order", async () => {
        const { a, b } = createRpcLoopbackTransport();
        a.send(msg(1));
        a.send(msg(2));
        const received: RpcMessage[] = [];
        b.onMessage((m) => received.push(m));
        await new Promise((r) => setTimeout(r, 0));
        expect(received).toEqual([msg(1), msg(2)]);
    });

    it("fires every onClose listener once when either side closes", async () => {
        const { a, b } = createRpcLoopbackTransport();
        const onCloseA = vi.fn();
        const onCloseB = vi.fn();
        a.onClose(onCloseA);
        b.onClose(onCloseB);
        b.close();
        expect(onCloseA).toHaveBeenCalledOnce();
        expect(onCloseB).toHaveBeenCalledOnce();
        a.close(); // idempotent — no second fire
        expect(onCloseA).toHaveBeenCalledOnce();
    });

    it("throws on a non-cloneable payload, like a real port", () => {
        const { a } = createRpcLoopbackTransport();
        // A function is not structured-cloneable; sending one must throw here too.
        expect(() => a.send({ kind: "next", id: 1, value: (() => 0) as never })).toThrow();
    });
});
