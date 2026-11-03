// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { todo } from "../model/index.js";
import { attach } from "../../page/view/index.js";
import { row } from "./component.row.js";
import { list } from "./resource.list.js";

/**
 * Gives each new todo a row, attached to it for events from the row, while the page has a list for it. It isn't placed
 * until the row is the todo's, so a todo gone first never shows one.
 */
export const createRows: System = System.create({
    components: { with: [todo], not: [row] },
    resources: { is: [list] },
}, (item, { commands }) => {
    commands.add(item.entity, row, attach(document.createElement("todo-row"), item.entity));
});
