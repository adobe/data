import { System } from "../../../../index.js";
import { Todo, done, label, order, orderAfter, ordered } from "../todos/data.js";

const tasks = ["Buy milk", "Call the plumber", "Fix the bike", "Read a novel", "Write a letter", "Plan the trip", "Clean the kitchen", "Book a table"];

/** The label of the `n`th generated todo. */
export const generatedLabel = (n: number): string => `${tasks[n % tasks.length]} #${n + 1}`;

/** Adds `count` todos with generated labels at the end of the list. */
export const addGenerated = System.create({
    name: "generate/add",
    input: { type: "object", properties: { count: { type: "integer", minimum: 0 } } },
    lookup: { ordered: { index: ordered, read: [order] } },
}, ({ input, lookup, commands }) => {
    const all = lookup.ordered();
    const first = orderAfter(all);
    const spawn = commands.spawn(Todo);
    for (let i = 0; i < input.count; i++) spawn({ [label]: generatedLabel(all.length + i), [done]: false, [order]: first + i });
});
