// © 2026 Adobe. MIT License. See /LICENSE for details.
import { check, type Violation } from "../index.js";

const readme = (name: string, summary: string): string => `# ${name}\n\n${summary}\n`;

// A todos feature, its model and its view, and main, the app, putting them together: every file of the source folder.
const files: Record<string, string> = {
    "features/todos/model/README.md": readme("model", "The todos' data."),
    "features/todos/model/index.ts": "export * from './component.title.js';\nexport * from './system.add-todo.js';\n",
    "features/todos/model/component.title.ts": "/** A todo's title. */\nexport const title = Symbol();\n",
    "features/todos/model/system.add-todo.ts": "import { System } from '@adobe/ecs';\n\n/** Adds a todo. */\nexport const addTodo: System = System.create({}, () => {});\n",
    "features/todos/view/README.md": readme("view", "The todos on the page."),
    "features/todos/view/index.ts": "export * from './function.show-title.js';\n",
    "features/todos/view/function.show-title.ts": "import { title } from '../model/index.js';\n\n/** What a todo shows. */\nexport const showTitle = (): symbol => title;\n",
    "features/main/view/README.md": readme("view", "The app, starting the todos."),
    "features/main/view/index.ts": "export {};\n",
    "features/main/view/entry.page.ts": "import { addTodo } from '../../todos/model/index.js';\nimport { showTitle } from '../../todos/view/index.js';\n\nworld.run(addTodo);\ndocument.title = String(showTitle());\n\ndeclare const world: { run(system: unknown): void };\n",
};

const print = (label: string, violations: readonly Violation[]): void => {
    console.log(`${label}: ${violations.length} violation(s)`);
    for (const violation of violations) console.log(`  [${violation.rule}] ${violation.file}: ${violation.fix.split(". ")[0]}`);
};

export const main = async (): Promise<void> => {
    print("as written", await check(files));
    print("deep import", await check({ ...files, "features/todos/view/function.show-title.ts": files["features/todos/view/function.show-title.ts"]?.replace("../model/index.js", "../model/component.title.js") ?? "" }));
    print("model reads the page", await check({ ...files, "features/todos/model/system.add-todo.ts": files["features/todos/model/system.add-todo.ts"]?.replace("() => {}", "() => void document.title") ?? "" }));
    print("nothing runs a system", await check({ ...files, "features/main/view/entry.page.ts": files["features/main/view/entry.page.ts"]?.replace("world.run(addTodo);\n", "addTodo;\n") ?? "" }));
    print("an export nobody uses", await check({
        ...files,
        "features/todos/model/index.ts": `${files["features/todos/model/index.ts"] ?? ""}export * from './constant.limit.js';\n`,
        "features/todos/model/constant.limit.ts": "/** The most todos shown. */\nexport const limit = 100;\n",
    }));
};
