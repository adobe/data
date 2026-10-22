// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = dirname(fileURLToPath(import.meta.url));
const module = join(source, "observe");

/** Every TypeScript file under a directory. */
const filesOf = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesOf(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);

/** The specifiers a file imports or re-exports, statically or dynamically, and the modules its declarations augment. */
const specifiersOf = (file: string): string[] => {
    const code = readFileSync(file, "utf8");
    return [
        ...code.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?\sfrom\s*["']([^"']+)["']/g),
        ...code.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g),
        ...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
        ...code.matchAll(/declare\s+module\s+["']([^"']+)["']/g),
    ].map(match => match[1]);
};

/**
 * Whether `src/observe` may import a specifier from `file`: the interface's index, the public API but for how a world is
 * made, which the factories never do, or a module of its own.
 */
const allowed = (file: string, specifier: string): boolean => {
    if (specifier === "@adobe/ecs") return true;
    if (!specifier.startsWith(".")) return false;
    const target = resolve(dirname(file), specifier);
    return target === join(source, "interface", "index.js") || !relative(module, target).startsWith("..");
};

describe("src/observe, the observer factories", () => {
    it("imports only the interface's index and its own modules", () => {
        const files = filesOf(module);
        expect(files.length).toBeGreaterThan(0);
        const outside = files.flatMap(file => specifiersOf(file).filter(specifier => !allowed(file, specifier)).map(specifier => `${relative(source, file)}: ${specifier}`));
        expect(outside).toEqual([]);
    });

    it("finds imports from anywhere else", () => {
        const file = join(module, "probe.ts");
        expect(["../index.js", "../implementation/index.js", "node:fs", "../interface/world/world.js", "../interface/../index.js"].filter(specifier => allowed(file, specifier))).toEqual([]);
        expect(["../interface/index.js", "./observe.js", "@adobe/ecs"].every(specifier => allowed(file, specifier))).toBe(true);
    });
});
