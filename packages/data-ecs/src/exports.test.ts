import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "data-ecs-exports-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

const messages = (diagnostics: readonly ts.Diagnostic[]): string[] =>
    diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

const installed = join(temporary, "node_modules", "@adobe", "data-ecs");

/** Emits the package's declarations into node_modules, as a consumer installs it. */
const install = (): void => {
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "package.json"), readFileSync(join(packageRoot, "package.json")));
    const config = ts.getParsedCommandLineOfConfigFile(join(packageRoot, "tsconfig.json"), { outDir: join(installed, "dist"), emitDeclarationOnly: true, composite: false, incremental: false, sourceMap: false }, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
    if (config === undefined) throw new Error("No tsconfig.json.");
    const program = ts.createProgram([join(packageRoot, "src", "index.ts")], config.options);
    // Its own sources check without the test runner's Node types, as a consumer's build sees them.
    expect(messages([...ts.getPreEmitDiagnostics(program), ...program.emit().diagnostics])).toEqual([]);
    mkdirSync(join(temporary, "node_modules", "@webgpu"), { recursive: true });
    cpSync(join(packageRoot, "node_modules", "@webgpu", "types"), join(temporary, "node_modules", "@webgpu", "types"), { recursive: true, dereference: true });
};

const consumer = `
import { Archetype, Component, Index, Rule, System, World, gpuDevice } from "@adobe/data-ecs";
export const position = Symbol("exportsTest/position");
export const element = Symbol("exportsTest/element");
export const shown = Symbol("exportsTest/shown");
declare module "@adobe/data-ecs" {
    interface Components { [position]: { type: number }; [element]: { type: HTMLElement; thread: "main" }; [shown]: { type: true; derived: true } }
}
Component.register(position, { type: { type: "number" } });
Component.register(element, { thread: "main" });
Component.register(shown, { type: { const: true }, derived: true });
export const Placed = Archetype.create([position, element]);
export const showing = Rule.create({ components: { has: [element] }, derive: [shown] });
export const move = System.create({ name: "exportsTest/move", components: { write: [position] } }, row => { row[position] += 1; });
export const all = System.create({ name: "exportsTest/all", systems: [move] });
export const draw = System.render({ name: "exportsTest/draw", shader: { accessors: {} } }, () => {});
export const placed = Index.create({ name: "exportsTest/placed", key: [position], components: { has: [element] } });
export const ranked = Index.create({ key: [position], sorted: true });
export const after = System.create({ components: { read: [position] }, lookup: { next: { index: ranked, read: [position] } } }, (row, { lookup }) => { void lookup.next({ ">": row[position] }).length; });
export const sortedName = (index: Index<{ readonly sorted: true }>): string => index.name;
// How a world is created is the implementation's; the interface gives its type.
declare const create: () => World;
export const world = create();
export const observeEntity = (entity: Parameters<World["observe"]["entity"]>[0]) => world.observe.entity(entity, { required: [position] });
export const device = world.observe.resource(gpuDevice);
export const observe = world.observe;
export const query: World.Query<[typeof position]> = { required: [position], where: { [position]: { ">": 0 } } };
export const selected = world.observe.select(query);
export const counted = world.observe.count({ required: [position] });
`;

/** Every declaration file reachable from `file` by relative imports, relative to `directory`. */
const reachable = (directory: string, file: string): string[] => {
    const seen = new Set<string>();
    const pending = [join(directory, file)];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if (seen.has(next)) continue;
        seen.add(next);
        for (const [, specifier] of readFileSync(next, "utf8").matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
            pending.push(join(dirname(next), specifier.replace(/\.js$/, ".d.ts")));
        }
    }
    return [...seen].map(path => relative(directory, path)).sort();
};

/** Modules only the implementation reads: the registry's read side and the forms of systems it holds. */
const internal = (path: string): boolean =>
    path.startsWith("interface/registry/")
    || path === "interface/system/composite.d.ts" || path === "interface/system/leaf.d.ts" || path === "interface/system/definition.d.ts"
    || path.startsWith("interface/gpu/record");

/** Compiles a consumer's `index.ts` against the installed package, emitting its declarations. */
const compile = (source: string): { readonly messages: string[] } => {
    writeFileSync(join(temporary, "index.ts"), source);
    const program = ts.createProgram([join(temporary, "index.ts")], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
        types: ["@webgpu/types"],
        strict: true,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: join(temporary, "out"),
    });
    const result = program.emit();
    return { messages: messages([...ts.getPreEmitDiagnostics(program), ...result.diagnostics]) };
};

/** A consumer that registers a symbol-keyed component beside the augmentation given. */
const stringKeyed = (augmentation: string, registration = ""): string => `
import { Component, Trait } from "@adobe/data-ecs";
export const keyed = Symbol("exportsTest/keyed");
declare module "@adobe/data-ecs" {
    interface Components { [keyed]: { type: number } }
    ${augmentation}
}
Component.register(keyed, { type: { type: "number" } });
${registration}
`;

/** A consumer with a system whose declaration lists a key in both read and write, and composites of conflicting inputs. */
const misdeclared = `
import { Component, System } from "@adobe/data-ecs";
export const health = Symbol("exportsTest/health");
declare module "@adobe/data-ecs" {
    interface Components { [health]: { type: number } }
}
Component.register(health, { type: { type: "number" } });
export const both = System.create({ components: { read: [health], write: [health] } }, () => {});
const near = System.create({ input: { type: "object", properties: { distance: { type: "number" } } } }, () => {});
const far = System.create({ input: { type: "object", properties: { distance: { type: "string" } } } }, () => {});
export const listed = System.create([near, far]);
export const declared = System.create({ systems: [near, far], after: [both] });
`;

describe("package exports", () => {
    beforeAll(() => {
        install();
        writeFileSync(join(temporary, "package.json"), JSON.stringify({ name: "consumer", type: "module", private: true }));
    }, 60_000);
    it("let a consumer emit declarations for the values it makes from the public API", () => {
        expect(compile(consumer).messages).toEqual([]);
        expect(reachable(join(installed, "dist"), "index.d.ts").filter(internal)).toEqual([]);
        // An index's type reads as it was declared, naming only the package root.
        const emitted = readFileSync(join(temporary, "out", "index.d.ts"), "utf8");
        expect(emitted).toContain(`export declare const placed: Index<{
    readonly name: "exportsTest/placed";
    readonly key: readonly [typeof position];
    readonly components: {
        readonly has: readonly [typeof element];
    };
}>;`);
        expect(emitted).toContain(`export declare const ranked: Index<{
    readonly key: readonly [typeof position];
    readonly sorted: true;
}>;`);
        expect([...emitted.matchAll(/import\("([^"]+)"\)/g)].map(match => match[1]).filter(path => path !== "@adobe/data-ecs")).toEqual([]);
    }, 60_000);
    it("report a misdeclared system, and a composite of conflicting members, at the mistake rather than as no overload matching", () => {
        const reported = compile(misdeclared).messages;
        expect(reported.some(message => message.includes("No overload matches"))).toBe(false);
        expect(reported.filter(message => message.includes(`has a different type in another member of this composite.`))).toHaveLength(4);
        expect(reported.some(message => message.startsWith("Type '[unique symbol]' is not assignable"))).toBe(true);
    }, 60_000);
    it("fail every registration to compile while a component, resource or trait is keyed by a string, naming the keys", () => {
        expect(compile(stringKeyed(`interface Components { "exportsTest/named": { type: number } }`)).messages.join("\n"))
            .toContain(`'{ readonly "component keys must be symbols": "exportsTest/named"; }'`);
        expect(compile(stringKeyed(`interface Resources { "exportsTest/time": { type: number } }`)).messages.join("\n"))
            .toContain(`'{ readonly "resource keys must be symbols": "exportsTest/time"; }'`);
        const trait = compile(stringKeyed(`interface Traits<N> { readonly persisted: true }`, `Trait.register("persisted");`)).messages.join("\n");
        expect(trait).toContain(`'{ readonly "trait keys must be symbols": "persisted"; }'`);
        // Registration takes only symbol keys, so a string-keyed trait can't be registered either.
        expect(trait).toContain(`Argument of type '"persisted"' is not assignable`);
    }, 60_000);
});
