import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

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
import { Component, System, World, gpuDevice } from "@adobe/data-ecs";
export const position = "exportsTest/position";
declare module "@adobe/data-ecs" {
    interface Components { [position]: { type: number } }
}
Component.register(position, { type: { type: "number" } });
export const move = System.create({ name: "exportsTest/move", components: { write: [position] } }, row => { row[position] += 1; });
export const all = System.composite({ name: "exportsTest/all", systems: [move] });
export const draw = System.render({ name: "exportsTest/draw", shader: { accessors: {} } }, () => {});
// How a world is created is the implementation's; the interface gives its type.
declare const create: World.Create;
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
    (path.startsWith("interface/registry/") && path !== "interface/registry/registry.d.ts")
    || path === "interface/system/composite.d.ts" || path === "interface/system/leaf.d.ts" || path === "interface/system/definition.d.ts"
    || path.startsWith("interface/gpu/record");

describe("package exports", () => {
    it("let a consumer emit declarations for the values it makes from the public API", () => {
        install();
        writeFileSync(join(temporary, "package.json"), JSON.stringify({ name: "consumer", type: "module", private: true }));
        writeFileSync(join(temporary, "index.ts"), consumer);
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
        expect(messages([...ts.getPreEmitDiagnostics(program), ...result.diagnostics])).toEqual([]);
        expect(reachable(join(installed, "dist"), "index.d.ts").filter(internal)).toEqual([]);
    }, 60_000);
});
