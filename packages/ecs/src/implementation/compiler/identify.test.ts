// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { idOfKey, takeIdOfDeclaration } from '../../interface/registry/ids.js';
import { estreeOf } from './estree.js';
import { identify as identifyModule, moduleIdOf, moduleLabelOf } from './identify.js';
import { ownCopy } from './paths.js';
import { decodeMappings } from './source-map.js';

const parse = (code: string) => estreeOf(parseAst(code));
/** Imports from the package, and from `./system.js` for `System` alone, are the package's namespaces. */
const resolve = async (source: string, namespace: string) => source === "@adobe/ecs" || (source === "./system.js" && namespace === "System");
const identify = async (code: string) => {
    const result = await identifyModule(code, "src/keys.ts", parse, resolve);
    if (result !== null && "failure" in result) throw new Error(result.failure);
    return result;
};

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
            `import { System as S, Rule, Finalizer, Index } from "@adobe/ecs";`,
            `const move = S.create({ tag: "move" }, () => {});`,
            `export const grid = Index.create({ tag: "grid" });`,
            `export const draw = S.render({ tag: "draw" }, () => {}), main = S.create({ tag: "main", systems: [move] });`,
            `const all = S.create([move]);`,
            `let shown = Rule.create({ tag: "shown" });`,
            `var release = Finalizer.create({ tag: "release" }, () => {});`,
            `export default Finalizer.changes({ tag: "save" }, () => {});`,
        ].join("\n"));
        expect(declared(result?.code)).toEqual([
            [`{ tag: "move" }`, "src/keys.ts#move"], [`{ tag: "grid" }`, "src/keys.ts#grid"], [`{ tag: "draw" }`, "src/keys.ts#draw"], [`{ tag: "main", systems: [move] }`, "src/keys.ts#main"],
            [`{ tag: "shown" }`, "src/keys.ts#shown"], [`{ tag: "release" }`, "src/keys.ts#release"], [`{ tag: "save" }`, "src/keys.ts#default"],
        ]);
        // A composite's list of members takes its id as a declaration does.
        expect(result?.code).toContain(`identify$([move], "src/keys.ts#all")`);
    });
    test("records each id where the registry takes it, passing the same declaration", async () => {
        const result = await identify(`import { System } from "@adobe/ecs";\nconst move = System.create({ tag: "move" });`);
        const evaluated = (result?.code ?? "").replace(/^import .*$/m, "const System = { create: (declaration) => declaration };");
        const declaration: unknown = new Function(`${evaluated}\nreturn move;`)();
        expect(typeof declaration === "object" && declaration !== null ? [Reflect.get(declaration, "tag"), takeIdOfDeclaration(declaration), takeIdOfDeclaration(declaration)] : declaration).toEqual(["move", "src/keys.ts#move", undefined]);
    });
    test("identifies a kernel's call the kernel transform wrapped", async () => {
        const result = await identify(`import { attachKernel as attachKernel$ } from ${JSON.stringify(ownCopy.attachKernel)};\nimport { System } from "@adobe/ecs";\nconst grow = attachKernel$(System.create({ tag: "grow", kernel: true }, () => {}), {});`);
        expect(declared(result?.code)).toEqual([[`{ tag: "grow", kernel: true }`, "src/keys.ts#grow"]]);
    });
    test("follows the namespace to the module that exports it, under any local name", async () => {
        const result = await identify(`import { System as Systems, Rule } from "./system.js";\nconst a = Systems.create({ tag: "a" });\nconst b = Rule.create({});`);
        expect(declared(result?.code)).toEqual([[`{ tag: "a" }`, "src/keys.ts#a"]]);
    });
    test("labels a call that isn't a top-level binding's by the binding, function, property or method it's in, and leaves other namespaces and methods", async () => {
        const result = await identify([
            `import { System, Component } from "@adobe/ecs";`,
            `import { System as Other } from "elsewhere";`,
            `function make() { return System.create({ tag: "make" }); }`,
            `const mover = (speed) => { const inner = System.create({ tag: "inner" }); return inner; };`,
            `const systems = { move: System.create({ tag: "move" }) };`,
            `System.create({ tag: "alone" });`,
            `const wrapped = [System.create({ tag: "wrapped" })];`,
            `const other = Other.create({ tag: "other" });`,
            `const registered = Component.register({ tag: "registered" });`,
            `const spread = System.create(...[{ tag: "spread" }]);`,
            `const computed = System["create"]({ tag: "computed" });`,
        ].join("\n"));
        expect([...(result?.code ?? "").matchAll(/label\$\((\{[^}]*\}), "(\w+)"\)/g)].map(match => [match[1], match[2]])).toEqual([
            [`{ tag: "make" }`, "make"], [`{ tag: "inner" }`, "inner"], [`{ tag: "move" }`, "move"], [`{ tag: "wrapped" }`, "wrapped"],
        ]);
        expect(result?.code).not.toContain("identify$");
    });
    test("labels a call made in another's arguments by the name nearest it", async () => {
        const result = await identify(`import { System } from "@adobe/ecs";\nfunction make() { return System.create({ systems: [System.create({ tag: "nested" })] }); }`);
        expect([...(result?.code ?? "").matchAll(/label\$\((\{ tag[^}]*\}), "(\w+)"\)/g)].map(match => [match[1], match[2]])).toEqual([[`{ tag: "nested" }`, "systems"]]);
    });
    test("keeps a label already given, as an internal factory gives its own, in a map holding declarations weakly", async () => {
        const result = await identify(`import { System } from "@adobe/ecs";\nfunction make(given) { return System.create(given); }\nfunction fresh() { return System.create({}); }`);
        const evaluated = (result?.code ?? "").replace(/^import .*$/m, "const System = { create: (declaration) => declaration };");
        const declaration = {};
        const labels = new WeakMap([[declaration, "given"]]);
        Reflect.set(globalThis, Symbol.for("@adobe/ecs/labels@1"), labels);
        const [make] = new Function(`${evaluated}\nreturn [make, fresh];`)();
        make(declaration);
        expect(labels.get(declaration)).toBe("given");
        // A declaration whose constructor throws before taking its label isn't kept alive by it.
        Reflect.deleteProperty(globalThis, Symbol.for("@adobe/ecs/labels@1"));
        new Function(`${evaluated}\nreturn fresh;`)()();
        expect(Reflect.get(globalThis, Symbol.for("@adobe/ecs/labels@1"))).toBeInstanceOf(WeakMap);
    });
    test("fails for a module outside a named package, which has nothing to name its ids by", async () => {
        const result = await identifyModule(`export const position = Symbol();`, null, parse, resolve);
        expect(result !== null && "failure" in result ? result.failure : result).toContain("package.json");
        expect(await identifyModule(`export const two = 2;`, null, parse, resolve)).toBe(null);
    });
});

describe("moduleLabelOf", () => {
    test("is the module's path in its package, else a dependency's package and subpath, else its file's name", () => {
        const app = (directory: string) => directory === "/repo/app" ? { name: "app", version: "1.0.0" } : undefined;
        expect(moduleLabelOf("/repo/app/src/features/a/model.ts?t=1", app)).toBe("src/features/a/model.ts");
        expect(moduleLabelOf("/x/node_modules/keys/index.js", () => undefined)).toBe("keys/index.js");
        expect(moduleLabelOf("/loose/model.ts", () => undefined)).toBe("model.ts");
    });
});

describe("moduleIdOf", () => {
    /** Packages by directory, as their package.json files name and version them. */
    const packages = (named: { readonly [directory: string]: { readonly name: string; readonly version?: string } | null }) => (directory: string) => {
        const found = named[directory];
        return found === undefined ? undefined : found;
    };
    const none = packages({});
    test("is the nearest package's name, its version and the path in it, without a query", async () => {
        const app = packages({ "/app": { name: "app", version: "1.2.0" }, "/repo/packages/shared": { name: "@scope/shared", version: "0.3.1" }, "/repo/packages/shared/src/nested": null });
        expect(moduleIdOf("/app/src/keys.ts?t=1712", app)).toBe("app@1.2.0/src/keys.ts");
        expect(moduleIdOf("/app/src/worker.ts?worker_file&type=module", app)).toBe("app@1.2.0/src/worker.ts");
        // A workspace package linked from outside the root is named by its package, not its directories.
        expect(moduleIdOf("/repo/packages/shared/src/nested/keys.ts", app)).toBe("@scope/shared@0.3.1/src/nested/keys.ts");
    });
    test("leaves out a version the package doesn't give", async () => {
        expect(moduleIdOf("/app/src/keys.ts", packages({ "/app": { name: "app" } }))).toBe("app/src/keys.ts");
    });
    test("is a dependency's package name, version and subpath", async () => {
        const scoped = packages({ "/app/node_modules/.pnpm/@scope+keys@1.2.0/node_modules/@scope/keys": { name: "@scope/keys", version: "1.2.0" } });
        expect(moduleIdOf("/app/node_modules/.pnpm/@scope+keys@1.2.0/node_modules/@scope/keys/dist/keys.js?v=3f2a", scoped)).toBe("@scope/keys@1.2.0/dist/keys.js");
        expect(moduleIdOf("/elsewhere/node_modules/keys/index.js", none)).toBe("keys/index.js");
    });
    test("is null outside a named package", async () => {
        expect(moduleIdOf("/app/src/keys.ts?t=1712", none)).toBe(null);
        expect(moduleIdOf("/libraries/shared/keys.ts", packages({ "/libraries": null }))).toBe(null);
    });
    test("stops at a drive's root, never reading the working directory's package", async () => {
        const read: string[] = [];
        const cwd = (directory: string) => {
            read.push(directory);
            return directory === "." ? { name: "cwd", version: "1.0.0" } : undefined;
        };
        expect(moduleIdOf("C:\\elsewhere\\keys.ts", cwd)).toBe(null);
        expect(read).toEqual(["C:/elsewhere", "C:"]);
    });
    test("uses forward slashes", async () => {
        expect(moduleIdOf("C:\\app\\src\\keys.ts", packages({ "C:/app": { name: "app", version: "1.0.0" } }))).toBe("app@1.0.0/src/keys.ts");
    });
});
