import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The sample's folder, the package root it imports the ECS from, and the implementation's index, which it never does. */
const sample = dirname(fileURLToPath(import.meta.url));
const packageIndex = resolve(sample, "../../index.js");
const implementationIndex = resolve(sample, "../../implementation/index.js");

/** The features each feature builds on. */
const builtOn: { readonly [feature: string]: readonly string[] } = { todos: [], filter: ["todos"], completion: ["todos"], generate: ["todos"] };

/** Every TypeScript file under a directory. */
const filesOf = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesOf(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);

/** A path's segments within the sample, or null for one outside it. */
const segmentsOf = (path: string): readonly string[] | null => {
    const inside = relative(sample, path);
    return inside.startsWith("..") || inside === "" ? null : inside.split(sep);
};

/** Whether a path is inside one of the sample's `elements` folders. */
const inElements = (path: string): boolean => segmentsOf(path)?.slice(0, -1).includes("elements") ?? false;

/** The feature a path is in, or null, as for `features/index.ts`, which exports them all. */
const featureOf = (path: string): string | null => {
    const segments = segmentsOf(path);
    return segments !== null && segments[0] === "features" && segments.length > 2 ? segments[1] : null;
};

/** The specifiers a file imports or re-exports, statically or dynamically, and the modules its declarations augment. */
const specifiersOf = (code: string): string[] => [
    ...code.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']/g),
    ...code.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g),
    ...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...code.matchAll(/declare\s+module\s+["']([^"']+)["']/g),
].map(match => match[1] ?? "");

/** Why `file` may not import `specifier`, or null when it may. */
const broken = (file: string, specifier: string): string | null => {
    const test = /\.test(-helper)?\.ts$|\.perf-browser-test\.ts$/.test(file);
    if (!specifier.startsWith(".")) {
        if (inElements(file)) return specifier === "vitest" && test ? null : "an element imports a package";
        return null;
    }
    const target = resolve(dirname(file), specifier);
    if (inElements(file)) return inElements(target) ? null : "an element imports what isn't an element";
    const from = segmentsOf(file);
    const to = segmentsOf(target);
    if (to === null) return target === packageIndex || (test && target !== implementationIndex) ? null : "imports the package other than by its root";
    if (to[0] === "app" && from?.[0] !== "app") return "imports the app";
    if (from?.[0] === "shared" && to[0] === "features") return "shared code imports a feature";
    const feature = featureOf(file);
    const imported = featureOf(target);
    if (feature !== null && imported !== null && imported !== feature && !(builtOn[feature] ?? []).includes(imported)) {
        return `${feature} imports ${imported}, which it doesn't build on`;
    }
    if (feature !== null && from?.[from.length - 1] === "model.ts" && to[to.length - 1] !== "data.js") return "a model imports what isn't data";
    return null;
};

/** Every import in the sample that breaks a rule, with the rule. */
const violations = (files: readonly string[], codeOf: (file: string) => string): string[] => files.flatMap(file =>
    specifiersOf(codeOf(file)).flatMap(specifier => {
        const reason = broken(file, specifier);
        return reason === null ? [] : [`${relative(sample, file)}: ${specifier}: ${reason}`];
    }));

describe("the todo sample's imports", () => {
    it("keep to its layers: elements import nothing but each other, models only data, and no feature imports one built on it or the app", () => {
        const files = filesOf(sample);
        expect(files.filter(inElements).length).toBeGreaterThan(5);
        expect(violations(files, file => readFileSync(file, "utf8"))).toEqual([]);
    });

    it("create worlds through World.create from the package root, never through the implementation", () => {
        const at = (...path: string[]): string => join(sample, ...path);
        expect(violations([at("app", "app.ts"), at("app", "app.test.ts")], () => `import { create } from "../../../implementation/index.js";`)).toEqual([
            `app/app.ts: ../../../implementation/index.js: imports the package other than by its root`,
            `app/app.test.ts: ../../../implementation/index.js: imports the package other than by its root`,
        ]);
    });

    it("find each kind of import that breaks a rule", () => {
        const at = (...path: string[]): string => join(sample, ...path);
        const imports = new Map<string, string>([
            [at("features", "todos", "elements", "todo-row.ts"), `
                import { System } from "../../../../../index.js";
                import "@adobe/ecs";
                const later = import("../dom.js");
                import { on } from "../../../../other/elements/thing.js";`],
            [at("features", "todos", "elements", "elements.browser.test.ts"), `import { it } from "vitest"; import { part } from "../../../shared/elements/elements.test-helper.js";`],
            [at("features", "todos", "model.ts"), `import { filter } from "../filter/data.js"; import { list } from "./dom.js"; import { done } from "./data.js";`],
            [at("features", "filter", "dom.ts"), `import { row } from "../todos/dom.js"; import { summary } from "../completion/dom.js";`],
            [at("shared", "connect.ts"), `import { todos } from "../features/todos/feature.js";`],
            [at("features", "generate", "events.ts"), `import { createApp } from "../../app/app.js"; import { thing } from "../../../implementation/world/create.js";`],
        ]);
        expect(violations([...imports.keys()], file => imports.get(file) ?? "")).toEqual([
            "features/todos/elements/todo-row.ts: ../../../../../index.js: an element imports what isn't an element",
            "features/todos/elements/todo-row.ts: ../../../../other/elements/thing.js: an element imports what isn't an element",
            "features/todos/elements/todo-row.ts: @adobe/ecs: an element imports a package",
            "features/todos/elements/todo-row.ts: ../dom.js: an element imports what isn't an element",
            "features/todos/model.ts: ../filter/data.js: todos imports filter, which it doesn't build on",
            "features/todos/model.ts: ./dom.js: a model imports what isn't data",
            "features/filter/dom.ts: ../completion/dom.js: filter imports completion, which it doesn't build on",
            "shared/connect.ts: ../features/todos/feature.js: shared code imports a feature",
            "features/generate/events.ts: ../../app/app.js: imports the app",
            "features/generate/events.ts: ../../../implementation/world/create.js: imports the package other than by its root",
        ]);
    });
});
