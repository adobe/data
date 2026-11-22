// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { history } from "../../model/index.js";
import { historyButtons } from "./resource.history-buttons.js";

/** Disables the undo and redo buttons while there's nothing to undo or redo, after a pass that changed the history or found the buttons. */
export const bindHistory: System = System.create({
    readonly: true,
    resources: { is: [historyButtons], changed: [history, historyButtons] },
}, ({ resources }) => {
    const steps = resources[history];
    const { undo, redo } = resources[historyButtons];
    undo.toggleAttribute("disabled", steps === null || steps.undo.length === 0);
    redo.toggleAttribute("disabled", steps === null || steps.redo.length === 0);
});
