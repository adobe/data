// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { done, label, order, orderAfter, ordered, Todo } from "../../todos/model/index.js";
import { generatedLabel } from "./shared/function.generated-label.js";

/** Adds `count` todos with generated labels at the end of the list. */
export const addGenerated: System<{ readonly count: number }> = System.create({
    lookup: { ordered: { index: ordered } },
}, ({ lookup, commands }, input: { readonly count: number }) => {
    const all = lookup.ordered();
    const first = orderAfter(all);
    const spawn = commands.spawn(Todo);
    for (let i = 0; i < input.count; i++) spawn({ [label]: generatedLabel(all.length + i), [done]: false, [order]: first + i });
});
