// © 2026 Adobe. MIT License. See /LICENSE for details.
import ts from "typescript";
import type { Diagnostic } from "../compile/diagnostic.js";
import type { Source } from "../compile/messages.js";
import type { Part, QuickInfo } from "./messages.js";
import { packages } from "virtual:guide-packages";

/**
 * TypeScript's checks of examples: a language service over a chapter's files, with each package's declarations from its
 * build, the standard library's and WebGPU's, all read as the guide builds.
 * Each check updates only the files that changed, so the program is built again incrementally.
 */

const libraries: { readonly [path: string]: string } = import.meta.glob(["../../node_modules/typescript/lib/lib.es*.d.ts", "../../node_modules/typescript/lib/lib.dom*.d.ts", "../../node_modules/typescript/lib/lib.decorators*.d.ts"], { query: "?raw", import: "default", eager: true });
const webgpu: { readonly [path: string]: string } = import.meta.glob("../../node_modules/@webgpu/types/dist/index.d.ts", { query: "?raw", import: "default", eager: true });

/** Where a package's examples are: their own package re-exports the package from its root, as `../index.js` imports it. */
const examplesFolderOf = (name: string): string => `/guides/${name}/src/guide`;

const files = new Map<string, string>([
    ...Object.entries(libraries).map(([path, text]): [string, string] => [`/node_modules/typescript/lib/${path.slice(path.lastIndexOf("/") + 1)}`, text]),
    ...packages.flatMap(({ name, declarations }) => [
        ...declarations.map(([path, text]): [string, string] => [`/node_modules/${name}/${path}`, text]),
        [`/guides/${name}/package.json`, JSON.stringify({ name: "guide", type: "module" })] as const,
        [`/guides/${name}/src/index.ts`, `export * from ${JSON.stringify(name)};\n`] as const,
    ]),
    ...Object.values(webgpu).map((text): [string, string] => ["/node_modules/@webgpu/types/dist/index.d.ts", text]),
    ["/node_modules/@webgpu/types/package.json", JSON.stringify({ name: "@webgpu/types", types: "dist/index.d.ts" })],
]);

/** The options the samples check with, resolving as a bundler does. */
const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2024.d.ts", "lib.esnext.disposable.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], types: ["@webgpu/types"],
    strict: true, skipLibCheck: true, isolatedModules: true, noFallthroughCasesInSwitch: true, allowImportingTsExtensions: true, noEmit: true,
};

const diagnosticOf = (name: string, source: ts.SourceFile | undefined, diagnostic: ts.Diagnostic): Diagnostic => {
    const start = diagnostic.start === undefined || source === undefined ? null : source.getLineAndCharacterOfPosition(diagnostic.start);
    return {
        kind: "typescript", severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning", file: name,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        line: start === null ? null : start.line + 1, column: start === null ? null : start.character + 1, length: diagnostic.length ?? null,
    };
};

const partsOf = (parts: readonly ts.SymbolDisplayPart[] | undefined): readonly Part[] => (parts ?? []).map(part => ({ text: part.text, kind: part.kind }));

/**
 * TypeScript's language service over examples of a package, `owner`, by their names, kept between requests: `check`
 * gives each file's diagnostics, and `info` what's at a place in one, each of the files as given.
 */
export type Service = {
    readonly check: (owner: string, sources: readonly Source[]) => readonly Diagnostic[];
    readonly info: (owner: string, sources: readonly Source[], name: string, position: number) => QuickInfo | null;
};

/** Checks examples, by their names, giving TypeScript's diagnostics for each, in one language service kept between checks. */
export const createCheck = (): Service["check"] => createService().check;

export const createService = (): Service => {
    const versions = new Map<string, number>();
    let roots: readonly string[] = [];
    const service = ts.createLanguageService({
        getCompilationSettings: () => options,
        getScriptFileNames: () => [...roots],
        getScriptVersion: file => String(versions.get(file) ?? 0),
        getScriptSnapshot: file => {
            const text = files.get(file);
            return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
        },
        getCurrentDirectory: () => "/guides",
        getDefaultLibFileName: () => "/node_modules/typescript/lib/lib.d.ts",
        fileExists: file => files.has(file),
        readFile: file => files.get(file),
        directoryExists: directory => [...files.keys()].some(file => file.startsWith(`${directory}/`)),
        getDirectories: () => [],
    }, ts.createDocumentRegistry());
    /** Makes the files the service reads those given, each changed one a new version. */
    const take = (owner: string, sources: readonly Source[]): void => {
        const folder = examplesFolderOf(owner);
        roots = sources.map(source => `${folder}/${source.name}`);
        for (const { name, code } of sources) {
            const file = `${folder}/${name}`;
            if (files.get(file) === code) continue;
            files.set(file, code);
            versions.set(file, (versions.get(file) ?? 0) + 1);
        }
    };
    const info: Service["info"] = (owner, sources, name, position) => {
        take(owner, sources);
        const found = service.getQuickInfoAtPosition(`${examplesFolderOf(owner)}/${name}`, position);
        if (found === undefined) return null;
        return {
            start: found.textSpan.start, length: found.textSpan.length, display: partsOf(found.displayParts), documentation: partsOf(found.documentation),
            tags: (found.tags ?? []).map(tag => ({ name: tag.name, text: partsOf(tag.text) })),
        };
    };
    const check: Service["check"] = (owner, sources) => {
        take(owner, sources);
        return sources.flatMap(({ name }) => {
            const file = `${examplesFolderOf(owner)}/${name}`;
            const source = service.getProgram()?.getSourceFile(file);
            return [...service.getSyntacticDiagnostics(file), ...service.getSemanticDiagnostics(file)].map(diagnostic => diagnosticOf(name, source, diagnostic));
        });
    };
    return { check, info };
};
