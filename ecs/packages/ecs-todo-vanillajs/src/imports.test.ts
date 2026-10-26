// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The sample's sources, and the package holding them, whose own files beside them configure its builds. */
const sample = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(sample);

/** The ECS's root, the only way the sample imports it, and the build plugin, which only configuration imports. */
const ecs = "@adobe/ecs";
const compiler = "@adobe/ecs/compiler";

/** The features each feature builds on. */
const builtOn: { readonly [feature: string]: readonly string[] } = { todos: [], filter: ["todos"], completion: ["todos"], generate: ["todos"] };

/** The package's configuration: the TypeScript files beside `src`. */
const configsOf = (): string[] => readdirSync(packageRoot, { withFileTypes: true })
    .flatMap(entry => entry.isFile() && entry.name.endsWith(".ts") ? [join(packageRoot, entry.name)] : []);

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
    const from = segmentsOf(file);
    if (!specifier.startsWith(".")) {
        if (inElements(file)) return specifier === "vitest" && test ? null : "an element imports a package";
        if (specifier === compiler) return from === null ? null : "imports the build plugin outside the configuration";
        if (specifier.startsWith(`${ecs}/`)) return "imports the package other than by its root";
        return null;
    }
    const target = resolve(dirname(file), specifier);
    if (from === null) return relative(packageRoot, target).startsWith("..") ? "configuration imports what's outside the package by its path" : null;
    if (inElements(file)) return inElements(target) ? null : "an element imports what isn't an element";
    const to = segmentsOf(target);
    if (to === null) return "imports what's outside the sample by its path";
    if (to[0] === "app" && from[0] !== "app") return "imports the app";
    if (from[0] === "shared" && to[0] === "features") return "shared code imports a feature";
    const feature = featureOf(file);
    const imported = featureOf(target);
    if (feature !== null && imported !== null && imported !== feature && !(builtOn[feature] ?? []).includes(imported)) {
        return `${feature} imports ${imported}, which it doesn't build on`;
    }
    if (feature !== null && from[from.length - 1] === "model.ts" && to[to.length - 1] !== "data.js") return "a model imports what isn't data";
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
        // This file's cases are imports in strings, which break the rules on purpose.
        const files = [...filesOf(sample).filter(file => file !== fileURLToPath(import.meta.url)), ...configsOf()];
        expect(files.filter(inElements).length).toBeGreaterThan(5);
        expect(configsOf().length).toBeGreaterThan(0);
        expect(violations(files, file => readFileSync(file, "utf8"))).toEqual([]);
    });

    it("create worlds through World.create from the package root, never through the implementation", () => {
        const at = (...path: string[]): string => join(sample, ...path);
        expect(violations([at("app", "app.ts"), at("app", "app.test.ts")], () => `import { create } from "@adobe/ecs/dist/implementation/index.js";`)).toEqual([
            `app/app.ts: @adobe/ecs/dist/implementation/index.js: imports the package other than by its root`,
            `app/app.test.ts: @adobe/ecs/dist/implementation/index.js: imports the package other than by its root`,
        ]);
    });

    it("import the build plugin only in the configuration, which imports nothing outside the package by its path", () => {
        const code = `import { Compiler } from "@adobe/ecs/compiler"; import { isolation } from "./isolation.ts"; import { sources } from "../ecs/vitest.plugins.ts";`;
        expect(violations([join(packageRoot, "vite.config.ts"), join(sample, "app", "app.ts")], () => code)).toEqual([
            `../vite.config.ts: ../ecs/vitest.plugins.ts: configuration imports what's outside the package by its path`,
            `app/app.ts: @adobe/ecs/compiler: imports the build plugin outside the configuration`,
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
            [at("features", "generate", "events.ts"), `import { createApp } from "../../app/app.js"; import { thing } from "@adobe/ecs/dist/implementation/world/create.js";`],
            [at("app", "app.test.ts"), `import { create } from "../../../ecs/src/implementation/index.js"; import { isolation } from "../../isolation.ts";`],
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
            "features/generate/events.ts: @adobe/ecs/dist/implementation/world/create.js: imports the package other than by its root",
            "app/app.test.ts: ../../../ecs/src/implementation/index.js: imports what's outside the sample by its path",
            "app/app.test.ts: ../../isolation.ts: imports what's outside the sample by its path",
        ]);
    });
});
