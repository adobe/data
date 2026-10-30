// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "ecs-exports-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

const messages = (diagnostics: readonly ts.Diagnostic[]): string[] =>
    diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

const installed = join(temporary, "node_modules", "@adobe", "ecs");

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
import { Index, Rule, System, World, gpuDevice, workers } from "@adobe/ecs";
export const position = Symbol("exportsTest/position");
export const element = Symbol("exportsTest/element");
export const shown = Symbol("exportsTest/shown");
declare module "@adobe/ecs" {
    interface Components { [position]: { type: number }; [element]: { type: HTMLElement; thread: "main" }; [shown]: { type: true; derived: true } }
}
export const Placed = [position, element] as const;
export const showing = Rule.create({ components: { with: [element] }, derive: [shown] });
export const move = System.create({ components: { with: [position] } }, row => { row[position] += 1; });
export const all = System.create({ systems: [move] });
export const draw = System.render({ shader: { accessors: {} } }, () => {});
export const placed = Index.create({ key: [position], components: { with: [element] } });
export const ranked = Index.create({ key: [position], sorted: true });
export const after = System.create({ components: { with: [position] }, lookup: { next: { index: ranked } } }, (row, { lookup }) => { void lookup.next({ ">": row[position] }).length; });
export const sortedName = (index: Index<{ readonly sorted: true }>): string => index.name;
// A world comes from the one import every other value does.
export const world: World = World.create({ [workers]: 0 });
// Another thread joins it through the other end of a channel the world shares.
declare const port: MessagePort;
export const joined: Promise<World> = World.join(port, { threads: ["main"] });
export const read = System.create({ readonly: true, components: { with: [position] }, lookup: { at: { with: [position] } } }, () => {});
export const added = world.add(read);
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
const compile = (source: string): { readonly messages: string[]; readonly lines: number[] } => {
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
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
    // Each diagnostic's line in the consumer, 1-based; 0 for one outside it.
    const lines = diagnostics.map(diagnostic => diagnostic.file === undefined || diagnostic.start === undefined || !diagnostic.file.fileName.endsWith("index.ts")
        ? 0
        : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1);
    return { messages: messages(diagnostics), lines };
};

/** The 1-based lines of `source` holding `text`. */
const linesWith = (source: string, text: string): number[] =>
    source.split("\n").flatMap((line, index) => line.includes(text) ? [index + 1] : []);

/** A consumer with a system whose declaration lists a key in both read and write, and composites of conflicting inputs. */
const misdeclared = `
import { System } from "@adobe/ecs";
export const health = Symbol("exportsTest/health");
declare module "@adobe/ecs" {
    interface Components { [health]: { type: number } }
}
// What a body reads is inferred, never declared.
export const both = System.create({ components: { read: [health] } }, () => {});
const near = System.create({}, (_context, input: { readonly distance: number }) => { void input; });
const far = System.create({}, (_context, input: { readonly distance: string }) => { void input; });
export const listed = System.create([near, far]);
export const declared = System.create({ systems: [near, far], after: [both] });
`;

/** A consumer spawning with a shared component's value missing, a constant outside its list, and a value given twice. */
const misspawned = `
import { System } from "@adobe/ecs";
export const team = Symbol("exportsTest/team");
export const health = Symbol("exportsTest/health");
export const armor = Symbol("exportsTest/armor");
declare module "@adobe/ecs" {
    interface Components { [team]: { type: "red" | "blue"; shared: true }; [health]: { type: number }; [armor]: { type: number } }
}
export const spawning = System.create(({ commands }) => {
    commands.spawn([team, health]);
    commands.spawn([team], { [team]: "red", [health]: 1 });
    const whole = commands.spawn([team, health], { [team]: "red", [health]: 1 });
    whole();
    whole({});
    whole({ [health]: 2 });
    whole({ [armor]: 2 });
    commands.spawn([team, health, armor], { [team]: "red", [health]: 1 })({ [armor]: 1, [health]: 2 });
});
`;

/** A consumer creating two worlds and using them, with `declarations` augmenting the package. */
const creating = (declarations: string): string => `
import { World, workers, type Component } from "@adobe/ecs";
${declarations}
export const world: World = World.create();
export const other: World = World.create({ [workers]: 0 });
export const typed: World = world;
export const disposed = other.dispose();
`;

/** A trait of your own on a key its type doesn't allow. */
const customTrait = creating(`
export const instanced = Symbol();
export const foo = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> { readonly [instanced]: N extends Component.Key ? ([Component<N>] extends [readonly number[]] ? true : never) : never }
    interface Components { [foo]: { type: string; [instanced]: true } }
}`);

/** A built-in trait on a key its type doesn't allow: a thread on a struct. */
const builtInTrait = creating(`
export const spot = Symbol();
declare module "@adobe/ecs" {
    interface Components { [spot]: { type: number; thread: "main" } }
}`);

/** A shared component of a value that isn't comparable data: a map. */
const sharedMap = creating(`
export const scores = Symbol();
declare module "@adobe/ecs" {
    interface Components { [scores]: { type: ReadonlyMap<string, number>; shared: true } }
}`);

/** A default that isn't of the declared type. */
const wrongDefault = creating(`
export const label = Symbol();
declare module "@adobe/ecs" {
    interface Resources { [label]: { type: string; default: 1 } }
}`);

/** One key with several members that don't hold: a custom trait and a thread on a string. */
const severalTraits = creating(`
export const instanced = Symbol();
export const name = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> { readonly [instanced]: N extends Component.Key ? ([Component<N>] extends [readonly number[]] ? true : never) : never }
    interface Components { [name]: { type: string; [instanced]: true; thread: "main" } }
}`);

/** One key whose default is of another type and which can't be transferred. */
const defaultAndTransfer = creating(`
export const canvas = Symbol();
declare module "@adobe/ecs" {
    interface Resources { [canvas]: { type: string; default: 1; transfer: true } }
}`);

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
    readonly key: readonly [typeof position];
    readonly components: {
        readonly with: readonly [typeof element];
    };
}>;`);
        expect(emitted).toContain(`export declare const ranked: Index<{
    readonly key: readonly [typeof position];
    readonly sorted: true;
}>;`);
        expect([...emitted.matchAll(/import\("([^"]+)"\)/g)].map(match => match[1]).filter(path => path !== "@adobe/ecs")).toEqual([]);
    }, 60_000);
    it("report a declaration that doesn't hold once at each World.create call, naming the key, the member and the problem", () => {
        const cases = [
            { source: customTrait, named: `readonly [foo]: { readonly [instanced]: "isn't allowed on this key"; }` },
            { source: builtInTrait, named: `readonly [spot]: { readonly thread: "isn't allowed on this key"; }` },
            { source: sharedMap, named: `readonly [scores]: { readonly shared: "isn't allowed on this key"; }` },
            { source: wrongDefault, named: `readonly [label]: { readonly default: "isn't of the declared type"; }` },
        ];
        for (const { source, named } of cases) {
            const { messages: reported, lines } = compile(source);
            // One error per call, on the call; uses of the worlds type-check.
            expect(lines).toEqual(linesWith(source, "World.create("));
            for (const message of reported) {
                expect(message).toContain("declarations don't hold");
                expect(message).toContain(named);
            }
        }
        expect(compile(creating("")).messages).toEqual([]);
    }, 60_000);
    it("name every member of a key that doesn't hold", () => {
        const cases = [
            { source: severalTraits, named: [`readonly [instanced]: "isn't allowed on this key"`, `readonly thread: "isn't allowed on this key"`] },
            { source: defaultAndTransfer, named: [`readonly default: "isn't of the declared type"`, `readonly transfer: "isn't allowed on this key"`] },
        ];
        for (const { source, named } of cases) {
            const { messages: reported, lines } = compile(source);
            expect(lines).toEqual(linesWith(source, "World.create("));
            for (const message of reported) for (const member of named) expect(message).toContain(member);
        }
    }, 60_000);
    it("report a spawn's missing shared value, a constant outside its list and a value given in both calls by the key", () => {
        const { messages: reported, lines } = compile(misspawned);
        const at = (text: string): number => linesWith(misspawned, text)[0];
        const on = (line: number): string => reported.filter((_, k) => lines[k] === line).join("\n");
        expect(on(at("commands.spawn([team, health]);"))).toContain(`"error: a spawn of a shared component takes its value first, in its constants"`);
        expect(on(at("commands.spawn([team, health]);"))).toContain(`{ readonly [team]: "red" | "blue"; }`);
        expect(on(at(`commands.spawn([team], {`))).toContain(`"error: a constant names a component of the spawn's list"`);
        expect(on(at(`commands.spawn([team], {`))).toContain(`{ readonly [health]: "isn't one"; }`);
        expect(on(at("whole();"))).toBe("");
        expect(on(at("whole({});"))).toBe("");
        expect(on(at("whole({ [health]: 2 });"))).toContain(`"error: a spawn gives each component's value in one of its calls, this one in its constants": { readonly [health]: "given"; }`);
        expect(on(at("whole({ [armor]: 2 });"))).not.toBe("");
        expect(on(at("({ [armor]: 1, [health]: 2 });"))).toContain(`"error: a spawn gives each component's value in one of its calls, this one in its constants"`);
        expect(lines.filter(line => line === 0)).toEqual([]);
    }, 60_000);
    it("report a misdeclared system, and a composite of conflicting members, at the mistake rather than as no overload matching", () => {
        const reported = compile(misdeclared).messages;
        expect(reported.some(message => message.includes("No overload matches"))).toBe(false);
        expect(reported.filter(message => message.includes(`has a different type in another member of this composite.`))).toHaveLength(4);
        expect(reported.some(message => message.startsWith("Type 'symbol[]' is not assignable to type 'undefined'"))).toBe(true);
    }, 60_000);
});

describe("the package's dependencies", () => {
    it("are none at run time: consumers install nothing with it", () => {
        const manifest: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
        const listed = typeof manifest === "object" && manifest !== null ? ["dependencies", "optionalDependencies", "bundledDependencies"].filter(field => field in manifest) : [];
        expect(listed).toEqual([]);
    });
});
