import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { idOfKey, takeIdOfDeclaration } from '../../interface/registry/ids.js';
import { estreeOf } from './estree.js';
import { identify as identifyModule, moduleIdOf } from './identify.js';
import { attachKernelPath } from './paths.js';
import { decodeMappings } from './source-map.js';

const parse = (code: string) => estreeOf(parseAst(code));
/** Imports from the package, and from `./system.js` for `System` alone, are the package's namespaces. */
const resolve = async (source: string, namespace: string) => source === "@adobe/data-ecs" || (source === "./system.js" && namespace === "System");
const identify = (code: string) => identifyModule(code, "src/keys.ts", parse, resolve);

/** The calls the rewrite wraps around each identified `Symbol(...)`, as `[symbol source, id]`. */
const wrapped = (code: string | undefined): readonly (readonly [string, string])[] =>
    [...(code ?? "").matchAll(/identify\$\((Symbol\([^)]*\)), "([^"]*)"\)/g)].map(match => [match[1] ?? "", match[2] ?? ""]);

describe("identify, for symbols", () => {
    test("gives each top-level Symbol(...) declaration its module's id and binding", async () => {
        const result = await identify([
            `const a = Symbol("a");`,
            `let b = Symbol(), c = 1, d = Symbol("d");`,
            `var e = Symbol("e");`,
            `export const f = Symbol("f"), g = Symbol();`,
            `export default Symbol("h");`,
        ].join("\n"));
        expect(wrapped(result?.code)).toEqual([
            [`Symbol("a")`, "src/keys.ts#a"], [`Symbol()`, "src/keys.ts#b"], [`Symbol("d")`, "src/keys.ts#d"], [`Symbol("e")`, "src/keys.ts#e"],
            [`Symbol("f")`, "src/keys.ts#f"], [`Symbol()`, "src/keys.ts#g"], [`Symbol("h")`, "src/keys.ts#default"],
        ]);
        expect(result?.code).toContain("c = 1");
    });
    test("records each id where the registry reads it, returning the same symbol", async () => {
        const result = await identify(`const a = Symbol("a");\nlet b = Symbol();`);
        const [a, b]: unknown[] = new Function(`${result?.code}\nreturn [a, b];`)();
        expect([typeof a === "symbol" ? idOfKey(a) : a, typeof b === "symbol" ? idOfKey(b) : b]).toEqual(["src/keys.ts#a", "src/keys.ts#b"]);
        expect(typeof a === "symbol" ? a.description : a).toBe("a");
    });
    test("leaves symbols made in functions, blocks and other expressions", async () => {
        expect(await identify([
            `function make() { const inner = Symbol("inner"); return inner; }`,
            `const arrow = () => Symbol("arrow");`,
            `{ const block = Symbol("block"); }`,
            `if (true) var conditional = Symbol("conditional");`,
            `const [first] = [Symbol("first")];`,
            `const shared = Symbol.for("shared");`,
            `const wrapped = Object(Symbol("wrapped"));`,
            `export const later = make();`,
        ].join("\n"))).toBe(null);
    });
    test("leaves a module where Symbol isn't the global", async () => {
        for (const shadow of [`import { Symbol } from "elsewhere";`, `const Symbol = (name) => name;`, `function Symbol() {}`, `class Symbol {}`, `var Symbol;`, `import Symbol from "elsewhere";`, `import * as Symbol from "elsewhere";`]) {
            expect(await identify(`${shadow}\nconst a = Symbol("a");`)).toBe(null);
        }
        expect(await identify(`const globalThis = {};\nconst a = Symbol("a");`)).toBe(null);
    });
    test("doesn't parse code without Symbol(", async () => {
        expect(await identifyModule(`const a = 1;`, "src/keys.ts", () => { throw new Error("parsed"); }, resolve)).toBe(null);
    });
    test("maps the code it returns back to the source", async () => {
        const source = `const a = Symbol("a");\nexport const b = Symbol("b"); const after = 2;`;
        const result = await identify(source);
        const lines = result?.code.split("\n") ?? [];
        const segments = decodeMappings(result?.map.mappings ?? "");
        const at = (line: number, text: string) => {
            const column = lines[line]?.indexOf(text) ?? -1;
            const segment = [...segments[line] ?? []].reverse().find(candidate => candidate.column <= column);
            return segment === undefined ? null : [segment.sourceLine, segment.sourceColumn + column - segment.column];
        };
        expect(at(1, "const after")).toEqual([1, source.split("\n")[1]?.indexOf("const after")]);
        expect(at(1, `Symbol("b")`)).toEqual([1, source.split("\n")[1]?.indexOf(`Symbol("b")`)]);
        expect(result?.map.sources).toEqual(["src/keys.ts"]);
    });
});

/** The declarations the rewrite wraps, as `[declaration source, id]`. */
const declared = (code: string | undefined): readonly (readonly [string, string])[] =>
    [...(code ?? "").matchAll(/identify\$\((\{[^}]*\}), "([^"]*)"\)/g)].map(match => [match[1] ?? "", match[2] ?? ""]);

describe("identify, for systems, rules and finalizers", () => {
    test("gives the declaration of each top-level binding's constructor call its module's id and binding", async () => {
        const result = await identify([
            `import { System as S, Rule, Finalizer } from "@adobe/data-ecs";`,
            `const move = S.create({ name: "move" }, () => {});`,
            `export const draw = S.render({ name: "draw" }, () => {}), main = S.create({ name: "main", systems: [move] });`,
            `const all = S.create([move]);`,
            `let shown = Rule.create({ name: "shown" });`,
            `var release = Finalizer.create({ name: "release" }, () => {});`,
            `export default Finalizer.changes({ name: "save" }, () => {});`,
        ].join("\n"));
        expect(declared(result?.code)).toEqual([
            [`{ name: "move" }`, "src/keys.ts#move"], [`{ name: "draw" }`, "src/keys.ts#draw"], [`{ name: "main", systems: [move] }`, "src/keys.ts#main"],
            [`{ name: "shown" }`, "src/keys.ts#shown"], [`{ name: "release" }`, "src/keys.ts#release"], [`{ name: "save" }`, "src/keys.ts#default"],
        ]);
        // A composite's list of members takes its id as a declaration does.
        expect(result?.code).toContain(`identify$([move], "src/keys.ts#all")`);
    });
    test("records each id where the registry takes it, passing the same declaration", async () => {
        const result = await identify(`import { System } from "@adobe/data-ecs";\nconst move = System.create({ name: "move" });`);
        const evaluated = (result?.code ?? "").replace(/^import .*$/m, "const System = { create: (declaration) => declaration };");
        const declaration: unknown = new Function(`${evaluated}\nreturn move;`)();
        expect(typeof declaration === "object" && declaration !== null ? [Reflect.get(declaration, "name"), takeIdOfDeclaration(declaration), takeIdOfDeclaration(declaration)] : declaration).toEqual(["move", "src/keys.ts#move", undefined]);
    });
    test("identifies a kernel's call the kernel transform wrapped", async () => {
        const result = await identify(`import { attachKernel as attachKernel$ } from ${JSON.stringify(attachKernelPath)};\nimport { System } from "@adobe/data-ecs";\nconst grow = attachKernel$(System.create({ name: "grow", kernel: "cpu" }, () => {}), {});`);
        expect(declared(result?.code)).toEqual([[`{ name: "grow", kernel: "cpu" }`, "src/keys.ts#grow"]]);
    });
    test("follows the namespace to the module that exports it, under any local name", async () => {
        const result = await identify(`import { System as Systems, Rule } from "./system.js";\nconst a = Systems.create({ name: "a" });\nconst b = Rule.create({ name: "b" });`);
        expect(declared(result?.code)).toEqual([[`{ name: "a" }`, "src/keys.ts#a"]]);
    });
    test("leaves calls that aren't a top-level binding's, other namespaces and other methods", async () => {
        expect(await identify([
            `import { System, Component } from "@adobe/data-ecs";`,
            `import { System as Other } from "elsewhere";`,
            `function make() { const inner = System.create({ name: "inner" }); return inner; }`,
            `System.create({ name: "statement" });`,
            `const wrapped = [System.create({ name: "wrapped" })];`,
            `const other = Other.create({ name: "other" });`,
            `const registered = Component.register({ name: "registered" });`,
            `const spread = System.create(...[{ name: "spread" }]);`,
            `const computed = System["create"]({ name: "computed" });`,
        ].join("\n"))).toBe(null);
    });
});

describe("moduleIdOf", () => {
    /** Packages by directory, as their package.json files name them. */
    const packages = (named: { readonly [directory: string]: string | null }) => (directory: string) => {
        const name = named[directory];
        return name === undefined ? undefined : name;
    };
    const none = packages({});
    test("is the nearest package's name and the path in it, without a query", async () => {
        const app = packages({ "/app": "app", "/repo/packages/shared": "@scope/shared", "/repo/packages/shared/src/nested": null });
        expect(moduleIdOf("/app/src/keys.ts?t=1712", "/app", app)).toBe("app/src/keys.ts");
        expect(moduleIdOf("/app/src/worker.ts?worker_file&type=module", "/app/", app)).toBe("app/src/worker.ts");
        // A workspace package linked from outside the root is named by its package, not its directories.
        expect(moduleIdOf("/repo/packages/shared/src/nested/keys.ts", "/repo/apps/web", app)).toBe("@scope/shared/src/nested/keys.ts");
    });
    test("is a dependency's package name and subpath", async () => {
        const scoped = packages({ "/app/node_modules/.pnpm/@scope+keys@1.2.0/node_modules/@scope/keys": "@scope/keys" });
        expect(moduleIdOf("/app/node_modules/.pnpm/@scope+keys@1.2.0/node_modules/@scope/keys/dist/keys.js?v=3f2a", "/app", scoped)).toBe("@scope/keys/dist/keys.js");
        expect(moduleIdOf("/elsewhere/node_modules/keys/index.js", "/app", none)).toBe("keys/index.js");
    });
    test("is the path from the root without a named package", async () => {
        expect(moduleIdOf("/app/src/keys.ts?t=1712", "/app", none)).toBe("src/keys.ts");
        expect(moduleIdOf("/libraries/shared/keys.ts?import", "/app", none)).toBe("../libraries/shared/keys.ts");
    });
    test("uses forward slashes", async () => {
        expect(moduleIdOf("C:\\app\\src\\keys.ts", "C:\\app", none)).toBe("src/keys.ts");
        expect(moduleIdOf("C:\\app\\src\\keys.ts", "C:\\app", packages({ "C:/app": "app" }))).toBe("app/src/keys.ts");
    });
});
