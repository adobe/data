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

/** The specifiers a file imports or re-exports, statically or dynamically, and the modules its declarations augment. */
const specifiersOf = (code: string): string[] => [
    ...code.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']/g),
    ...code.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g),
    ...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...code.matchAll(/declare\s+module\s+["']([^"']+)["']/g),
].map(match => match[1] ?? "");

/** Why `file` may not import `specifier`, or null when it may. */
const broken = (file: string, specifier: string): string | null => {
    const from = segmentsOf(file);
    if (!specifier.startsWith(".")) {
        if (specifier === compiler) return from === null ? null : "imports the build plugin outside the configuration";
        if (specifier.startsWith(`${ecs}/`)) return "imports the package other than by its root";
        return null;
    }
    const target = resolve(dirname(file), specifier);
    if (from === null) return relative(packageRoot, target).startsWith("..") ? "configuration imports what's outside the package by its path" : null;
    const to = segmentsOf(target);
    if (to === null) return "imports what's outside the sample by its path";
    if (to[0] === "app" && from[0] !== "app") return "imports the app";
    return null;
};

/** Every import in the sample that breaks a rule, with the rule. */
const violations = (files: readonly string[], codeOf: (file: string) => string): string[] => files.flatMap(file =>
    specifiersOf(codeOf(file)).flatMap(specifier => {
        const reason = broken(file, specifier);
        return reason === null ? [] : [`${relative(sample, file)}: ${specifier}: ${reason}`];
    }));

describe("the todo sample's imports", () => {
    it("import the package only by its root, the build plugin only in the configuration, and never the app or what's outside the sample", () => {
        // This file's cases are imports in strings, which break the rules on purpose.
        const files = [...filesOf(sample).filter(file => file !== fileURLToPath(import.meta.url)), ...configsOf()];
        expect(configsOf().length).toBeGreaterThan(0);
        expect(violations(files, file => readFileSync(file, "utf8"))).toEqual([]);
    });

    it("find each kind of import that breaks a rule", () => {
        const at = (...path: string[]): string => join(sample, ...path);
        const imports = new Map<string, string>([
            [join(packageRoot, "vite.config.ts"), `import { Compiler } from "@adobe/ecs/compiler"; import { sources } from "../ecs/vitest.plugins.ts";`],
            [at("features", "generate", "view", "constant.generate-plugin.ts"), `import { createApp } from "../../../app/function.create-app.js"; import { thing } from "@adobe/ecs/dist/implementation/world/create.js";`],
            [at("app", "function.create-app.ts"), `import { Compiler } from "@adobe/ecs/compiler";`],
            [at("app", "function.create-app.test.ts"), `import { create } from "../../../ecs/src/implementation/index.js"; import { isolation } from "../../isolation.ts";`],
        ]);
        expect(violations([...imports.keys()], file => imports.get(file) ?? "")).toEqual([
            "../vite.config.ts: ../ecs/vitest.plugins.ts: configuration imports what's outside the package by its path",
            "features/generate/view/constant.generate-plugin.ts: ../../../app/function.create-app.js: imports the app",
            "features/generate/view/constant.generate-plugin.ts: @adobe/ecs/dist/implementation/world/create.js: imports the package other than by its root",
            "app/function.create-app.ts: @adobe/ecs/compiler: imports the build plugin outside the configuration",
            "app/function.create-app.test.ts: ../../../ecs/src/implementation/index.js: imports what's outside the sample by its path",
            "app/function.create-app.test.ts: ../../isolation.ts: imports what's outside the sample by its path",
        ]);
    });
});
