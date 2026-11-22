// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { surface } from "../../../ports/index.js";
import { clearSelection, dragSelect, pressSelect, releaseSelect, selectConnected } from "../model/index.js";

/**
 * Selecting with the left button on the scene's canvas: pressing picks a face and dragging extends the selection, with
 * Shift in a straight line and with Ctrl, or ⌘, in a rectangle, by the keys held at each moment of the drag, its shape
 * changing as they're pressed and released, and as they are when it's let go; double-clicking selects the faces
 * connected to one. Escape, or Alt+A as in Blender, deselects every face. Alt and the left button are the camera's.
 */
export const selectionPorts: Plugin<typeof surface> = {
    systems: [],
    connect: (world, { [surface]: canvas }) => {
        let dragging: number | null = null;
        // Where the drag's pointer last was, so a key pressed or released without moving it changes the drag there.
        let last = { x: 0, y: 0, aspect: 1 };
        const extend = (keys: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean }): void =>
            void world.run(dragSelect, { ...last, shift: keys.shiftKey, ctrl: keys.ctrlKey || keys.metaKey });
        const at = (event: MouseEvent) => {
            const bounds = canvas.getBoundingClientRect();
            const width = Math.max(bounds.width, 1);
            const height = Math.max(bounds.height, 1);
            return { x: (event.clientX - bounds.left) / width * 2 - 1, y: 1 - (event.clientY - bounds.top) / height * 2, aspect: width / height };
        };
        const down = (event: PointerEvent): void => {
            if (event.button !== 0 || event.altKey) return;
            dragging = event.pointerId;
            canvas.setPointerCapture(event.pointerId);
            last = at(event);
            void world.run(pressSelect, last);
        };
        const move = (event: PointerEvent): void => {
            if (event.pointerId !== dragging) return;
            last = at(event);
            extend(event);
        };
        const up = (event: PointerEvent): void => {
            if (event.pointerId !== dragging) return;
            dragging = null;
            canvas.releasePointerCapture(event.pointerId);
            last = at(event);
            extend(event);
            void world.run(releaseSelect);
        };
        const double = (event: MouseEvent): void => {
            if (event.button === 0 && !event.altKey) void world.run(selectConnected, at(event));
        };
        const modifier = (event: KeyboardEvent): void => {
            if (dragging !== null && (event.key === "Shift" || event.key === "Control" || event.key === "Meta")) extend(event);
        };
        const key = (event: KeyboardEvent): void => {
            modifier(event);
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.key !== "Escape" && !(event.altKey && event.code === "KeyA")) return;
            event.preventDefault();
            void world.run(clearSelection);
        };
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", up);
        canvas.addEventListener("dblclick", double);
        document.addEventListener("keydown", key);
        document.addEventListener("keyup", modifier);
        return () => {
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", up);
            canvas.removeEventListener("dblclick", double);
            document.removeEventListener("keydown", key);
            document.removeEventListener("keyup", modifier);
        };
    },
};
