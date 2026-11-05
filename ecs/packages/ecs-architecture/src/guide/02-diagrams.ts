// © 2026 Adobe. MIT License. See /LICENSE for details.
import { diagrams } from "../index.js";

/** A layer with one root file, which imports `uses`, and a README whose first sentence describes it. */
const layer = (path: string, description: string, uses: readonly string[] = []): Record<string, string> => ({
    [`${path}/README.md`]: `# ${path}\n\n${description}\n`,
    [`${path}/index.ts`]: "export * from './constant.systems.js';\n",
    [`${path}/constant.systems.ts`]: `${uses.map((spec, at) => `import { systems as used${at} } from '${spec}';\n`).join("")}export const systems = [];\n`,
});

// todos has a model and a view; filter builds on the todos model; the app puts both together.
const files: Record<string, string> = {
    ...layer("todos/model", "Todos and what a user does to them."),
    ...layer("todos/view", "Rows bound to the todos.", ["../model/index.js"]),
    ...layer("filter/model", "Which todos show.", ["../../todos/model/index.js"]),
    "app/main.ts": "import { systems as filter } from '../filter/model/index.js';\nimport { systems as rows } from '../todos/view/index.js';\nexport const systems = [...filter, ...rows];\n",
};

/** The arrows and the table rows of a diagram, the lines a reader follows. */
const shown = (text: string | undefined): string[] => (text ?? "").split("\n").filter(line => (line.includes(" --> ") && !line.startsWith("<!--")) || line.startsWith("| ["));

export const main = async (): Promise<void> => {
    const { updates, problems } = await diagrams(files);
    console.log("writes", Object.keys(updates).sort().join(", "));
    for (const line of shown(updates["ARCHITECTURE.md"])) console.log(line);
    for (const line of shown(updates["todos/ARCHITECTURE.md"])) console.log(line);
    console.log("problems", problems.length);
    const wordy = await diagrams({ ...files, "filter/model/README.md": "# filter\n\nWhich of the todos show in the list, by whether each is done, as the user picks it.\n" });
    for (const problem of wordy.problems) console.log(problem);
    const again = await diagrams({ ...files, ...updates });
    console.log("current once written:", Object.keys(again.updates).length === 0);
};
