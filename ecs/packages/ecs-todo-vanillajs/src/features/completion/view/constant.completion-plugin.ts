// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoSummary, TodoToggleAll } from "../elements/index.js";
import { clearCompleted, systems as model, toggleAll } from "../model/index.js";
import { all, define, on } from "../../page/view/index.js";
import { systems } from "./constant.systems.js";

/** Completion on the page within `root`: how many todos are left, marking all done or none, and clearing those done. */
export const completionPlugin: Plugin<"root"> = {
    systems: [...model, ...systems],
    connect: (world, { root }) => {
        define({ "todo-summary": TodoSummary, "todo-toggle-all": TodoToggleAll });
        return all(
            on(root, "todo-toggle-all", event => void world.run(toggleAll, { done: event.detail.done })),
            on(root, "todo-clear-completed", () => void world.run(clearCompleted)),
        );
    },
};

declare module "@adobe/ecs" {
    interface PluginConfig {
        /** The page's element holding the app's markup, whose events the plugins listen for. */
        root: HTMLElement;
    }
}
