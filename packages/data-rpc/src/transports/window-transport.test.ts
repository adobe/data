// © 2026 Adobe. MIT License. See /LICENSE for details.

// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import type { RpcMessage } from "../protocol.js";
import { createWindowTransport } from "./window-transport.js";

const hello: RpcMessage = { kind: "hello", protocol: 1 };

describe("createWindowTransport", () => {
    it("delivers messages from an allowed origin", async () => {
        const transport = createWindowTransport(window, { allowedOrigins: ["https://trusted.example"] });
        const received: RpcMessage[] = [];
        transport.onMessage((m) => received.push(m));

        window.dispatchEvent(new MessageEvent("message", { data: hello, origin: "https://trusted.example" }));
        expect(received).toEqual([hello]);
        transport.close();
    });

    it("drops messages from a disallowed origin", async () => {
        const transport = createWindowTransport(window, { allowedOrigins: ["https://trusted.example"] });
        const received: RpcMessage[] = [];
        transport.onMessage((m) => received.push(m));

        window.dispatchEvent(new MessageEvent("message", { data: hello, origin: "https://evil.example" }));
        expect(received).toEqual([]);
        transport.close();
    });

    it("ignores non-RpcMessage payloads even from an allowed origin", async () => {
        const transport = createWindowTransport(window, { allowedOrigins: ["https://trusted.example"] });
        const received: RpcMessage[] = [];
        transport.onMessage((m) => received.push(m));

        window.dispatchEvent(new MessageEvent("message", { data: "just a string", origin: "https://trusted.example" }));
        window.dispatchEvent(new MessageEvent("message", { data: { foo: 1 }, origin: "https://trusted.example" }));
        expect(received).toEqual([]);
        transport.close();
    });

    it("requires an explicit targetOrigin when allowedOrigins is ambiguous (N1)", () => {
        expect(() => createWindowTransport(window, { allowedOrigins: ["https://a.example", "https://b.example"] })).toThrow();
        // A single allowed origin (or an explicit targetOrigin) is fine.
        expect(() => createWindowTransport(window, { allowedOrigins: ["https://a.example"] })).not.toThrow();
        expect(() =>
            createWindowTransport(window, { allowedOrigins: ["https://a.example", "https://b.example"], targetOrigin: "https://a.example" }),
        ).not.toThrow();
    });

    it("stops delivering after close", async () => {
        const transport = createWindowTransport(window, { allowedOrigins: ["https://trusted.example"] });
        const received: RpcMessage[] = [];
        transport.onMessage((m) => received.push(m));
        transport.close();

        window.dispatchEvent(new MessageEvent("message", { data: hello, origin: "https://trusted.example" }));
        expect(received).toEqual([]);
    });
});
