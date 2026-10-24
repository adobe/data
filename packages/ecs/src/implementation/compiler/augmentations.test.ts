// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { augmentationInsertions, registeredReductionsIn } from './augmentations.js';
import { insertInto } from './source-map.js';
import { hostOf } from './type-host.test-helper.js';
import { moduleOf } from './type-schemas.js';

const header = `import { Entity, type F32, type U32, type Vec3 } from "@adobe/ecs";\n`;

/** The module as the pass leaves it, or its failure's message. */
const passedWhole = async (body: string, files: { readonly [path: string]: string } = {}): Promise<string | null> => {
    const code = header + body;
    const host = hostOf(files);
    const result = await augmentationInsertions(moduleOf("/src/keys.ts", code, host.parse(code, "/src/keys.ts")), host);
    if (result === null) return null;
    if ("failure" in result) return `failure: ${result.failure.message}`;
    return insertInto(code, result.insertions, "/src/keys.ts").code;
};

/** The module as the pass leaves it without the function it appends, or its failure's message. */
const passed = async (body: string, files: { readonly [path: string]: string } = {}): Promise<string | null> =>
    (await passedWhole(body, files))?.replace(/\nfunction declare\$\d*\(key, kind, declaration\) \{.*\}\n$/, "") ?? null;

/** The declarations the pass records, one per line, without the function recording them. */
const registrations = async (body: string, files: { readonly [path: string]: string } = {}): Promise<readonly string[] | string | null> => {
    const code = await passed(body, files);
    if (code === null || code.startsWith("failure: ")) return code;
    return code.split("\n").filter(line => /^declare\$\(/.test(line));
};

const keys = (...names: readonly string[]) => names.map(name => `const ${name} = Symbol();`).join("\n") + "\n";

describe("augmentationInsertions", () => {
    test("registers each component and resource with the schema of its type", async () => {
        expect(await registrations(`${keys("position", "done", "label", "speed", "count")}declare module "@adobe/ecs" {
    interface Components { [position]: { type: Vec3 }; [done]: { type: boolean }; [label]: { type: string } }
    interface Resources { [speed]: { type: F32 | null }; [count]: { type: U32 | null } }
}`)).toEqual([
            `declare$(position, "component", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3} });`,
            `declare$(done, "component", { type: {"type":"boolean"} });`,
            `declare$(label, "component", { type: {"type":"string"} });`,
            `declare$(speed, "resource", { type: {"anyOf":[{"type":"number","precision":1},{"type":"null"}]} });`,
            `declare$(count, "resource", { type: {"anyOf":[{"type":"integer","minimum":0,"maximum":4294967295},{"type":"null"}]} });`,
        ]);
    });
    test("appends the function recording its declarations, which imports nothing", async () => {
        const code = await passedWhole(`${keys("tag")}declare module "@adobe/ecs" { interface Components { [tag]: { type: true } } }`);
        expect(code?.split("\n").filter(line => line.startsWith("import"))).toEqual([header.trimEnd()]);
        expect(code?.trimEnd().split("\n").at(-1)).toBe(`function declare$(key, kind, declaration) { (globalThis[Symbol.for("@adobe/ecs/declarations@1")] ??= new Map()).set(key, { kind, declaration }); }`);
    });
    test("names the function apart from the module's own names", async () => {
        const code = await passedWhole(`const declare$ = 1;\n${keys("tag")}declare module "@adobe/ecs" { interface Components { [tag]: { type: true } } }`);
        expect(code?.split("\n").filter(line => line.includes("declare$1"))).toEqual([
            `declare$1(tag, "component", { type: {"const":true} });`,
            `function declare$1(key, kind, declaration) { (globalThis[Symbol.for("@adobe/ecs/declarations@1")] ??= new Map()).set(key, { kind, declaration }); }`,
        ]);
    });
    test("fails for a module binding a global the recording function uses", async () => {
        for (const binding of [`const Map = 1;`, `function Symbol() {}`, `import { globalThis } from "./globals.js";`]) {
            expect(await passed(`${binding}\n${keys("tag")}declare module "@adobe/ecs" { interface Components { [tag]: { type: true } } }`)).toContain("which the code recording its declarations uses");
        }
    });
    test("gives a default as a literal, or as the value `typeof` names, in the schema", async () => {
        expect(await registrations(`${keys("gravity", "mode", "selected", "origin")}declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: F32; default: -9.8 };
        [mode]: { type: "all" | "done"; default: "all" };
        [selected]: { type: Entity; default: typeof Entity.none };
        [origin]: { type: Vec3; default: [0, 0, 0] };
    }
}`)).toEqual([
            `declare$(gravity, "resource", { type: {"type":"number","precision":1,"default":-9.8} });`,
            `declare$(mode, "resource", { type: {"anyOf":[{"const":"all"},{"const":"done"}],"default":"all"} });`,
            `declare$(selected, "resource", { type: {"type":"integer","format":"entity","default":Entity.none} });`,
            `declare$(origin, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3,"default":[0,0,0]} });`,
        ]);
    });
    test("gives a value that isn't data no schema, and its default beside its traits", async () => {
        const files = { "/src/row.ts": `export class Row extends HTMLElement {}\nexport class Pool {}` };
        expect(await registrations(`import { Row, Pool } from "./row.js";\n${keys("row", "pool", "canvas", "callback")}const empty = new Pool();
declare module "@adobe/ecs" {
    interface Components { [row]: { type: Row; thread: "main" } }
    interface Resources {
        [pool]: { type: Pool; default: typeof empty };
        [canvas]: { type: OffscreenCanvas | null; transfer: true };
        [callback]: { type: (() => void) | null };
    }
}`, files)).toEqual([
            `declare$(row, "component", { thread: "main" });`,
            `declare$(canvas, "resource", { transfer: true });`,
            `declare$(callback, "resource", {});`,
            // After the value its default names.
            `declare$(pool, "resource", { default: empty });`,
        ]);
    });
    test("gives traits as declared, a trait of your own by its key, and registers traits `Traits` declares", async () => {
        expect(await registrations(`${keys("instanced", "host", "outline", "owner", "drawn", "total")}declare module "@adobe/ecs" {
    interface Traits<N> { readonly [instanced]: true }
    interface Components {
        [host]: { type: true };
        [outline]: { type: number; within: typeof host; [instanced]: true };
        [owner]: { type: Entity; reference: "owner" };
        [drawn]: { type: true; derived: true };
    }
    interface Resources { [total]: { type: F32; default: 0; reduce: "+" } }
}`)).toEqual([
            `declare$(instanced, "trait");`,
            `declare$(host, "component", { type: {"const":true} });`,
            `declare$(outline, "component", { type: {"type":"number"}, within: host, [instanced]: true });`,
            `declare$(owner, "component", { type: {"type":"integer","format":"entity"}, reference: "owner" });`,
            `declare$(drawn, "component", { type: {"const":true}, derived: true });`,
            `declare$(total, "resource", { type: {"type":"number","precision":1,"default":0}, reduce: "+" });`,
        ]);
    });
    test("registers a block's traits before the components declaring them", async () => {
        expect(await registrations(`${keys("marked", "mark")}declare module "@adobe/ecs" {
    interface Components { [marked]: { type: true; [mark]: true } }
    interface Traits<N> { readonly [mark]: true }
}`)).toEqual([`declare$(mark, "trait");`, `declare$(marked, "component", { type: {"const":true}, [mark]: true });`]);
    });
    test("follows a type named by Schema.Type that another module declares", async () => {
        const files = { "/src/units.ts": `import type { Schema } from "@adobe/ecs";\nexport type Level = Schema.Type<{ type: "integer"; minimum: 0; maximum: 9 }>;` };
        expect(await registrations(`import type { Level } from "./units.js";\n${keys("level")}declare module "@adobe/ecs" { interface Components { [level]: { type: Level } } }`, files)).toEqual([
            `declare$(level, "component", { type: {"type":"integer","minimum":0,"maximum":9} });`,
        ]);
    });
    test("registers right after its key, and after the bindings its declaration names, wherever the block is", async () => {
        const code = await passed(`declare module "@adobe/ecs" { interface Resources { [later]: { type: Vec3; default: typeof start } } }
const later = Symbol();
const start = [1, 2, 3] as const;
const after = 1;`);
        expect(code?.split("\n").slice(-3)).toEqual([`const start = [1, 2, 3] as const;`, `declare$(later, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3,"default":start} });`, `const after = 1;`]);
        // Code between the key and a block below uses the key registered.
        const above = await passed(`const speed = Symbol();\nconst uses = [speed];\ndeclare module "@adobe/ecs" { interface Resources { [speed]: { type: F32; default: 0 } } }`);
        expect(above?.split("\n").slice(1, 3)).toEqual([`const speed = Symbol();`, `declare$(speed, "resource", { type: {"type":"number","precision":1,"default":0} });`]);
    });
    test("registers a trait before what declares it, its keys declared below the blocks, the Traits block last", async () => {
        const code = await passed(`declare module "@adobe/ecs" {
    interface Components { [marked]: { type: true; [mark]: true } }
}
declare module "@adobe/ecs" {
    interface Traits<N> { readonly [mark]: true }
}
const marked = Symbol();
const mark = Symbol();`);
        expect(code?.split("\n").slice(-4)).toEqual([`const marked = Symbol();`, `const mark = Symbol();`, `declare$(mark, "trait");`, `declare$(marked, "component", { type: {"const":true}, [mark]: true });`]);
    });
    test("registers after a let, var or class its default names, which have no value before their statements", async () => {
        const code = await passed(`${keys("a", "b", "c")}declare module "@adobe/ecs" {
    interface Resources { [a]: { type: Pool; default: typeof first }; [b]: { type: Pool; default: typeof second }; [c]: { type: new () => object; default: typeof Pool } }
}
let first = new (class {})();
var second = new (class {})();
class Pool {}
const after = 1;`);
        expect(code?.split("\n").slice(-7)).toEqual([
            `let first = new (class {})();`, `declare$(a, "resource", { default: first });`,
            `var second = new (class {})();`, `declare$(b, "resource", { default: second });`,
            `class Pool {}`, `declare$(c, "resource", { default: Pool });`,
            `const after = 1;`,
        ]);
    });
    test("takes a type that allows null through its aliases", async () => {
        const files = { "/src/maybe.ts": `export type Maybe = Pool | null;\nexport class Pool {}` };
        expect(await registrations(`import type { Maybe } from "./maybe.js";\n${keys("pool")}declare module "@adobe/ecs" { interface Resources { [pool]: { type: Maybe } } }`, files)).toEqual([`declare$(pool, "resource", {});`]);
    });
    test("follows types a declare global block declares, here or in a module imported, before taking a name as a global class", async () => {
        const files = { "/src/globals.ts": `declare global {\n    interface Point { readonly x: number; readonly y: number }\n}\nexport {};` };
        expect(await registrations(`import "./globals.js";\ndeclare global { type Weight = number }\n${keys("at", "weight")}declare module "@adobe/ecs" { interface Components { [at]: { type: Point }; [weight]: { type: Weight } } }`, files)).toEqual([
            `declare$(at, "component", { type: {"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"}}} });`,
            `declare$(weight, "component", { type: {"type":"number"} });`,
        ]);
    });
    test("checks the built-in traits' values, as far as their literals and types tell", async () => {
        const block = (body: string, more = "") => `${keys("key", "other")}const notKey = 1;\n${more}declare module "@adobe/ecs" { ${body} }`;
        const components = (traits: string) => block(`interface Components { [key]: { ${traits} }; [other]: { type: true } }`);
        expect(await passed(components(`type: true; derived: false`))).toContain("derived is `true`");
        expect(await passed(block(`interface Resources { [key]: { type: number; default: 0; derived: true } }`))).toContain("only a component is derived");
        expect(await passed(components(`type: Entity; reference: "strong"`))).toContain(`reference is "owner" or "weak"`);
        expect(await passed(components(`type: number; reference: "owner"`))).toContain("a reference's type is Entity");
        expect(await passed(components(`type: true; within: "other"`))).toContain("within is `typeof` a component's key");
        expect(await passed(components(`type: true; within: typeof notKey`))).toContain("within is `typeof` a component's key");
        expect(await passed(components(`type: Map<string, number>; transfer: true`))).toContain("transfer takes a Transferable class");
        expect(await passed(block(`interface Resources { [key]: { type: number; default: 0; reduce: "-" } }`))).toContain("reduce is one of");
        expect(await passed(components(`type: number; reduce: "+"`))).toContain("only a resource is reduced");
        expect(await passed(components(`type: string; thread: "main"`))).toContain("a string lives in shared memory");
        expect(await passed(components(`type: Vec3; thread: "main"`))).toContain("a struct lives in shared memory");
        // A Transferable class, through an alias and with null.
        expect(await registrations(components(`type: Picture; transfer: true`).replace("const notKey", "type Picture = ImageBitmap | null;\nconst notKey"))).toContain(`declare$(key, "component", { transfer: true });`);
    });
    test("passes over modules without a declaration of the package", async () => {
        expect(await passed(`declare module "elsewhere" { interface Components { [x]: { type: number } } }\nconst x = Symbol();`)).toBe(null);
    });
    test("fails, saying why, for what a declaration can't be", async () => {
        const block = (body: string) => `declare module "@adobe/ecs" { ${body} }`;
        expect(await passed(`const key = Symbol.for("key");\n${block(`interface Components { [key]: { type: number } }`)}`)).toContain("top-level `Symbol()` constant");
        const files = { "/src/keys.ts": `export const elsewhere = Symbol();\nexport const layer = Symbol();` };
        expect(await passed(`import { elsewhere } from "./keys.js";\n${block(`interface Components { [elsewhere]: { type: number } }`)}`, files)).toContain(`elsewhere is imported from "./keys.js": declare it in the module that declares the key`);
        expect(await passed(`import type { layer } from "./keys.js";\n${keys("key")}${block(`interface Components { [key]: { type: true; [layer]: true } }`)}`, files)).toContain("layer, imported as a type only");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: number } }`)}`)).toContain("default");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: 1 | 2 | 4 } }`)}`)).toContain("declares the value it starts at");
        expect(await passed(`const Mode = { a: 1, b: 2 } as const;\n${keys("key")}${block(`interface Resources { [key]: { type: (typeof Mode)[keyof typeof Mode] } }`)}`)).toContain("declares the value it starts at");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: U32; default: -1 } }`)}`)).toContain("isn't of its declared type");
        expect(await passed(`import type { Entity as E } from "@adobe/ecs";\n${keys("key")}${block(`interface Resources { [key]: { type: Entity; default: typeof E.none } }`)}`)).toContain("type only");
        expect(await passed(`${keys("key")}${block(`interface Components { [key]: { type: HTMLDivElement } }`)}`)).toContain(`thread: "main"`);
        expect(await passed(`${keys("key")}${block(`interface Components { [key]: { type: Pick<{ a: number }, "a"> } }`)}`)).toContain("type arguments");
        expect(await passed(`${keys("key")}${block(`interface Components { [key]: { derived: true } }`)}`)).toContain("declares its type");
        expect(await passed(block(`interface Traits<N> { readonly layer: true }`))).toContain("keyed by a `Symbol()` constant");
        expect(await passed(`enum Mode { On, Off }\n${keys("key")}${block(`interface Components { [key]: { type: Mode } }`)}`)).toContain("an enum");
        expect(await passed(`import { Mode } from "./mode.js";\n${keys("key")}${block(`interface Components { [key]: { type: Mode } }`)}`, { "/src/mode.ts": `export enum Mode { On, Off }` })).toContain("an enum");
        expect(await passed(block(`interface Components { "named": { type: number } }`))).toContain("a component's key is a `Symbol()` constant");
        expect(await passed(block(`interface Resources { "time": { type: number; default: 0 } }`))).toContain("a resource's key is a `Symbol()` constant");
    });
});

describe("registeredReductionsIn", () => {
    const read = (code: string) => Object.fromEntries(registeredReductionsIn(parseAst(code, { lang: "js" })));
    test("reads the operators a library's declarations give, however its bundle wrote them", () => {
        expect(read(`export const total = Symbol(); declare$(total, "resource", { type: {}, reduce: "+" }); function declare$(key, kind, declaration) {}`)).toEqual({ total: "+" });
        expect(read(`const t = Symbol(), m = Symbol(); d(t, "resource", { reduce: "+" }), d(m, "resource", { reduce: "min" }); export { t as total, m as low };`)).toEqual({ t: "+", m: "min" });
        expect(read(`const t = Symbol(); void d(t, "resource", { reduce: "+" });`)).toEqual({ t: "+" });
        expect(read(`const t = Symbol(); (globalThis[Symbol.for("@adobe/ecs/declarations@1")] ??= new Map()).set(t, { kind: "resource", declaration: { reduce: "+" } });`)).toEqual({ t: "+" });
        expect(read(`const t = Symbol(); (g ??= new Map).set(t, { kind: "resource", declaration: { reduce: "max" } }), e.f(1);`)).toEqual({ t: "max" });
    });
    test("ignores components, traits, and keys that aren't symbols", () => {
        expect(read(`const t = 1; d(t, "resource", { reduce: "+" });`)).toEqual({});
        expect(read(`const t = Symbol(); d(t, "component", { reduce: "+" }); d(t, "trait");`)).toEqual({});
        expect(read(`const t = Symbol(); m.set(t, { kind: "component", declaration: { reduce: "+" } });`)).toEqual({});
    });
});
