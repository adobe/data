// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { passInputSchemas, type InputHost } from './input-schemas.js';

/** Files by path; `@adobe/ecs` is the package, which also exports `System`. */
const hostOf = (files: { readonly [path: string]: string }): InputHost => ({
    parse: (code, file) => parseAst(code, { lang: "ts" }, file),
    resolve: async specifier => specifier.startsWith("./") && `/src/${specifier.slice(2).replace(/\.js$/, ".ts")}` in files ? `/src/${specifier.slice(2).replace(/\.js$/, ".ts")}` : null,
    load: async file => files[file] ?? "",
    isPackage: async specifier => specifier === "@adobe/ecs",
    isSystem: async specifier => specifier === "@adobe/ecs",
});

const header = `import { System, type Entity, type Vec2, type F32, type I32 } from "@adobe/ecs";\n`;

/** The schemas the pass gives each system of `body`, in order. */
const schemasOf = async (body: string, files: { readonly [path: string]: string } = {}): Promise<unknown> => {
    const code = header + body;
    const result = await passInputSchemas(code, "/src/main.ts", hostOf(files));
    if (result === null) return null;
    if ("failure" in result) return { failure: result.failure.message };
    return [...result.code.matchAll(/, (\{.*\})\);?$/gm)].map(match => JSON.parse(match[1] ?? "null"));
};

describe("passInputSchemas", () => {
    test("gives a system the schema of its body's parameter after its context", async () => {
        expect(await schemasOf(`System.create({}, (_context, input: { readonly count: number; label: string; on: boolean; none: null }) => {});`)).toEqual([
            { type: "object", properties: { count: { type: "number" }, label: { type: "string" }, on: { type: "boolean" }, none: { type: "null" } } },
        ]);
    });
    test("finds the input after the row when the declaration has components", async () => {
        expect(await schemasOf(`System.create({ components: { read: [a] } }, (row, context, input: { dx: number }) => {});`)).toEqual([
            { type: "object", properties: { dx: { type: "number" } } },
        ]);
        expect(await schemasOf(`System.create({ components: { read: [a] } }, (row, context) => {});`)).toBe(null);
    });
    test("takes a declaration not written in place's input from a third parameter, or a second with a type", async () => {
        expect(await schemasOf([
            `System.create(declaration, (row, context, input: { a: number }) => {});`,
            `System.create(declaration, (context, input: { b: number }) => {});`,
            `System.create(declaration, (row, context) => {});`,
        ].join("\n"))).toEqual([{ type: "object", properties: { a: { type: "number" } } }, { type: "object", properties: { b: { type: "number" } } }]);
    });
    test("passes nothing for a body without input", async () => {
        expect(await schemasOf(`System.create({ resources: { read: [a] } }, ({ resources }) => {});\nSystem.create(context => {});`)).toBe(null);
    });
    test("reads optional fields, literals, unions, arrays, tuples, sets and maps", async () => {
        expect(await schemasOf(`System.create({}, (_c, input: {
            mode?: "add" | "remove";
            level: 1 | -1;
            tags: readonly string[];
            ids: ReadonlyArray<Entity>;
            pair: [number, number];
            seen: ReadonlySet<string>;
            names: ReadonlyMap<Entity, string>;
            maybe: string | null;
        }) => {});`)).toEqual([{
            type: "object",
            properties: {
                mode: { anyOf: [{ const: "add" }, { const: "remove" }] },
                level: { anyOf: [{ const: 1 }, { const: -1 }] },
                tags: { type: "array", items: { type: "string" } },
                ids: { type: "array", items: { type: "integer", format: "entity" } },
                pair: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
                seen: { type: "set", items: { type: "string" } },
                names: { type: "map", keys: { type: "integer", format: "entity" }, values: { type: "string" } },
                maybe: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["level", "tags", "ids", "pair", "seen", "names", "maybe"],
        }]);
    });
    test("gives the package's types their schemas", async () => {
        expect(await schemasOf(`System.create({}, (_c, input: { entity: Entity; at: Vec2; cell: Vec2.I32; dt: F32; steps: I32 }) => {});`)).toEqual([{
            type: "object",
            properties: {
                entity: { type: "integer", format: "entity" },
                at: { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 },
                cell: { type: "array", items: { type: "integer", minimum: -2147483648, maximum: 2147483647 }, minItems: 2, maxItems: 2 },
                dt: { type: "number", precision: 1 },
                steps: { type: "integer", minimum: -2147483648, maximum: 2147483647 },
            },
        }]);
    });
    test("takes any value for a platform class or unknown", async () => {
        expect(await schemasOf(`System.create({}, (_c, input: { canvas: OffscreenCanvas; bitmap: ImageBitmap; anything: unknown }) => {});`)).toEqual([
            { type: "object", properties: { canvas: { allOf: [] }, bitmap: { allOf: [] }, anything: { allOf: [] } } },
        ]);
    });
    test("follows aliases and interfaces, here and in modules imported", async () => {
        const files = {
            "/src/types.ts": `export type Move = { readonly by: number };\nexport interface Named { readonly name: string }\nexport { type Tagged } from "./more.js";\nexport * from "./all.js";`,
            "/src/more.ts": `export interface Tagged extends Base { readonly tag: string }\ninterface Base { readonly base: boolean }`,
            "/src/all.ts": `export type Spread = { readonly spread: number };`,
        };
        expect(await schemasOf([
            `import type { Move, Named, Tagged, Spread } from "./types.js";`,
            `type Local = Move & Named;`,
            `System.create({}, (_c, input: Local) => {});`,
            `System.create({}, (_c, input: Tagged) => {});`,
            `System.create({}, (_c, input: Spread) => {});`,
        ].join("\n"), files)).toEqual([
            { type: "object", properties: { by: { type: "number" }, name: { type: "string" } } },
            { type: "object", properties: { base: { type: "boolean" }, tag: { type: "string" } } },
            { type: "object", properties: { spread: { type: "number" } } },
        ]);
    });
    test("names the module of a type it can't read", async () => {
        const failed = await passInputSchemas(`${header}import type { Bad } from "./bad.js";\nSystem.create({}, (_c, input: Bad) => {});`, "/src/main.ts", hostOf({ "/src/bad.ts": `export type Bad = Pick<Big, "x">;` }));
        expect(failed !== null && "failure" in failed ? failed.failure.frames.map(frame => [frame.file, frame.line]) : failed).toEqual([["/src/bad.ts", 1]]);
        expect(failed !== null && "failure" in failed ? failed.dependencies : failed).toEqual(["/src/bad.ts"]);
    });
    test("fails, saying why, for what an input type can't be", async () => {
        const failure = async (body: string) => {
            const schemas = await schemasOf(body);
            return typeof schemas === "object" && schemas !== null && "failure" in schemas ? schemas.failure : schemas;
        };
        expect(await failure(`System.create({}, (_c, input) => {});`)).toContain("has a type");
        expect(await failure(`System.create({}, (_c, input: { a?: number | undefined }) => {});`)).toContain("optional");
        expect(await failure(`System.create({}, (_c, input: Pick<Big, "x">) => {});`)).toContain("type arguments");
        expect(await failure(`type Tree = { readonly child: Tree };\nSystem.create({}, (_c, input: Tree) => {});`)).toContain("refers to itself");
        expect(await failure(`type Box<T> = { readonly value: T };\nSystem.create({}, (_c, input: Box) => {});`)).toContain("generic");
        expect(await failure(`System.create({}, (_c, input: [number, string]) => {});`)).toContain("one type");
        expect(await failure(`System.create({}, (_c, input: number) => {});`)).toContain("object of named fields");
        expect(await failure(`System.create({}, (_c, input: { when: Date }) => {});`)).toContain("isn't a type an input can hold");
        expect(await failure(`System.create({}, (_c, ...rest: [{ a: number }]) => {});`)).toContain("rest parameter");
    });
    test("inserts each schema after the body, mapping the rest of the line back", async () => {
        const result = await passInputSchemas(`${header}System.create({}, (_c, input: { a: number }) => {}); const after = 1;`, "/src/main.ts", hostOf({}));
        expect(result !== null && "code" in result ? result.code.split("\n")[1] : result).toBe(`System.create({}, (_c, input: { a: number }) => {}, {"type":"object","properties":{"a":{"type":"number"}}}); const after = 1;`);
        expect(result !== null && "map" in result ? result.map.mappings.length > 0 : result).toBe(true);
    });
    test("leaves calls of another System", async () => {
        expect(await passInputSchemas(`import { System } from "elsewhere";\nSystem.create({}, (_c, input: { a: number }) => {});`, "/src/main.ts", hostOf({}))).toBe(null);
    });
});
