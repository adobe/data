import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { idOfKey } from '../../interface/registry/ids.js';
import { estreeOf } from './estree.js';
import { identifySymbols, moduleIdOf } from './identify.js';
import { decodeMappings } from './source-map.js';

const parse = (code: string) => estreeOf(parseAst(code));
const identify = (code: string) => identifySymbols(code, "src/keys.ts", parse);

/** The calls the rewrite wraps around each identified `Symbol(...)`, as `[symbol source, id]`. */
const wrapped = (code: string | undefined): readonly (readonly [string, string])[] =>
    [...(code ?? "").matchAll(/identify\$\((Symbol\([^)]*\)), "([^"]*)"\)/g)].map(match => [match[1] ?? "", match[2] ?? ""]);

describe("identifySymbols", () => {
    test("gives each top-level Symbol(...) declaration its module's id and binding", () => {
        const result = identify([
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
    test("records each id where the registry reads it, returning the same symbol", () => {
        const result = identify(`const a = Symbol("a");\nlet b = Symbol();`);
        const [a, b]: unknown[] = new Function(`${result?.code}\nreturn [a, b];`)();
        expect([typeof a === "symbol" ? idOfKey(a) : a, typeof b === "symbol" ? idOfKey(b) : b]).toEqual(["src/keys.ts#a", "src/keys.ts#b"]);
        expect(typeof a === "symbol" ? a.description : a).toBe("a");
    });
    test("leaves symbols made in functions, blocks and other expressions", () => {
        expect(identify([
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
    test("leaves a module where Symbol isn't the global", () => {
        for (const shadow of [`import { Symbol } from "elsewhere";`, `const Symbol = (name) => name;`, `function Symbol() {}`, `class Symbol {}`, `var Symbol;`, `import Symbol from "elsewhere";`, `import * as Symbol from "elsewhere";`]) {
            expect(identify(`${shadow}\nconst a = Symbol("a");`)).toBe(null);
        }
        expect(identify(`const globalThis = {};\nconst a = Symbol("a");`)).toBe(null);
    });
    test("doesn't parse code without Symbol(", () => {
        expect(identifySymbols(`const a = 1;`, "src/keys.ts", () => { throw new Error("parsed"); })).toBe(null);
    });
    test("maps the code it returns back to the source", () => {
        const source = `const a = Symbol("a");\nexport const b = Symbol("b"); const after = 2;`;
        const result = identify(source);
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

describe("moduleIdOf", () => {
    /** Packages by directory, as their package.json files name them. */
    const packages = (named: { readonly [directory: string]: string | null }) => (directory: string) => {
        const name = named[directory];
        return name === undefined ? undefined : name;
    };
    const none = packages({});
    test("is the nearest package's name and the path in it, without a query", () => {
        const app = packages({ "/app": "app", "/repo/packages/shared": "@scope/shared", "/repo/packages/shared/src/nested": null });
        expect(moduleIdOf("/app/src/keys.ts?t=1712", "/app", app)).toBe("app/src/keys.ts");
        expect(moduleIdOf("/app/src/worker.ts?worker_file&type=module", "/app/", app)).toBe("app/src/worker.ts");
        // A workspace package linked from outside the root is named by its package, not its directories.
        expect(moduleIdOf("/repo/packages/shared/src/nested/keys.ts", "/repo/apps/web", app)).toBe("@scope/shared/src/nested/keys.ts");
    });
    test("is a dependency's package name and subpath", () => {
        const scoped = packages({ "/app/node_modules/.pnpm/@scope+keys@1.2.0/node_modules/@scope/keys": "@scope/keys" });
        expect(moduleIdOf("/app/node_modules/.pnpm/@scope+keys@1.2.0/node_modules/@scope/keys/dist/keys.js?v=3f2a", "/app", scoped)).toBe("@scope/keys/dist/keys.js");
        expect(moduleIdOf("/elsewhere/node_modules/keys/index.js", "/app", none)).toBe("keys/index.js");
    });
    test("is the path from the root without a named package", () => {
        expect(moduleIdOf("/app/src/keys.ts?t=1712", "/app", none)).toBe("src/keys.ts");
        expect(moduleIdOf("/libraries/shared/keys.ts?import", "/app", none)).toBe("../libraries/shared/keys.ts");
    });
    test("uses forward slashes", () => {
        expect(moduleIdOf("C:\\app\\src\\keys.ts", "C:\\app", none)).toBe("src/keys.ts");
        expect(moduleIdOf("C:\\app\\src\\keys.ts", "C:\\app", packages({ "C:/app": "app" }))).toBe("app/src/keys.ts");
    });
});
