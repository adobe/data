// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index, System } from "@adobe/ecs";
import { order, todo } from "../model/index.js";
import { row } from "./component.row.js";
import { list } from "./resource.list.js";

/** Todos with rows, in list order. */
const placed = Index.create({ key: [order], sorted: true, components: { with: [todo, row] } });

/**
 * Places each new or moved row after the row before it in list order. Rows pass in list order, so the one before is
 * always placed already. A row already there isn't touched, and one in the list moves without leaving it, which keeps
 * its focus.
 */
export const placeRows: System = System.create({
    readonly: true,
    components: { with: [row, order], changed: [row, order] },
    order: placed,
    resources: { is: [list] },
    lookup: { placed: { index: placed } },
}, (item, { resources, lookup }) => {
    const element = item[row];
    const parent = resources[list];
    const earlier = lookup.placed({ "<": item[order] });
    const before = earlier.length === 0 ? parent.firstElementChild : earlier.at(earlier.length - 1)[row].nextElementSibling;
    if (before !== element) place(parent, element, before);
});

/**
 * Puts `element` before `before` in `parent`. One already there moves with `moveBefore`, without leaving it, where the
 * browser has it; otherwise it leaves and comes back, and gets back the focus it had.
 */
const place = (parent: Element, element: HTMLElement, before: Element | null): void => {
    const moveBefore: unknown = Reflect.get(parent, "moveBefore");
    if (element.parentNode === parent && typeof moveBefore === "function") {
        Reflect.apply(moveBefore, parent, [element, before]);
        return;
    }
    const focused = element.matches(":focus");
    parent.insertBefore(element, before);
    if (focused) element.focus({ preventScroll: true });
};
