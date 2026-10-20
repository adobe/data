import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The sample's folder. */
const sample = dirname(fileURLToPath(import.meta.url));

/** Every TypeScript file under a directory. */
const filesOf = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesOf(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);

/** Whether a path is inside one of the sample's `elements` folders. */
const inElements = (path: string): boolean => relative(sample, path).split(sep).includes("elements");

/** The specifiers a file imports or re-exports, statically or dynamically, and the modules its declarations augment. */
const specifiersOf = (code: string): string[] => [
    ...code.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']/g),
    ...code.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g),
    ...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...code.matchAll(/declare\s+module\s+["']([^"']+)["']/g),
].map(match => match[1] ?? "");

/** Whether an element module, or its tests, may import `specifier`: only another module of an `elements` folder, and tests the runner too. */
const allowed = (file: string, specifier: string): boolean => {
    if (specifier === "vitest") return file.endsWith(".test.ts");
    return specifier.startsWith(".") && inElements(resolve(dirname(file), specifier));
};

describe("the todo sample's elements", () => {
    it("import nothing but each other: nothing of the ECS, and no package", () => {
        const files = filesOf(sample).filter(inElements);
        expect(files.length).toBeGreaterThan(5);
        const outside = files.flatMap(file => specifiersOf(readFileSync(file, "utf8")).filter(specifier => !allowed(file, specifier)).map(specifier => `${relative(sample, file)}: ${specifier}`));
        expect(outside).toEqual([]);
    });

    it("finds imports from anywhere else", () => {
        const element = join(sample, "features", "todos", "elements", "todo-row.ts");
        const test = join(sample, "features", "todos", "elements", "elements.browser.test.ts");
        const code = `
            import { System } from "../../../../../index.js";
            import type { World } from "../../../../../index.js";
            export { done } from "../data.js";
            import "@adobe/data-ecs";
            const later = import("../dom.js");
            declare module "@adobe/data-ecs" {}`;
        expect(specifiersOf(code)).toEqual(["../../../../../index.js", "../../../../../index.js", "../data.js", "@adobe/data-ecs", "../dom.js", "@adobe/data-ecs"]);
        expect(specifiersOf(code).filter(specifier => allowed(element, specifier))).toEqual([]);
        expect(allowed(element, "vitest")).toBe(false);
        expect(allowed(test, "vitest")).toBe(true);
        expect(allowed(element, "./todo-list.js")).toBe(true);
        expect(allowed(element, "../../../shared/elements/elements.test-helper.js")).toBe(true);
    });
});
