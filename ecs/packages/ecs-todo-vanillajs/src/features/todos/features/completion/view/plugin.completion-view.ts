// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoSummary, TodoToggleAll } from "../elements/index.js";
import { clearCompleted, toggleAll } from "../model/index.js";
import { all, define, on, root } from "../../../../../view/index.js";
import { findCompletion } from "./plugin.completion-view/system.find-completion.js";
import { bindCompletion } from "./plugin.completion-view/system.bind-completion.js";

/** Completion on the page within the app's root: how many todos are left, marking all done or none, and clearing those done. */
export const completionView: Plugin<typeof root> = {
    systems: [findCompletion, bindCompletion],
    connect: (world, { [root]: page }) => {
        define({ "todo-summary": TodoSummary, "todo-toggle-all": TodoToggleAll });
        return all(
            on(page, "todo-toggle-all", event => void world.run(toggleAll, { done: event.detail.done })),
            on(page, "todo-clear-completed", () => void world.run(clearCompleted)),
        );
    },
};
