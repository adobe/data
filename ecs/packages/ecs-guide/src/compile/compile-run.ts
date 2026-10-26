// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MemoryCompiler } from "../../../ecs/src/implementation/compiler/memory-compiler.js";
import type { FileSystems } from "./messages.js";
import type { Diagnostic } from "./diagnostic.js";
import type { CompileRequest } from "./messages.js";
// The plugin's own inlining of kernels for node, which the guide does in the browser too (README.md).
import { inlineKernels, inlinePlaceholder } from "../../../ecs/src/implementation/compiler/inline-kernels.js";
import { examplesFolder, runFiles, type RunFile } from "./run-files.js";

/**
 * A run compiled: the build's diagnostics, its files, null when a module failed, and what each system of each module
 * that compiled compiles to.
 */
export type CompiledRun = { readonly diagnostics: readonly Diagnostic[]; readonly files: readonly RunFile[] | null; readonly systems: readonly FileSystems[] };

/**
 * Compiles a run's modules as the plugin does, each kernel inlined as a `data:` url, describing each system, and each
 * module's own code, the build's output and never its input or its kernels, given loop protection by `guard`
 * (`protect.ts`).
 */
export const compileRun = async (compiler: MemoryCompiler, request: CompileRequest, guard: (code: string) => string): Promise<CompiledRun> => {
    const diagnostics: Diagnostic[] = [];
    const compiled: { readonly path: string; readonly code: string }[] = [];
    const systems: FileSystems[] = [];
    for (const { name, code } of request.files) {
        const path = `${examplesFolder}/${name}`;
        const result = await compiler.compile(path, code, index => JSON.stringify(inlinePlaceholder(index, "")), { describe: true });
        if ("failure" in result) {
            diagnostics.push({ kind: "build", severity: "error", file: name, message: result.failure, line: result.location?.line ?? null, column: result.location?.column ?? null, length: null });
            continue;
        }
        for (const warning of result.warnings) diagnostics.push({ kind: "build", severity: "warning", file: name, message: warning, line: null, column: null, length: null });
        compiled.push({ path, code: inlineKernels(guard(result.code), result.kernels, []) });
        systems.push({ file: name, systems: result.systems ?? [] });
    }
    return { diagnostics, files: compiled.length < request.files.length ? null : runFiles(request.run, request.runtime, request.names, compiled), systems };
};
