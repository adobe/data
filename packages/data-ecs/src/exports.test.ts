import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "data-ecs-exports-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

const messages = (diagnostics: readonly ts.Diagnostic[]): string[] =>
    diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

/** Emits the package's declarations into node_modules, as a consumer installs it. */
const install = (): void => {
    const installed = join(temporary, "node_modules", "@adobe", "data-ecs");
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
export const world = World.create();
export const read = (entity: Parameters<World["read"]["entity"]>[0]) => world.read.entity(entity, [position]);
export const device = world.read.resource(gpuDevice);
export const query = world.query;
`;

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
    }, 60_000);
});
