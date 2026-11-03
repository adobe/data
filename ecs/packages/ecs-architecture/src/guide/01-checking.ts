// © 2026 Adobe. MIT License. See /LICENSE for details.
import { check, type Violation } from "../index.js";

const readme = (name: string): string => `# ${name}\n\nThe ${name} of the todos.\n`;
const noSystems = "import type { System } from '@adobe/ecs';\n\nexport const systems: readonly System[] = [];\n";

// A todos feature, its model and its view, and an app putting them together: every file of the source folder.
const files: Record<string, string> = {
    "todos/model/README.md": readme("model"),
    "todos/model/index.ts": "export * from './component.title.js';\nexport * from './constant.systems.js';\nexport * from './system.add-todo.js';\n",
    "todos/model/component.title.ts": "/** A todo's title. */\nexport const title = Symbol();\n",
    "todos/model/system.add-todo.ts": "import { System } from '@adobe/ecs';\n\n/** Adds a todo. */\nexport const addTodo: System = System.create({}, () => {});\n",
    "todos/model/constant.systems.ts": noSystems,
    "todos/view/README.md": readme("view"),
    "todos/view/index.ts": "export * from './constant.systems.js';\nexport * from './function.show-title.js';\n",
    "todos/view/constant.systems.ts": noSystems,
    "todos/view/function.show-title.ts": "import { title } from '../model/index.js';\n\n/** What a todo shows. */\nexport const showTitle = (): symbol => title;\n",
    "app/main.ts": "import { addTodo } from '../todos/model/index.js';\nimport { showTitle } from '../todos/view/index.js';\n\ndeclare const world: { run(system: unknown): void };\nworld.run(addTodo);\nexport const shown = showTitle();\n",
};

const print = (label: string, violations: readonly Violation[]): void => {
    console.log(`${label}: ${violations.length} violation(s)`);
    for (const violation of violations) console.log(`  [${violation.rule}] ${violation.file}: ${violation.fix.split(". ")[0]}`);
};

export const main = async (): Promise<void> => {
    print("as written", check(files));
    print("deep import", check({ ...files, "todos/view/function.show-title.ts": files["todos/view/function.show-title.ts"]?.replace("../model/index.js", "../model/component.title.js") ?? "" }));
    print("model reads the page", check({ ...files, "todos/model/system.add-todo.ts": files["todos/model/system.add-todo.ts"]?.replace("() => {}", "() => void document.title") ?? "" }));
    print("nothing runs a system", check({ ...files, "app/main.ts": files["app/main.ts"]?.replace("world.run(addTodo);\n", "export const add = addTodo;\n") ?? "" }));
    print("an export nobody uses", check({
        ...files,
        "todos/model/index.ts": `${files["todos/model/index.ts"] ?? ""}export * from './constant.limit.js';\n`,
        "todos/model/constant.limit.ts": "/** The most todos shown. */\nexport const limit = 100;\n",
    }));
};
