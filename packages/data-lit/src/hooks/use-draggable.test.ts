// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Vec2 } from "@adobe/data/math";
import { useDraggable, type DraggableProps } from "./use-draggable.js";
import { createHost, pointerCancel, pointerDown, pointerMove, pointerUp, render, unmount } from "./test-host.test-utils.js";

function mountDraggable(options: Partial<DraggableProps> = {}, onDragStart: () => Vec2 | void = () => {}) {
    const host = createHost();
    const parent = document.createElement("section");
    parent.append(host);
    const props = {
        onDragStart: vi.fn(onDragStart),
        onDrag: vi.fn(),
        onDragEnd: vi.fn(),
        onDragCancel: vi.fn(),
        ...options,
    };
    render(host, () => useDraggable(host, props, []));
    return { host, parent, props };
}

describe("useDraggable", () => {
    it("offsets the start position from onDragStart and ends at the pointerup coordinates", () => {
        const { host, props } = mountDraggable({}, () => [100, 200]);
        pointerDown(host);
        pointerMove(20);
        pointerUp(50);

        expect(props.onDrag).toHaveBeenCalledWith(expect.any(PointerEvent), [120, 200], [20, 0]);
        expect(props.onDragEnd).toHaveBeenCalledWith(expect.any(PointerEvent), [150, 200], [50, 0]);
        unmount(host);
    });

    it("starts from the element offset when onDragStart returns nothing", () => {
        const { host, props } = mountDraggable();
        Object.defineProperty(host, "offsetLeft", { value: 7 });
        Object.defineProperty(host, "offsetTop", { value: 3 });
        pointerDown(host);
        pointerMove(20);
        expect(props.onDrag).toHaveBeenCalledWith(expect.any(PointerEvent), [27, 3], [20, 0]);
        pointerUp(20);
        unmount(host);
    });

    it("starts once the pointer has moved at least minDragDistance", () => {
        const { host, props } = mountDraggable({ minDragDistance: 5 });
        pointerDown(host);
        pointerMove(4);
        expect(props.onDragStart).not.toHaveBeenCalled();
        pointerMove(5);
        expect(props.onDragStart).toHaveBeenCalledTimes(1);
        pointerMove(6);
        expect(props.onDragStart).toHaveBeenCalledTimes(1);
        pointerUp(6);
        unmount(host);
    });

    it("does not end or cancel a press released before the threshold", () => {
        const { host, props } = mountDraggable();
        pointerDown(host);
        pointerMove(3);
        pointerUp(3);
        expect(props.onDragEnd).not.toHaveBeenCalled();
        expect(props.onDragCancel).not.toHaveBeenCalled();
        unmount(host);
        expect(props.onDragCancel).not.toHaveBeenCalled();
    });

    it("sets the drag cursor and restores the original cursor at the end", () => {
        const { host } = mountDraggable({ dragCursor: "move" });
        host.style.cursor = "pointer";
        pointerDown(host);
        pointerMove(20);
        expect(host.style.cursor).toBe("move");
        pointerUp(20);
        expect(host.style.cursor).toBe("pointer");
        unmount(host);
    });

    it("adds a placeholder to the parent while dragging when requested", () => {
        const { host, parent } = mountDraggable({ addPlaceholder: true });
        pointerDown(host);
        pointerMove(20);
        expect(parent.children).toHaveLength(2);
        pointerUp(20);
        expect(parent.children).toHaveLength(1);
        unmount(host);
    });

    it("stops propagation of its pointer events when requested", () => {
        const { host } = mountDraggable({ stopPropagation: true });
        const parentListener = vi.fn();
        host.parentElement!.addEventListener("pointerdown", parentListener);
        pointerDown(host);
        expect(parentListener).not.toHaveBeenCalled();
        pointerUp(0);
        unmount(host);
    });

    it("cancels on pointercancel, restores the cursor, and stops delivering moves", () => {
        const { host, props } = mountDraggable();
        pointerDown(host);
        pointerMove(20);
        expect(host.style.cursor).toBe("grab");

        pointerCancel();
        pointerMove(30);
        pointerUp(30);

        expect(props.onDragCancel).toHaveBeenCalledTimes(1);
        expect(props.onDrag).toHaveBeenCalledTimes(1);
        expect(props.onDragEnd).not.toHaveBeenCalled();
        expect(host.style.cursor).toBe("");
        unmount(host);
    });

    it("ignores secondary buttons and other pointers", () => {
        const { host, props } = mountDraggable();
        pointerDown(host, 0, 1, 2);
        pointerMove(20);
        expect(props.onDragStart).not.toHaveBeenCalled();

        pointerDown(host);
        pointerDown(host, 0, 2);
        pointerMove(20, 2);
        pointerUp(20, 2);
        expect(props.onDragStart).not.toHaveBeenCalled();
        pointerMove(20);
        pointerUp(20);
        expect(props.onDragEnd).toHaveBeenCalledTimes(1);
        unmount(host);
    });

    it("cancels an active drag on unmount and stops listening", () => {
        const { host, props } = mountDraggable();
        pointerDown(host);
        pointerMove(20);
        unmount(host);

        expect(props.onDragCancel).toHaveBeenCalledTimes(1);
        expect(host.style.cursor).toBe("");
        pointerMove(30);
        pointerDown(host);
        pointerMove(60);
        expect(props.onDrag).toHaveBeenCalledTimes(1);
    });
});
