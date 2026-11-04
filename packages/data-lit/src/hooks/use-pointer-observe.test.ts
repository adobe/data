// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { Vec2 } from "@adobe/data/math";
import { usePointerObserve } from "./use-pointer-observe.js";
import { createHost, render, unmount, type TestHost } from "./test-host.test-utils.js";

function placeAt(host: TestHost, left: number, top: number) {
    host.getBoundingClientRect = () => ({ left, top, x: left, y: top, width: 100, height: 100, right: left + 100, bottom: top + 100, toJSON() {} });
}

const pointerMoveOver = (host: TestHost, clientX: number, clientY: number) =>
    host.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY }));

describe("usePointerObserve", () => {
    it("emits pointer positions relative to the host", () => {
        const host = createHost();
        placeAt(host, 10, 20);
        const positions: Vec2[] = [];
        render(host, () => usePointerObserve([]))(position => positions.push(position));

        pointerMoveOver(host, 15, 30);
        pointerMoveOver(host, 50, 60);
        expect(positions).toEqual([[5, 10], [40, 40]]);
        unmount(host);
    });

    it("returns the same stream while dependencies are equal", () => {
        const host = createHost();
        const first = render(host, () => usePointerObserve([1]));
        expect(render(host, () => usePointerObserve([1]))).toBe(first);
        expect(render(host, () => usePointerObserve([2]))).not.toBe(first);
        unmount(host);
    });

    it("delivers to every subscriber", () => {
        const host = createHost();
        placeAt(host, 0, 0);
        const observe = render(host, () => usePointerObserve([]));
        const a: Vec2[] = [];
        const b: Vec2[] = [];
        observe(position => a.push(position));
        observe(position => b.push(position));
        pointerMoveOver(host, 1, 2);
        expect(a).toEqual([[1, 2]]);
        expect(b).toEqual([[1, 2]]);
        unmount(host);
    });

    it("stops listening on unmount", () => {
        const host = createHost();
        placeAt(host, 0, 0);
        const positions: Vec2[] = [];
        render(host, () => usePointerObserve([]))(position => positions.push(position));
        unmount(host);
        pointerMoveOver(host, 1, 1);
        expect(positions).toEqual([]);
    });
});
