import { System } from "../../../../index.js";
import { Todo, done, label, order, ordered, todo } from "../todos/data.js";

const verbs = ["Buy", "Call", "Fix", "Read", "Write", "Plan", "Clean", "Book"];
const nouns = ["milk", "the plumber", "the bike", "a novel", "a letter", "the trip", "the kitchen", "a table"];

/** The label of the `n`th generated todo. */
export const generatedLabel = (n: number): string => `${verbs[n % verbs.length]} ${nouns[Math.floor(n / verbs.length) % nouns.length]} #${n + 1}`;

/** Adds `count` todos with generated labels at the end of the list. */
export const addGenerated = System.create({
    name: "generate/add",
    input: { type: "object", properties: { count: { type: "integer", minimum: 0 } } },
    lookup: { ordered: { index: ordered, read: [order] } },
}, ({ input, lookup, commands }) => {
    const all = lookup.ordered();
    const first = all.length === 0 ? 0 : all.at(all.length - 1)[order] + 1;
    const spawn = commands.spawn(Todo);
    for (let i = 0; i < input.count; i++) spawn({ [todo]: true, [label]: generatedLabel(all.length + i), [done]: false, [order]: first + i });
});
