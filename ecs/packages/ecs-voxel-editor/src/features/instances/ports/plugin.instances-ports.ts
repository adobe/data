// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { surface } from "../../../ports/index.js";
import { deleteInstanceAt, enterInstanceAt, leaveTo } from "../model/index.js";

/**
 * Instances by keys over the scene's canvas, as Blender's Tab enters edit mode: Tab enters the instance under the
 * pointer, Shift+Tab steps back out, and Delete or Backspace removes the instance under the pointer.
 */
export const instancesPorts: Plugin<typeof surface> = {
    systems: [],
    connect: (world, { [surface]: canvas }) => {
        let at: { x: number; y: number; aspect: number } | null = null;
        const move = (event: PointerEvent): void => {
            const bounds = canvas.getBoundingClientRect();
            const width = Math.max(bounds.width, 1);
            const height = Math.max(bounds.height, 1);
            at = { x: (event.clientX - bounds.left) / width * 2 - 1, y: 1 - (event.clientY - bounds.top) / height * 2, aspect: width / height };
        };
        const leave = (): void => { at = null; };
        const key = (event: KeyboardEvent): void => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.key === "Tab") {
                event.preventDefault();
                if (event.shiftKey) void world.run(leaveTo, { depth: -1 });
                else if (at !== null) void world.run(enterInstanceAt, at);
            } else if ((event.key === "Delete" || event.key === "Backspace") && at !== null) {
                event.preventDefault();
                void world.run(deleteInstanceAt, at);
            }
        };
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerleave", leave);
        document.addEventListener("keydown", key);
        return () => {
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerleave", leave);
            document.removeEventListener("keydown", key);
        };
    },
};
