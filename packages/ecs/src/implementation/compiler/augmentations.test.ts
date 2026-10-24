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
    test("gives a literal default beside the schema", async () => {
        expect(await registrations(`${keys("gravity", "mode", "origin")}declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: F32; default: -9.8 };
        [mode]: { type: "all" | "done"; default: "all" };
        [origin]: { type: Vec3; default: [1, 2, 3] };
    }
}`)).toEqual([
            `declare$(gravity, "resource", { type: {"type":"number","precision":1}, default: -9.8 });`,
            `declare$(mode, "resource", { type: {"anyOf":[{"const":"all"},{"const":"done"}]}, default: "all" });`,
            `declare$(origin, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3}, default: [1,2,3] });`,
        ]);
    });
    test("derives a resource's or derived component's default from its type: its namespace's, null, a zero value, or a fresh ReadonlyMap or ReadonlySet", async () => {
        expect(await registrations(`${keys("layer", "drawn", "speed", "count", "on", "text", "at", "stats", "focus", "frame", "list", "maybe", "names", "tags", "cache", "audio")}declare module "@adobe/ecs" {
    interface Components {
        [layer]: { type: number; derived: true };
        [drawn]: { type: true; derived: true };
        [speed]: { type: number };
    }
    interface Resources {
        [count]: { type: U32 };
        [on]: { type: boolean };
        [text]: { type: string };
        [at]: { type: Vec3 };
        [stats]: { type: { readonly sprites: U32; readonly frames: U32 } };
        [focus]: { type: Entity };
        [frame]: { type: 0 | 1 | 2 };
        [list]: { type: readonly string[] };
        [maybe]: { type: F32 | null };
        [names]: { type: ReadonlyMap<string, number> };
        [tags]: { type: ReadonlySet<string> };
        [cache]: { type: Map<string, number> | null; thread: "main" };
        [audio]: { type: AudioContext | null };
    }
}`)).toEqual([
            `declare$(layer, "component", { type: {"type":"number"}, default: 0, derived: true });`,
            `declare$(drawn, "component", { type: {"const":true}, derived: true });`,
            `declare$(speed, "component", { type: {"type":"number"} });`,
            // U32 and Vec3 are imported as types, so their namespaces' defaults are written in; Entity is a value.
            `declare$(count, "resource", { type: {"type":"integer","minimum":0,"maximum":4294967295}, default: 0 });`,
            `declare$(on, "resource", { type: {"type":"boolean"}, default: false });`,
            `declare$(text, "resource", { type: {"type":"string"}, default: "" });`,
            `declare$(at, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3}, default: [0,0,0] });`,
            `declare$(stats, "resource", { type: {"type":"object","properties":{"sprites":{"type":"integer","minimum":0,"maximum":4294967295},"frames":{"type":"integer","minimum":0,"maximum":4294967295}}}, default: {"sprites":0,"frames":0} });`,
            `declare$(focus, "resource", { type: {"type":"integer","format":"entity"}, default: Entity.default });`,
            `declare$(frame, "resource", { type: {"anyOf":[{"const":0},{"const":1},{"const":2}]}, default: 0 });`,
            `declare$(list, "resource", { type: {"type":"array","items":{"type":"string"}}, default: [] });`,
            `declare$(maybe, "resource", { type: {"anyOf":[{"type":"number","precision":1},{"type":"null"}]} });`,
            `declare$(names, "resource", { type: {"type":"map","keys":{"type":"string"},"values":{"type":"number"}}, fresh: "Map" });`,
            `declare$(tags, "resource", { type: {"type":"set","items":{"type":"string"}}, fresh: "Set" });`,
            `declare$(cache, "resource", { thread: "main" });`,
            `declare$(audio, "resource", {});`,
        ]);
    });
    test("takes its type's namespace's default, after the value holding it, unless a literal is given", async () => {
        const files = { "/src/bounds.ts": `import type { F32 } from "@adobe/ecs";\nexport type Upper = F32;\nexport const Upper = { default: Infinity } as const;` };
        const code = await passed(`import { Upper } from "./bounds.js";\n${keys("low", "high", "given", "mark")}declare module "@adobe/ecs" {
    interface Components { [mark]: { type: Lower } }
    interface Resources { [low]: { type: Lower }; [high]: { type: Upper }; [given]: { type: Lower; default: 1 } }
}
type Lower = F32;
const Lower = { default: -Infinity } as const;
const after = 1;`, files);
        expect(code?.split("\n").filter(line => line.startsWith("declare$"))).toEqual([
            `declare$(high, "resource", { type: {"type":"number","precision":1}, default: Upper.default });`,
            `declare$(given, "resource", { type: {"type":"number","precision":1}, default: 1 });`,
            `declare$(mark, "component", { type: {"type":"number","precision":1} });`,
            `declare$(low, "resource", { type: {"type":"number","precision":1}, default: Lower.default });`,
        ]);
        expect(code?.split("\n").slice(-3)).toEqual([
            `const Lower = { default: -Infinity } as const;`,
            `declare$(low, "resource", { type: {"type":"number","precision":1}, default: Lower.default });`,
            `const after = 1;`,
        ]);
    });
    test("takes the package's types' namespaces' defaults: identities for a quaternion and a matrix", async () => {
        expect(await registrations(`import { Quat, type Mat4x4 } from "@adobe/ecs";\n${keys("turn", "view")}declare module "@adobe/ecs" { interface Resources { [turn]: { type: Quat }; [view]: { type: Mat4x4 } } }`)).toEqual([
            `declare$(turn, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":4,"maxItems":4}, default: Quat.default });`,
            `declare$(view, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":16,"maxItems":16}, default: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] });`,
        ]);
    });
    test("starts a reduced resource at its operator's identity, within its type's range", async () => {
        expect(await registrations(`${keys("sum", "product", "least", "most", "all", "any", "bounds", "masked")}declare module "@adobe/ecs" {
    interface Resources {
        [sum]: { type: F32; reduce: "+" };
        [product]: { type: F32; reduce: "*" };
        [least]: { type: F32; reduce: "min" };
        [most]: { type: U32; reduce: "max" };
        [all]: { type: boolean; reduce: "&" };
        [any]: { type: boolean; reduce: "|" };
        [bounds]: { type: { readonly low: F32; readonly high: F32 }; reduce: "max" };
        [masked]: { type: U32; reduce: "&" };
    }
}`)).toEqual([
            `declare$(sum, "resource", { type: {"type":"number","precision":1}, default: 0, reduce: "+" });`,
            `declare$(product, "resource", { type: {"type":"number","precision":1}, default: 1, reduce: "*" });`,
            `declare$(least, "resource", { type: {"type":"number","precision":1}, default: Infinity, reduce: "min" });`,
            `declare$(most, "resource", { type: {"type":"integer","minimum":0,"maximum":4294967295}, default: 0, reduce: "max" });`,
            `declare$(all, "resource", { type: {"type":"boolean"}, default: true, reduce: "&" });`,
            `declare$(any, "resource", { type: {"type":"boolean"}, default: false, reduce: "|" });`,
            `declare$(bounds, "resource", { type: {"type":"object","properties":{"low":{"type":"number","precision":1},"high":{"type":"number","precision":1}}}, default: {"low":-Infinity,"high":-Infinity}, reduce: "max" });`,
            `declare$(masked, "resource", { type: {"type":"integer","minimum":0,"maximum":4294967295}, default: 4294967295, reduce: "&" });`,
        ]);
    });
    test("takes a type's namespace's default only when it's deeply readonly, as a default is shared", async () => {
        const declared = (holder: string) => `${keys("key")}declare module "@adobe/ecs" { interface Resources { [key]: { type: Settings } } }\ntype Settings = { readonly size: number };\n${holder}`;
        const shared = "a default is shared";
        expect(await registrations(declared(`const Settings = { default: { size: 1 } } as const;`))).toEqual([`declare$(key, "resource", { type: {"type":"object","properties":{"size":{"type":"number"}}}, default: Settings.default });`]);
        expect(await registrations(declared(`const start: Readonly<{ size: number }> = { size: 2 };\nconst Settings = { default: start };`))).toEqual([`declare$(key, "resource", { type: {"type":"object","properties":{"size":{"type":"number"}}}, default: Settings.default });`]);
        expect(await registrations(declared(`const start = { size: 2 } as const;\nconst Settings = { default: start };`))).toEqual([`declare$(key, "resource", { type: {"type":"object","properties":{"size":{"type":"number"}}}, default: Settings.default });`]);
        expect(await passed(declared(`const Settings = { default: { size: 1 } };`))).toContain("is shared by every row and world that starts from it");
        expect(await passed(declared(`const start = { size: 2 };\nconst Settings = { default: start } as const;`))).toContain("as const");
        const maps = `${keys("key")}declare module "@adobe/ecs" { interface Resources { [key]: { type: Names } } }\ntype Names = ReadonlyMap<string, number>;\n`;
        expect(await passed(`${maps}const Names = { default: new Map([["a", 1]]) };`)).toContain("is shared by every row and world");
        expect(await passed(`${maps}const names: Map<string, number> = new Map();\nconst Names = { default: names };`)).toContain("ReadonlyMap");
        expect(await registrations(`${maps}const names: ReadonlyMap<string, number> = new Map([["a", 1]]);\nconst Names = { default: names };`)).toEqual([`declare$(key, "resource", { type: {"type":"map","keys":{"type":"string"},"values":{"type":"number"}}, default: Names.default });`]);
        void shared;
    });
    test("takes a call in a readonly default when its function's declared return type is readonly", async () => {
        const declared = (code: string, files: { readonly [path: string]: string } = {}) => registrations(`${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: Note } } }\ntype Note = { readonly color: number; readonly tags: readonly string[] };\n${code}`, files);
        const note = (call: string) => `const Note = { default: { color: ${call}, tags: [] } } as const;`;
        expect(await declared(`function pack(r: number, g: number): number { return r + g; }\n${note("pack(255, 214)")}`)).toEqual([expect.stringContaining("default: Note.default")]);
        expect(await declared(`import { pack } from "./color.js";\n${note("pack(255, 214)")}`, { "/src/color.ts": `import type { U32 } from "@adobe/ecs";\nexport const pack = (r: number, g: number): U32 => r + g;` })).toEqual([expect.stringContaining("default: Note.default")]);
        expect(await declared(`const tagsOf = (): readonly string[] => [];\nconst Note = { default: { color: 1, tags: tagsOf() } } as const;`)).toEqual([expect.stringContaining("default: Note.default")]);
        expect(await declared(`function pack(r: number, g: number) { return r + g; }\n${note("pack(255, 214)")}`)).toEqual(expect.stringMatching(/^failure: Note\.default is shared .*`pack\(255, 214\)` returns a type the build can't see is readonly: annotate its return type/));
        expect(await declared(`const tagsOf = (): string[] => [];\nconst Note = { default: { color: 1, tags: tagsOf() } } as const;`)).toEqual(expect.stringMatching(/^failure: Note\.default is shared .*`tagsOf\(\)` returns a type that isn't readonly/));
    });
    test("writes a literal -0 as itself", async () => {
        expect(await registrations(`${keys("floor")}declare module "@adobe/ecs" { interface Resources { [floor]: { type: number; default: -0 } } }`))
            .toEqual([`declare$(floor, "resource", { type: {"type":"number"}, default: -0 });`]);
    });
    test("starts a struct's fields and a tuple's items at their own types' defaults", async () => {
        const code = await passed(`import type { Schema } from "@adobe/ecs";\n${keys("level", "box", "pair")}declare module "@adobe/ecs" {
    interface Resources {
        [level]: { type: { readonly value: Level } };
        [box]: { type: { readonly height: Height; readonly width: F32 } };
        [pair]: { type: readonly [Height, F32] };
    }
}
type Level = Schema.Type<{ type: "integer"; minimum: 1; maximum: 9 }>;
const Level = { default: 5 } as const;
type Height = F32;
const Height = { default: -1 } as const;`);
        expect(code?.split("\n").filter(line => line.startsWith("declare$"))).toEqual([
            `declare$(level, "resource", { type: {"type":"object","properties":{"value":{"type":"integer","minimum":1,"maximum":9}}}, default: { "value": Level.default } });`,
            `declare$(box, "resource", { type: {"type":"object","properties":{"height":{"type":"number","precision":1},"width":{"type":"number","precision":1}}}, default: { "height": Height.default, "width": 0 } });`,
            `declare$(pair, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":2,"maxItems":2}, default: [Height.default, 0] });`,
        ]);
    });
    test("gives a mutable Map or Set no start of its own: null when its type allows it, else a failure", async () => {
        expect(await registrations(`${keys("pool")}declare module "@adobe/ecs" { interface Resources { [pool]: { type: Pool | null } } }\ntype Pool = Map<string, number>;`)).toEqual([`declare$(pool, "resource", {});`]);
        expect(await passed(`${keys("pool")}declare module "@adobe/ecs" { interface Resources { [pool]: { type: Pool } } }\ntype Pool = Map<string, number>;`)).toContain("a ReadonlyMap or ReadonlySet starts fresh in each world, a Map or Set doesn't");
    });
    test("gives a value that isn't data no schema, and its traits", async () => {
        const files = { "/src/row.ts": `export class Row extends HTMLElement {}\nexport class Pool {}` };
        expect(await registrations(`import { Row, Pool } from "./row.js";\n${keys("row", "pool", "canvas", "callback")}declare module "@adobe/ecs" {
    interface Components { [row]: { type: Row; thread: "main" } }
    interface Resources {
        [pool]: { type: Pool | null; default: null };
        [canvas]: { type: OffscreenCanvas | null; transfer: true };
        [callback]: { type: (() => void) | null };
    }
}`, files)).toEqual([
            `declare$(row, "component", { thread: "main" });`,
            `declare$(pool, "resource", { default: null });`,
            `declare$(canvas, "resource", { transfer: true });`,
            `declare$(callback, "resource", {});`,
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
            `declare$(total, "resource", { type: {"type":"number","precision":1}, default: 0, reduce: "+" });`,
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
        const code = await passed(`declare module "@adobe/ecs" { interface Resources { [later]: { type: Start } } }
const later = Symbol();
type Start = Vec3;
const Start = { default: [1, 2, 3] } as const;
const after = 1;`);
        expect(code?.split("\n").slice(-3)).toEqual([`const Start = { default: [1, 2, 3] } as const;`, `declare$(later, "resource", { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3}, default: Start.default });`, `const after = 1;`]);
        // Code between the key and a block below uses the key registered.
        const above = await passed(`const speed = Symbol();\nconst uses = [speed];\ndeclare module "@adobe/ecs" { interface Resources { [speed]: { type: F32; default: 1 } } }`);
        expect(above?.split("\n").slice(1, 3)).toEqual([`const speed = Symbol();`, `declare$(speed, "resource", { type: {"type":"number","precision":1}, default: 1 });`]);
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
    test("starts a struct's fields and a tuple's items at imported namespaces' defaults, imported as values or types", async () => {
        const height = { "/src/height.ts": `import type { F32 } from "@adobe/ecs";\nexport type Height = F32;\nexport const Height = { default: 7 } as const;` };
        expect(await registrations(`import { Quat as Q } from "@adobe/ecs";\n${keys("e")}declare module "@adobe/ecs" { interface Resources { [e]: { type: { readonly q: Q } } } }`))
            .toEqual([`declare$(e, "resource", { type: {"type":"object","properties":{"q":{"type":"array","items":{"type":"number","precision":1},"minItems":4,"maxItems":4}}}, default: { "q": Q.default } });`]);
        expect(await registrations(`import type { Quat } from "@adobe/ecs";\n${keys("e")}declare module "@adobe/ecs" { interface Resources { [e]: { type: { readonly q: Quat } } } }`))
            .toEqual([expect.stringContaining(`default: {"q":[0,0,0,1]}`)]);
        expect(await registrations(`import type { Height } from "./height.js";\n${keys("e")}declare module "@adobe/ecs" { interface Resources { [e]: { type: readonly [Height, F32] } } }`, height))
            .toEqual([expect.stringContaining(`default: [7,0]`)]);
    });
    test("starts a reduced resource at its operator's identity only when it's one of its type's values", async () => {
        const reduced = (type: string, operator: string) => registrations(`import type { Schema } from "@adobe/ecs";\n${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: ${type}; reduce: "${operator}" } } }`);
        expect(await reduced("Entity", "min")).toEqual([expect.stringContaining("default: Entity.default")]);
        expect(await reduced(`Schema.Type<{ type: "integer"; minimum: 0 }>`, "min")).toEqual([expect.stringContaining("default: 0")]);
        expect(await reduced(`Schema.Type<{ type: "integer"; minimum: 0; maximum: 100 }>`, "&")).toEqual([expect.stringContaining("default: 0")]);
        expect(await reduced("U32", "&")).toEqual([expect.stringContaining("default: 4294967295")]);
        expect(await reduced(`Schema.Type<{ type: "integer"; minimum: 1; maximum: 9 }>`, "+")).toEqual(expect.stringMatching(/^failure: .*default/));
        expect(await reduced(`Schema.Type<{ type: "integer"; minimum: 2; maximum: 9 }>`, "*")).toEqual(expect.stringMatching(/^failure: .*default/));
    });
    test("starts a reduced struct's fields at their own types' namespaces' defaults before the identity", async () => {
        expect(await registrations(`${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: { readonly h: Height; readonly w: F32 }; reduce: "max" } } }\ntype Height = F32;\nconst Height = { default: 7 } as const;`))
            .toEqual([expect.stringContaining(`default: { "h": Height.default, "w": -Infinity }`)]);
    });
    test("fails for an object component whose namespace is imported as a type only, since its start is one object", async () => {
        expect(await registrations(`import type { Label } from "./label.js";\n${keys("k")}declare module "@adobe/ecs" { interface Components { [k]: { type: Label; thread: "main" } } }`,
            { "/src/label.ts": `export type Label = { readonly text: string };\nexport const Label = { default: { text: "x" } } as const;` })).toEqual(expect.stringMatching(/^failure: .*import Label as a value/));
    });
    test("fails for a namespace's default a cast makes mutable, wherever the cast is", async () => {
        const named = (namespace: string) => registrations(`${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: L } } }\ntype L = readonly number[];\n${namespace}`);
        expect(await named("const L = { default: [] as number[] } as const;")).toEqual(expect.stringMatching(/^failure: L\.default is shared/));
        expect(await named("const L = { default: [1, 2] as number[] } as const;")).toEqual(expect.stringMatching(/^failure: L\.default is shared/));
        expect(await named("const L = { default: ([1, 2] as const) as unknown as number[] };")).toEqual(expect.stringMatching(/^failure: L\.default is shared/));
        expect(await named("const L = { default: [1, 2] as const satisfies readonly number[] };")).toEqual([expect.stringContaining("default: L.default")]);
    });
    test("finds a default only where a schema's keywords are, and names the alias holding one", async () => {
        const typed = (type: string) => registrations(`import type { Schema } from "@adobe/ecs";\n${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: ${type} } } }`);
        expect(await typed(`Schema.Type<{ type: "object"; properties: { default: { type: "number" } }; required: ["default"] }>`)).toEqual([expect.stringContaining(`default: {"default":0}`)]);
        expect(await typed(`Schema.Type<{ const: { default: 1 } }>`)).toEqual([expect.stringContaining(`"const":{"default":1}`)]);
        expect(await registrations(`import type { Schema } from "@adobe/ecs";\n${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: Bad } } }\ntype Bad = Schema.Type<{ type: "number"; default: 1 }>;`))
            .toEqual(expect.stringMatching(/^failure: .*Bad/));
    });
    test("checks a namespace's default against its type when it can read it", async () => {
        expect(await registrations(`${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: Mode } } }\ntype Mode = "a" | "b";\nconst Mode = { default: "c" } as const;`))
            .toEqual(expect.stringMatching(/^failure: Mode\.default/));
    });
    test("writes in a namespace's -NaN imported as a type only", async () => {
        expect(await registrations(`import type { Z } from "./z.js";\n${keys("k")}declare module "@adobe/ecs" { interface Resources { [k]: { type: Z } } }`,
            { "/src/z.ts": `export type Z = number;\nexport const Z = { default: -NaN } as const;` })).toEqual([expect.stringContaining("default: NaN")]);
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
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: 1 | 2 | 4 } }`)}`)).toContain(`a union of literals without 0, false or "" starts at none of them`);
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: "all" | "done" } }`)}`)).toContain("declare `default:` one of them");
        expect(await passed(`const Mode = { a: 1, b: 2 } as const;\n${keys("key")}${block(`interface Resources { [key]: { type: (typeof Mode)[keyof typeof Mode] } }`)}`)).toContain("starts at none of them");
        expect(await passed(`class Pool {}\n${keys("key")}${block(`interface Resources { [key]: { type: Pool } }`)}`)).toContain("let its type allow null");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: OffscreenCanvas } }`)}`)).toContain("let its type allow null");
        expect(await passed(`import type { Schema } from "@adobe/ecs";\n${keys("key")}${block(`interface Resources { [key]: { type: Schema.Type<{ type: "integer"; minimum: 1; maximum: 9 }> } }`)}`))
            .toContain("name its type and give the type a namespace with a `default`");
        expect(await passed(`${keys("key")}type Level = 1 | 2 | 4;\n${block(`interface Resources { [key]: { type: Level } }`)}`)).toContain("give Level a namespace with a `default`: `const Level = { default: ... }`");
        expect(await passed(`import type { Schema } from "@adobe/ecs";\n${keys("key")}${block(`interface Resources { [key]: { type: Schema.Type<{ type: "integer"; default: 5 }> } }`)}`)).toContain("a schema holds no default");
        expect(await passed(`import type { Schema } from "@adobe/ecs";\n${keys("key")}${block(`interface Resources { [key]: { type: Schema.Type<{ type: "integer"; minimum: 1; maximum: 9 }> } }`)}`)).toContain("0 isn't one of its values");
        expect(await passed(`const start = 1;\n${keys("key")}${block(`interface Resources { [key]: { type: number; default: typeof start } }`)}`)).toContain("default is a literal type, never `typeof` a value");
        expect(await passed(`import type { Lower } from "./bounds.js";\n${keys("key")}${block(`interface Resources { [key]: { type: Lower } }`)}`, { "/src/bounds.ts": `export type Lower = number;\nconst start: number = Date.now();\nexport const Lower = { default: start } as const;` })).toContain("import Lower as a value");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: U32; default: -1 } }`)}`)).toContain("isn't of its declared type");
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
