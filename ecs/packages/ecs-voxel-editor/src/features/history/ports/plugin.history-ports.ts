// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { redo, undo } from "../model/index.js";

/** The history's keys, as in Blender: Ctrl+Z, or ⌘Z, undoes; with Shift, or Ctrl+Y, redoes. */
export const historyPorts: Plugin = {
    systems: [],
    connect: world => {
        const key = (event: KeyboardEvent): void => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (event.code === "KeyZ") void world.run(event.shiftKey ? redo : undo);
            else if (event.code === "KeyY") void world.run(redo);
            else return;
            event.preventDefault();
        };
        document.addEventListener("keydown", key);
        return () => document.removeEventListener("keydown", key);
    },
};
