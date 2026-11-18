// © 2026 Adobe. MIT License. See /LICENSE for details.
import { checkChapters } from "ecs-guide-checks";

/** What each chapter teaches, which its prose names as code and its program does. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    1: ["check(files)", "Violation", "violation.rule", "violation.fix", "entry.page.ts", "world.run(addTodo)", "index.ts", "README.md"],
    2: ["Config", "layers", "kinds", "defaults.kinds"],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    1: [["world.run(addTodo);\\ndocument", "addTodo;\\ndocument"], ["void document.title", "{}"], ["export * from './constant.limit.js';\\n", ""]],
    2: [["ui: [\"core\", \"ui\"]", "ui: [\"ui\"]"], ["kinds: [...defaults.kinds, \"shader\"],\n", ""]],
};

checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
