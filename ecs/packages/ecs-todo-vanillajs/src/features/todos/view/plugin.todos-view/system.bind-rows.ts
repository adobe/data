// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { done, label, todo } from "../../model/index.js";
import { list } from "./resource.list.js";

/** Writes what changed of each todo to its row, where the list shows one. */
export const bindRows: System = System.create({
    readonly: true,
    components: { with: [todo, label, done], changed: [label, done] },
    resources: { is: [list] },
}, (item, { resources }) => {
    const element = resources[list].elementOf(item.entity);
    if (element === null) return;
    element.label = item[label];
    element.done = item[done];
});
