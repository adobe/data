// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useEffect } from "./use-effect.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

describe("useEffect", () => {
    it("runs synchronously on the first render with the host as this", () => {
        const host = createHost();
        let self: unknown;
        render(host, () => useEffect(function (this: unknown) { self = this; }, []));
        expect(self).toBe(host);
    });

    it("skips equal dependencies and reruns changed ones, cleaning up first", () => {
        const host = createHost();
        const calls: string[] = [];
        const effect = (n: number) => () => {
            calls.push(`setup ${n}`);
            return () => calls.push(`cleanup ${n}`);
        };
        render(host, () => useEffect(effect(1), [1]));
        render(host, () => useEffect(effect(1), [1]));
        render(host, () => useEffect(effect(2), [2]));
        expect(calls).toEqual(["setup 1", "cleanup 1", "setup 2"]);
    });

    it("runs once with the default dependencies", () => {
        const host = createHost();
        const effect = vi.fn();
        render(host, () => useEffect(effect));
        render(host, () => useEffect(effect));
        expect(effect).toHaveBeenCalledTimes(1);
    });

    it("runs the new effect when the previous cleanup throws", () => {
        const host = createHost();
        const next = vi.fn();
        render(host, () => useEffect(() => () => { throw new Error("cleanup failed"); }, [1]));
        expect(() => render(host, () => useEffect(next, [2]))).toThrow("cleanup failed");
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("runs its cleanup on unmount", () => {
        const host = createHost();
        const cleanup = vi.fn();
        render(host, () => useEffect(() => cleanup, []));
        unmount(host);
        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});
