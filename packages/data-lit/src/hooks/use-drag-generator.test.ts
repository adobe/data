// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useDragGenerator } from "./use-drag-generator.js";
import type { DragState } from "./use-drag-observe.js";
import { createHost, pointerCancel, pointerDown, pointerMove, pointerUp, render, unmount } from "./test-host.test-utils.js";

async function collectTypes(generator: AsyncGenerator<DragState>): Promise<DragState["type"][]> {
    const types: DragState["type"][] = [];
    for await (const value of generator) types.push(value.type);
    return types;
}

describe("useDragGenerator", () => {
    it("calls back once per drag with the start event and a generator that ends with the drag", async () => {
        const host = createHost();
        const callback = vi.fn();
        render(host, () => useDragGenerator({}, [], callback));
        pointerDown(host);
        pointerMove(20);
        pointerUp(30);

        expect(callback).toHaveBeenCalledTimes(1);
        const [generator, startEvent] = callback.mock.calls[0];
        expect(startEvent).toBeInstanceOf(PointerEvent);
        expect((startEvent as PointerEvent).clientX).toBe(20);
        expect(await collectTypes(generator)).toEqual(expect.arrayContaining(["move", "end"]));
        unmount(host);
    });

    it("ends the generator when the drag is cancelled", async () => {
        const host = createHost();
        const callback = vi.fn();
        render(host, () => useDragGenerator({}, [], callback));
        pointerDown(host);
        pointerMove(20);
        pointerCancel();

        const types = await collectTypes(callback.mock.calls[0][0]);
        expect(types.at(-1)).toBe("cancel");
        unmount(host);
    });

    it("starts a new generator for each drag", () => {
        const host = createHost();
        const callback = vi.fn();
        render(host, () => useDragGenerator({}, [], callback));
        for (const x of [20, 40]) {
            pointerDown(host);
            pointerMove(x);
            pointerUp(x);
        }
        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback.mock.calls[0][0]).not.toBe(callback.mock.calls[1][0]);
        unmount(host);
    });

    it("stops calling back after unmount", () => {
        const host = createHost();
        const callback = vi.fn();
        render(host, () => useDragGenerator({}, [], callback));
        unmount(host);
        pointerDown(host);
        pointerMove(20);
        expect(callback).not.toHaveBeenCalled();
    });
});
