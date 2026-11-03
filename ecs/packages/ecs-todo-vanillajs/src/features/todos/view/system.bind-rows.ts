// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { done, label } from "../model/index.js";
import { row } from "./component.row.js";

/** Writes what changed of each todo to its row. */
export const bindRows: System = System.create({
    readonly: true,
    components: { with: [label, done, row], changed: [label, done, row] },
}, item => {
    const element = item[row];
    element.label = item[label];
    element.done = item[done];
});
