// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { useDragObserve, type DragState } from "./use-drag-observe.js";
import { createHost, pointerCancel, pointerDown, pointerMove, pointerUp, render, unmount } from "./test-host.test-utils.js";

describe("useDragObserve", () => {
    it("emits start, move, and end with positions and deltas", () => {
        const host = createHost();
        const events: DragState[] = [];
        render(host, () => useDragObserve({}, []))(event => events.push(event));
        pointerDown(host);
        pointerMove(20);
        pointerUp(30);

        expect(events.map(event => event.type)).toEqual(["start", "move", "end"]);
        expect(events[0].type === "start" && events[0].event).toBeInstanceOf(PointerEvent);
        expect(events[1]).toEqual({ type: "move", position: [20, 0], delta: [20, 0] });
        expect(events[2]).toEqual({ type: "end", position: [30, 0], delta: [30, 0] });
        unmount(host);
    });

    it("emits cancel when the pointer is cancelled", () => {
        const host = createHost();
        const types: DragState["type"][] = [];
        render(host, () => useDragObserve({}, []))(event => types.push(event.type));
        pointerDown(host);
        pointerMove(20);
        pointerCancel();
        expect(types).toEqual(["start", "move", "cancel"]);
        unmount(host);
    });

    it("returns the same stream across renders and delivers drag events to it", () => {
        const host = createHost();
        const first = render(host, () => useDragObserve({}, []));
        const second = render(host, () => useDragObserve({}, []));
        expect(second).toBe(first);

        const types: DragState["type"][] = [];
        second(event => types.push(event.type));
        pointerDown(host);
        pointerMove(20);
        pointerUp(20);
        expect(types).toEqual(["start", "move", "end"]);
        unmount(host);
    });

    it("returns a new stream when dependencies change", () => {
        const host = createHost();
        const first = render(host, () => useDragObserve({}, [1]));
        const second = render(host, () => useDragObserve({}, [2]));
        expect(second).not.toBe(first);

        const types: DragState["type"][] = [];
        second(event => types.push(event.type));
        pointerDown(host);
        pointerMove(20);
        pointerUp(20);
        expect(types).toEqual(["start", "move", "end"]);
        unmount(host);
    });

    it("applies minDragDistance", () => {
        const host = createHost();
        const types: DragState["type"][] = [];
        render(host, () => useDragObserve({ minDragDistance: 50 }, []))(event => types.push(event.type));
        pointerDown(host);
        pointerMove(20);
        pointerUp(20);
        expect(types).toEqual([]);
        unmount(host);
    });
});
