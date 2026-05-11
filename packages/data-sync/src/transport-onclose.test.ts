// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for SyncTransport.onClose across the loopback transport.
// (WebRTC and WebSocket adapters are tested via their integration paths.)

import { describe, it, expect, vi } from "vitest";
import { createLoopbackTransport } from "./loopback-transport.js";

describe("SyncTransport.onClose — loopback", () => {
    it("fires listener when close() is called on client side", () => {
        const { client } = createLoopbackTransport();
        const fn = vi.fn();
        client.onClose(fn);
        expect(fn).not.toHaveBeenCalled();
        client.close();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("fires listener when close() is called on server side", () => {
        const { client, server } = createLoopbackTransport();
        const fn = vi.fn();
        client.onClose(fn);
        server.close();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("server onClose also fires when channel closes", () => {
        const { client, server } = createLoopbackTransport();
        const fn = vi.fn();
        server.onClose(fn);
        client.close();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("fires at most once even if close() is called multiple times", () => {
        const { client } = createLoopbackTransport();
        const fn = vi.fn();
        client.onClose(fn);
        client.close();
        client.close();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("calls listener immediately if already closed at registration time", () => {
        const { client } = createLoopbackTransport();
        client.close();
        const fn = vi.fn();
        client.onClose(fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe prevents the listener from firing", () => {
        const { client } = createLoopbackTransport();
        const fn = vi.fn();
        const unsub = client.onClose(fn);
        unsub();
        client.close();
        expect(fn).not.toHaveBeenCalled();
    });

    it("multiple listeners all fire", () => {
        const { client } = createLoopbackTransport();
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        client.onClose(fn1);
        client.onClose(fn2);
        client.close();
        expect(fn1).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(1);
    });

    it("messages can be exchanged before close fires", () => {
        const { client, server } = createLoopbackTransport();
        const received: unknown[] = [];
        server.onMessage((msg) => received.push(msg));

        client.send({ kind: "cancel", id: 1 });
        expect(received).toHaveLength(1);

        client.close();
        // No more messages after close
        expect(received).toHaveLength(1);
    });
});
