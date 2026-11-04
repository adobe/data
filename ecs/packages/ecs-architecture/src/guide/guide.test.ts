// © 2026 Adobe. MIT License. See /LICENSE for details.
import { checkChapters } from "ecs-guide-checks";

/** What each chapter teaches, which its prose names as code and its program does. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    1: ["check(files)", "Violation", "violation.rule", "violation.fix", "constant.systems.ts", "world.run(addTodo)", "index.ts", "README.md"],
    2: ["diagrams(files)", "updates", "problems", "ARCHITECTURE.md"],
    3: ["Config", "layers", "kinds", "apps", "systems", "defaults.kinds"],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    1: [["world.run(addTodo);\\nexport const shown", "export const shown"], ["void document.title", "{}"], ["export * from './constant.limit.js';\\n", ""]],
    2: [["[\"../../todos/model/index.js\"]", "[]"], ["...layer(\"todos/view\", \"Rows bound to the todos.\", [\"../model/index.js\"]),\n", ""]],
    3: [["ui: [\"core\", \"ui\"]", "ui: [\"ui\"]"], ["apps: [\"demos\"],\n", ""], ["kinds: [...defaults.kinds, \"shader\"],\n", ""]],
};

checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
