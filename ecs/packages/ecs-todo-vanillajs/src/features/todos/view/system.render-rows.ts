// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { byDoneInOrder, done, label, order, ordered } from "../model/index.js";
import { attach, entityOfElement } from "../../page/view/index.js";
import { list } from "./resource.list.js";
import { onlyDone } from "./resource.only-done.js";

/**
 * Renders the todos the list shows, in list order, in the range of them it needs: the list keeps the row of each todo
 * that stays in it, and this binds the rows it gives todos that entered. The focused row stays while its todo is
 * shown, wherever it is. Each pass reads only the range, and a pass that changed none of it writes nothing.
 */
export const renderRows: System = System.create({
    readonly: true,
    resources: { is: [list] },
    lookup: {
        all: { index: ordered },
        some: { index: byDoneInOrder },
        allBefore: { index: ordered },
        someBefore: { index: byDoneInOrder },
        todos: { with: [label, done, order] },
    },
}, ({ resources, lookup }) => {
    const element = resources[list];
    const only = resources[onlyDone];
    const shown = only === null ? lookup.all() : lookup.some(only);
    element.count = shown.length;
    const { start, end } = element.range;
    const last = Math.min(end, shown.length);
    keys.length = 0;
    for (let i = start; i < last; i++) keys.push(shown.at(i).entity);
    element.render(start, keys, (row, _key, index) => {
        const entity = keys[index - start];
        const values = entity === undefined ? null : lookup.todos(entity);
        if (entity === undefined || values === null) return;
        attach(row, entity);
        row.label = values[label];
        row.done = values[done];
    }, row => {
        const values = lookup.todos(entityOfElement(row));
        if (values === null || (only !== null && values[done] !== only)) return -1;
        return only === null ? lookup.allBefore({ "<": values[order] }).length : lookup.someBefore(only, { "<": values[order] }).length;
    });
});

/** The todos in the range, reused by each pass. */
const keys: Entity[] = [];
