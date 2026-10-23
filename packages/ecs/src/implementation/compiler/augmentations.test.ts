// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { augmentationInsertions } from './augmentations.js';
import { insertInto } from './source-map.js';
import { hostOf } from './type-host.test-helper.js';
import { moduleOf } from './type-schemas.js';

const header = `import { Entity, type F32, type U32, type Vec3 } from "@adobe/ecs";\n`;

/** The module as the pass leaves it, or its failure's message. */
const passed = async (body: string, files: { readonly [path: string]: string } = {}): Promise<string | null> => {
    const code = header + body;
    const host = hostOf(files);
    const result = await augmentationInsertions(moduleOf("/src/keys.ts", code, host.parse(code, "/src/keys.ts")), host);
    if (result === null) return null;
    if ("failure" in result) return `failure: ${result.failure.message}`;
    return insertInto(code, result.insertions, "/src/keys.ts").code;
};

/** The registrations the pass emits, one per line, without the import. */
const registrations = async (body: string, files: { readonly [path: string]: string } = {}): Promise<readonly string[] | string | null> => {
    const code = await passed(body, files);
    if (code === null || code.startsWith("failure: ")) return code;
    return code.split("\n").filter(line => /^declare(Component|Resource|Trait)\$\(/.test(line));
};

const keys = (...names: readonly string[]) => names.map(name => `const ${name} = Symbol();`).join("\n") + "\n";

describe("augmentationInsertions", () => {
    test("registers each component and resource with the schema of its type", async () => {
        expect(await registrations(`${keys("position", "done", "label", "speed", "count")}declare module "@adobe/ecs" {
    interface Components { [position]: { type: Vec3 }; [done]: { type: boolean }; [label]: { type: string } }
    interface Resources { [speed]: { type: F32 | null }; [count]: { type: U32 | null } }
}`)).toEqual([
            `declareComponent$(position, { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3} });`,
            `declareComponent$(done, { type: {"type":"boolean"} });`,
            `declareComponent$(label, { type: {"type":"string"} });`,
            `declareResource$(speed, { type: {"anyOf":[{"type":"number","precision":1},{"type":"null"}]} });`,
            `declareResource$(count, { type: {"anyOf":[{"type":"integer","minimum":0,"maximum":4294967295},{"type":"null"}]} });`,
        ]);
    });
    test("imports the registry's hooks it calls", async () => {
        const code = await passed(`${keys("tag")}declare module "@adobe/ecs" { interface Components { [tag]: { type: true } } }`);
        expect(code?.split("\n")[0]).toBe(`import { declareComponent as declareComponent$ } from "declare.js";`);
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
            `declareResource$(gravity, { type: {"type":"number","precision":1,"default":-9.8} });`,
            `declareResource$(mode, { type: {"anyOf":[{"const":"all"},{"const":"done"}],"default":"all"} });`,
            `declareResource$(selected, { type: {"type":"integer","format":"entity","default":Entity.none} });`,
            `declareResource$(origin, { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3,"default":[0,0,0]} });`,
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
            `declareComponent$(row, { thread: "main" });`,
            `declareResource$(pool, { default: empty });`,
            `declareResource$(canvas, { transfer: true });`,
            `declareResource$(callback, {});`,
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
            `declareTrait$(instanced);`,
            `declareComponent$(host, { type: {"const":true} });`,
            `declareComponent$(outline, { type: {"type":"number"}, within: host, [instanced]: true });`,
            `declareComponent$(owner, { type: {"type":"integer","format":"entity"}, reference: "owner" });`,
            `declareComponent$(drawn, { type: {"const":true}, derived: true });`,
            `declareResource$(total, { type: {"type":"number","precision":1,"default":0}, reduce: "+" });`,
        ]);
    });
    test("follows a type named by Schema.Type and imported keys", async () => {
        const files = { "/src/units.ts": `import type { Schema } from "@adobe/ecs";\nexport type Level = Schema.Type<{ type: "integer"; minimum: 0; maximum: 9 }>;\nexport const level = Symbol();` };
        expect(await registrations(`import { level, type Level } from "./units.js";\ndeclare module "@adobe/ecs" { interface Components { [level]: { type: Level } } }`, files)).toEqual([
            `declareComponent$(level, { type: {"type":"integer","minimum":0,"maximum":9} });`,
        ]);
    });
    test("registers after the block, its key and the value its default names, whichever comes last", async () => {
        const code = await passed(`declare module "@adobe/ecs" { interface Resources { [later]: { type: Vec3; default: typeof start } } }\nconst later = Symbol();\nconst start = [1, 2, 3] as const;\nconst after = 1;`);
        expect(code?.split("\n").slice(-3)).toEqual([`const start = [1, 2, 3] as const;`, `declareResource$(later, { type: {"type":"array","items":{"type":"number","precision":1},"minItems":3,"maxItems":3,"default":start} });`, `const after = 1;`]);
    });
    test("passes over modules without a declaration of the package", async () => {
        expect(await passed(`declare module "elsewhere" { interface Components { [x]: { type: number } } }\nconst x = Symbol();`)).toBe(null);
    });
    test("fails, saying why, for what a declaration can't be", async () => {
        const block = (body: string) => `declare module "@adobe/ecs" { ${body} }`;
        expect(await passed(`const key = Symbol.for("key");\n${block(`interface Components { [key]: { type: number } }`)}`)).toContain("top-level `Symbol()` constant");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: number } }`)}`)).toContain("default");
        expect(await passed(`${keys("key")}${block(`interface Resources { [key]: { type: U32; default: -1 } }`)}`)).toContain("isn't of its declared type");
        expect(await passed(`import type { Entity as E } from "@adobe/ecs";\n${keys("key")}${block(`interface Resources { [key]: { type: Entity; default: typeof E.none } }`)}`)).toContain("type only");
        expect(await passed(`${keys("key")}${block(`interface Components { [key]: { type: HTMLDivElement } }`)}`)).toContain(`thread: "main"`);
        expect(await passed(`${keys("key")}${block(`interface Components { [key]: { type: Pick<{ a: number }, "a"> } }`)}`)).toContain("type arguments");
        expect(await passed(`${keys("key")}${block(`interface Components { [key]: { derived: true } }`)}`)).toContain("declares its type");
        expect(await passed(block(`interface Traits<N> { readonly layer: true }`))).toContain("keyed by a `Symbol()` constant");
    });
});
