// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useWindowEvent } from "./use-window-event.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

describe("useWindowEvent", () => {
    it("listens on window with the callback from the factory", () => {
        const host = createHost();
        const listener = vi.fn();
        render(host, () => useWindowEvent("resize", () => listener, []));
        window.dispatchEvent(new Event("resize"));
        expect(listener).toHaveBeenCalledTimes(1);
        unmount(host);
    });

    it("keeps the first callback while factory dependencies are equal", () => {
        const host = createHost();
        const first = vi.fn();
        const second = vi.fn();
        render(host, () => useWindowEvent("resize", () => first, [1]));
        render(host, () => useWindowEvent("resize", () => second, [1]));
        window.dispatchEvent(new Event("resize"));
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
        unmount(host);
    });

    it("replaces the callback when factory dependencies change", () => {
        const host = createHost();
        const first = vi.fn();
        const second = vi.fn();
        render(host, () => useWindowEvent("resize", () => first, [1]));
        render(host, () => useWindowEvent("resize", () => second, [2]));
        window.dispatchEvent(new Event("resize"));
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
        unmount(host);
    });

    it("moves its listener when the event name changes", () => {
        const host = createHost();
        const received: string[] = [];
        const listener = (event: Event) => received.push(event.type);
        render(host, () => useWindowEvent("resize", () => listener, []));
        render(host, () => useWindowEvent("scroll", () => listener, []));
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("scroll"));
        expect(received).toEqual(["scroll"]);
        unmount(host);
    });

    it("removes its listener on unmount", () => {
        const host = createHost();
        const listener = vi.fn();
        render(host, () => useWindowEvent("resize", () => listener, []));
        unmount(host);
        window.dispatchEvent(new Event("resize"));
        expect(listener).not.toHaveBeenCalled();
    });
});
