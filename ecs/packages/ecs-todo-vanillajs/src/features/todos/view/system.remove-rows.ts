// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { row } from "./component.row.js";

/** Removes a todo's row from the page when the todo or its row goes, and every row when the world is disposed. */
export const removeRows: System<never> = System.removed({ components: { with: [row] } }, item => {
    item[row].remove();
});
