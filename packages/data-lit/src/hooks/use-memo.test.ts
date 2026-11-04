// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useMemo } from "./use-memo.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

describe("useMemo", () => {
    it("returns the cached value while dependencies are equal", () => {
        const host = createHost();
        const calculate = vi.fn(() => ({}));
        const first = render(host, () => useMemo(calculate, [1, "a"]));
        expect(render(host, () => useMemo(calculate, [1, "a"]))).toBe(first);
        expect(calculate).toHaveBeenCalledTimes(1);
    });

    it("recalculates when a dependency changes", () => {
        const host = createHost();
        render(host, () => useMemo(() => 1, [1]));
        expect(render(host, () => useMemo(() => 2, [2]))).toBe(2);
    });

    it("calculates once with the default dependencies", () => {
        const host = createHost();
        const calculate = vi.fn(() => 1);
        render(host, () => useMemo(calculate));
        render(host, () => useMemo(calculate));
        expect(calculate).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, null, 0, false])("caches the falsy result %s", result => {
        const host = createHost();
        const calculate = vi.fn(() => result);
        render(host, () => useMemo(calculate, []));
        expect(render(host, () => useMemo(calculate, []))).toBe(result);
        expect(calculate).toHaveBeenCalledTimes(1);
    });

    it("retries a calculation that threw", () => {
        const host = createHost();
        expect(() => render(host, () => useMemo(() => { throw new Error("failed"); }, []))).toThrow("failed");
        expect(render(host, () => useMemo(() => 1, []))).toBe(1);
    });

    it("never requests a render", () => {
        const host = createHost();
        render(host, () => useMemo(() => 1, [1]));
        render(host, () => useMemo(() => 2, [2]));
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });

    it("keeps independent memos per slot", () => {
        const host = createHost();
        const read = (n: number) => [useMemo(() => `a${n}`, [n]), useMemo(() => "b", [])];
        render(host, () => read(1));
        expect(render(host, () => read(2))).toEqual(["a2", "b"]);
    });

    it("recalculates after an unmount", () => {
        const host = createHost();
        const calculate = vi.fn(() => 1);
        render(host, () => useMemo(calculate, []));
        unmount(host);
        render(host, () => useMemo(calculate, []));
        expect(calculate).toHaveBeenCalledTimes(2);
    });
});
