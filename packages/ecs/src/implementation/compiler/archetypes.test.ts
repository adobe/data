// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { archetypeInsertions } from './archetypes.js';
import { insertInto } from './source-map.js';
import { moduleOf } from './type-schemas.js';

/** The module as the pass leaves it without the function it appends, its failure's message, or null. */
const passed = (code: string): string | null => {
    const result = archetypeInsertions(moduleOf("/src/lists.ts", code, parseAst(code, { lang: "ts" }, "/src/lists.ts")));
    if (result === null) return null;
    if ("failure" in result) return `failure: ${result.failure.message}`;
    return insertInto(code, result.insertions, "/src/lists.ts").code.replace(/\nfunction archetype\$\d*\(list\) \{.*\}\n$/, "");
};

const keys = `import { label, type Other } from "./keys.js";\nconst todo = Symbol();\nconst done = Symbol();\n`;

describe("archetypeInsertions", () => {
    test("gives a top-level list of keys declared as const an index, its own keys or imported", () => {
        expect(passed(`${keys}export const Todo = [todo, label, done] as const;`)).toBe(`${keys}export const Todo = archetype$([todo, label, done] as const);`);
    });
    test("gives an index to lists spreading lists of keys, and to lists in what the module makes as it loads", () => {
        expect(passed(`${keys}const Node = [todo, done] as const;\nconst Kinds = [[...Node, label] as const, { list: [label] as const }];`))
            .toBe(`${keys}const Node = archetype$([todo, done] as const);\nconst Kinds = [archetype$([...Node, label] as const), { list: archetype$([label] as const) }];`);
    });
    test("leaves a list spreading what isn't a list of keys", () => {
        expect(passed(`${keys}const named = [todo];\nconst Node = [...named, done] as const;`)).toBe(null);
    });
    test("leaves lists it can't tell are only keys, or that aren't declared as const", () => {
        expect(passed(`${keys}const loose = [todo, done];\nconst mixed = [todo, 1] as const;\nconst named = [todo, other] as const;\nconst empty = [] as const;`)).toBe(null);
    });
    test("leaves a list in a function, which isn't made once", () => {
        expect(passed(`${keys}const make = () => [todo, done] as const;`)).toBe(null);
    });
    test("fails for a list naming one of its module's keys twice, and leaves one naming an import twice", () => {
        expect(passed(`${keys}const Todo = [todo, done, todo] as const;`)).toBe("failure: this list names todo twice; a list of components names each once");
        expect(passed(`${keys}const Labels = [label, label] as const;`)).toBe(null);
    });
    test("leaves a module binding a global the appended function uses", () => {
        expect(passed(`${keys}const Object = 1;\nconst Todo = [todo, done] as const;`)).toBe(null);
    });
    test("appends a function giving each list its index once", () => {
        const code = `${keys}const Todo = [todo, done] as const;`;
        const result = archetypeInsertions(moduleOf("/src/lists.ts", code, parseAst(code, { lang: "ts" }, "/src/lists.ts")));
        const whole = result !== null && "insertions" in result ? insertInto(code, result.insertions, "/src/lists.ts").code : "";
        expect(whole.match(/function archetype\$\(list\)/g)?.length).toBe(1);
    });
});
