// © 2026 Adobe. MIT License. See /LICENSE for details.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { transformKernels } from './transform.js';
import { createLinker } from './link.js';
import { nodeCopies, ownCopy } from './paths.js';
import { estreeOf } from './estree.js';

const parse = (code: string) => estreeOf(parseAst(code));

const header = `import { System, Vec2 } from "ecs";
import { near, drift } from "./helpers.js";
const cell = Symbol();
const value = Symbol();
const camera = Symbol();
const range = 3;
`;

/** Modules besides the one transformed. */
const files: { readonly [file: string]: string } = {
    "/helpers.js": `const limit = 2;\nexport const near = (x, y) => Math.abs(x - y) <= limit;\nlet offset = 0;\nexport const drift = x => x + offset;\n`,
};

const transform = (source: string) => transformKernels(`${header}${source}`, "/test.js", parse, async specifier => specifier === "ecs" ? ownCopy : null, index => JSON.stringify(`kernel:${index}`), createLinker({
    packages: nodeCopies,
    resolve: async (specifier, importer) => {
        if (specifier === "ecs") return ownCopy.index;
        if (specifier === "./helpers.js" && importer === "/test.js") return "/helpers.js";
        if (!specifier.startsWith(".")) return { error: `${specifier} can't be resolved` };
        const path = resolve(dirname(importer), specifier);
        const typescript = path.replace(/\.js$/, ".ts");
        return existsSync(typescript) ? typescript : path;
    },
    load: async file => {
        const code = files[file] ?? await readFile(file, "utf8");
        if (!file.endsWith(".ts")) return { code };
        const { transformWithOxc } = await import("vite");
        return { code: (await transformWithOxc(code, file, { lang: "ts" })).code };
    },
}, parse));

/** What the build gives a system's declaration, or why it fails. */
const built = async (where: string, wrap = (system: string): string => `export const visible = ${system};`): Promise<string> => {
    const result = await transform(wrap(`System.create({ kernel: false, components: { with: [value], where: { [cell]: ${where} } } }, row => { void row[value]; })`));
    if (result === null) return "untransformed";
    return "failure" in result ? result.failure.message : result.code;
};

describe("where predicates", () => {
    test("read their value, resources, literals, module constants and pure functions, which the build infers the resources of", async () => {
        expect(await built(`(at, { resources }) => near(at[0], resources[camera].x) && Math.abs(at[1]) < range`)).toContain(`where: [camera]`);
        expect(await built(`([x, y]) => Vec2.length([x, y]) < range`)).toContain(`where: []`);
        expect(await built(`function (at, context) { const { resources } = context; return at[0] < resources[camera].x; }`)).toContain(`where: [camera]`);
    });
    test("fail the build where they read what may change outside the world", async () => {
        expect(await built(`at => at[0] < limit`, system => `let limit = 2;\nexport const visible = ${system};`)).toContain("a where predicate reads limit, a module variable that may change");
        expect(await built(`at => at[0] < bounds.x`, system => `const bounds = { x: 2 };\nexport const visible = ${system};`)).toContain("a where predicate reads bounds, which holds values that may change");
        expect(await built(`at => at[0] < window.innerWidth`)).toContain("a where predicate reads the global window, which may change");
        expect(await built(`at => at[0] < width`, system => `export const make = (width) => ${system.replace("export const visible = ", "")};`)).toContain("a where predicate reads width, which a function around it declares and may change");
        expect(await built(`at => drift(at[0]) < range`)).toContain("a where predicate reads offset, a module variable that may change");
        expect(await built(`(at, { resources }) => { resources[camera] = at; return true; }`)).toContain("a where predicate writes through resources, which it only reads");
    });
    const holes: readonly { readonly what: string; readonly where: string; readonly wrap?: (system: string) => string; readonly fails: string }[] = [
        { what: "Math.random", where: "at => at[0] < Math.random()", fails: "a where predicate reads Math.random, which isn't pure" },
        { what: "Math.random by another name", where: "at => { const draw = Math.random; return at[0] < draw(); }", fails: "a where predicate reads Math.random, which isn't pure" },
        { what: "assigning into its value", where: "at => { at[0] = 1; return true; }", fails: "a where predicate writes through at, which it only reads" },
        { what: "sorting its value", where: "at => { at.sort(); return true; }", fails: "a where predicate calls at.sort, which may change what it reads" },
        { what: "setting a resource's value", where: "(at, { resources }) => { resources[camera].set(at); return true; }", fails: "a where predicate calls resources[camera].set, which may change what it reads" },
        { what: "assigning a global's member", where: "at => { Math.PI = 3; return at[0] < 1; }", fails: "a where predicate writes through Math, which it only reads" },
        { what: "assigning through a global's prototype", where: "at => { Number.prototype.x = 1; return at[0] < 1; }", fails: "a where predicate writes through Number, which it only reads" },
        { what: "counting on a function object", where: "at => { count.n++; return at[0] < 1; }", wrap: system => `function count() {}\nexport const visible = ${system};`, fails: "a where predicate writes through count, which it only reads" },
        { what: "importing a module", where: `at => { void import("./helpers.js"); return at[0] < 1; }`, fails: "a where predicate imports a module, which may run anything" },
        { what: "deleting from its value", where: "at => { delete at.x; return true; }", fails: "a where predicate writes through at, which it only reads" },
        { what: "a helper assigning into what it's given", where: "at => bump(at)", wrap: system => `const bump = values => { values[0] = 1; return true; };\nexport const visible = ${system};`, fails: "a where predicate writes through values, which it only reads" },
    ];
    for (const { what, where, wrap, fails } of holes) {
        test(`fail the build on ${what}`, async () => {
            expect(await built(where, wrap)).toContain(fails);
        });
    }
    test("may change what they make of their own, and call the pure members of Math and Number and any other method that doesn't change what it's called on", async () => {
        expect(await built(`at => { const own = [at[0], at[1]]; own.sort(); own[0] = Math.max(own[0], Number.parseFloat("1")); let n = 0; n++; return own[0] + n < Math.PI; }`)).toContain(`where: []`);
        expect(await built(`at => at.map(x => x * 2).includes(4)`)).toContain(`where: []`);
        // A function a resource holds, which the world calls as written.
        expect(await built(`(at, { resources }) => resources[camera].sees(at)`)).toContain(`where: [camera]`);
    });
});
