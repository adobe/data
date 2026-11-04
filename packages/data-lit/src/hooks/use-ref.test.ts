// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { useRef } from "./use-ref.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

describe("useRef", () => {
    it("returns the same ref across renders and keeps its mutations", () => {
        const host = createHost();
        const ref = render(host, () => useRef(1));
        ref.current = 2;

        const next = render(host, () => useRef(1));
        expect(next).toBe(ref);
        expect(next.current).toBe(2);
    });

    it("ignores the initial value after the first render", () => {
        const host = createHost();
        render(host, () => useRef("first"));
        expect(render(host, () => useRef("second")).current).toBe("first");
    });

    it("stores a function as a value", () => {
        const host = createHost();
        const callback = () => 1;
        expect(render(host, () => useRef(callback)).current).toBe(callback);
    });

    it("does not request a render when current changes", () => {
        const host = createHost();
        render(host, () => useRef(0)).current = 1;
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });

    it("keeps independent refs per slot and per host", () => {
        const host = createHost();
        const other = createHost();
        const [a, b] = render(host, () => [useRef(0), useRef(0)]);
        const c = render(other, () => useRef(0));
        expect(new Set([a, b, c]).size).toBe(3);
    });

    it("starts from the initial value after an unmount", () => {
        const host = createHost();
        render(host, () => useRef(0)).current = 5;
        unmount(host);
        expect(render(host, () => useRef(0)).current).toBe(0);
    });
});
