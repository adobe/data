// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useConnected } from "./use-connected.js";
import { createHost, render, unmount, type TestHost } from "./test-host.test-utils.js";

const connected = (host: TestHost) => host.dispatchEvent(new Event("connected"));
const disconnected = (host: TestHost) => host.dispatchEvent(new Event("disconnected"));

function mountConnected(host: TestHost) {
    document.body.append(host);
    return host;
}

describe("useConnected", () => {
    it("runs setup immediately when the host is already connected", () => {
        const host = mountConnected(createHost());
        const setup = vi.fn();
        render(host, () => useConnected(setup));
        expect(setup).toHaveBeenCalledTimes(1);
        unmount(host);
        host.remove();
    });

    it("waits for the connected edge when the host is detached", () => {
        const host = createHost();
        const setup = vi.fn();
        render(host, () => useConnected(setup));
        expect(setup).not.toHaveBeenCalled();
        connected(host);
        expect(setup).toHaveBeenCalledTimes(1);
        unmount(host);
    });

    it("tears down on each disconnect and sets up again on each connect", () => {
        const host = createHost();
        const events: string[] = [];
        render(host, () => useConnected(() => {
            events.push("setup");
            return () => events.push("teardown");
        }));
        connected(host);
        connected(host);
        disconnected(host);
        disconnected(host);
        connected(host);
        expect(events).toEqual(["setup", "teardown", "setup"]);
        unmount(host);
    });

    it("uses the latest callback on the next connect without re-subscribing", () => {
        const host = createHost();
        const first = vi.fn();
        const second = vi.fn();
        render(host, () => useConnected(first));
        render(host, () => useConnected(second));
        connected(host);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
        unmount(host);
    });

    it("re-runs setup when dependencies change while connected", () => {
        const host = mountConnected(createHost());
        const events: string[] = [];
        const callback = (n: number) => () => {
            events.push(`setup ${n}`);
            return () => events.push(`teardown ${n}`);
        };
        render(host, () => useConnected(callback(1), [1]));
        render(host, () => useConnected(callback(2), [2]));
        expect(events).toEqual(["setup 1", "teardown 1", "setup 2"]);
        unmount(host);
        host.remove();
    });

    it("tears down and stops listening on unmount", () => {
        const host = createHost();
        const teardown = vi.fn();
        const setup = vi.fn(() => teardown);
        render(host, () => useConnected(setup));
        connected(host);
        unmount(host);
        connected(host);
        expect(teardown).toHaveBeenCalledTimes(1);
        expect(setup).toHaveBeenCalledTimes(1);
    });
});
