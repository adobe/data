// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SystemDescription } from "../../../ecs/src/implementation/compiler/memory-compiler.js";
import type { Diagnostic } from "./diagnostic.js";

/** An example's source, by its file's name beside the guide. */
export type Source = { readonly name: string; readonly code: string };

/** A package a run's frame imports: its name, and the names it exports, which its exports module re-exports. */
export type Exported = { readonly name: string; readonly names: readonly string[] };

/**
 * Compiles a run's modules, examples of `package`: on success puts its files in the cache under `runs`, the service
 * worker's folder of runs, its exports modules loading `runtime` and re-exporting each of `packages`' names from it;
 * with `runs` null, only compiles them.
 */
export type CompileRequest = {
    readonly kind: "compile"; readonly run: number; readonly package: string; readonly files: readonly Source[];
    readonly runs: string | null; readonly runtime: string; readonly packages: readonly Exported[];
};

/**
 * What each system of an example's file compiles to, by the file's name: located by its call's offsets, line and column
 * in the file's code as the request gave it.
 */
export type FileSystems = { readonly file: string; readonly systems: readonly SystemDescription[] };

/**
 * A run compiled: the build's diagnostics, its page, null when a module failed or it had no folder of runs, whether
 * every module compiled, and what each module that compiled compiles each system to. `failure` says why the compiler itself failed, null when it didn't; `superseded` is set for
 * a request a later one replaced before it was compiled.
 */
export type CompileReply = {
    readonly kind: "compiled"; readonly run: number; readonly diagnostics: readonly Diagnostic[]; readonly page: string | null;
    readonly compiled: boolean; readonly systems: readonly FileSystems[]; readonly failure: string | null; readonly superseded: boolean;
};

const backendKinds: ReadonlySet<unknown> = new Set(["compiled", "eligible", "registration", "none"]);
const isBackend = (value: unknown): boolean => typeof value === "object" && value !== null && backendKinds.has(Reflect.get(value, "kind"))
    && (typeof Reflect.get(value, "code") === "string" || typeof Reflect.get(value, "reason") === "string");
const isSystem = (value: unknown): value is SystemDescription => typeof value === "object" && value !== null
    && ["start", "end", "line", "column"].every(field => typeof Reflect.get(value, field) === "number")
    && typeof Reflect.get(value, "runs") === "string" && typeof Reflect.get(value, "kind") === "string"
    && ["js", "wasm", "wgsl"].every(field => isBackend(Reflect.get(value, field)));

/** Whether a value is what a reply says of each file's systems, as the page takes it from the compiler's worker. */
export const isFileSystems = (value: unknown): value is readonly FileSystems[] => Array.isArray(value) && value.every(item => {
    if (typeof item !== "object" || item === null || typeof Reflect.get(item, "file") !== "string") return false;
    const systems: unknown = Reflect.get(item, "systems");
    return Array.isArray(systems) && systems.every(isSystem);
});

const isStrings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const isSources = (value: unknown): value is readonly Source[] => Array.isArray(value)
    && value.every(item => typeof item === "object" && item !== null && typeof Reflect.get(item, "name") === "string" && typeof Reflect.get(item, "code") === "string");

const isExported = (value: unknown): value is readonly Exported[] => Array.isArray(value)
    && value.every(item => typeof item === "object" && item !== null && typeof Reflect.get(item, "name") === "string" && isStrings(Reflect.get(item, "names")));

export const compileRequestOf = (data: unknown): CompileRequest | null => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "kind") !== "compile") return null;
    const run: unknown = Reflect.get(data, "run");
    const owner: unknown = Reflect.get(data, "package");
    const files: unknown = Reflect.get(data, "files");
    const runs: unknown = Reflect.get(data, "runs");
    const runtime: unknown = Reflect.get(data, "runtime");
    const packages: unknown = Reflect.get(data, "packages");
    return typeof run === "number" && typeof owner === "string" && isSources(files) && (runs === null || typeof runs === "string") && typeof runtime === "string" && isExported(packages)
        ? { kind: "compile", run, package: owner, files, runs, runtime, packages } : null;
};
