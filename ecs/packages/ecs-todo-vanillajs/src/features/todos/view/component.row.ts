// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Finalizer } from "@adobe/ecs";
import type { TodoRow } from "../elements/index.js";

/** The row showing a todo, removed from the page when the todo or its row goes. */
export const row = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [row]: { type: TodoRow; thread: "main" };
    }
}

Finalizer.create({ components: { with: [row] } }, item => {
    item[row].remove();
});
