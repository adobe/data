// © 2026 Adobe. MIT License. See /LICENSE for details.
import { instantiate as instantiateParser } from "@oxc-parser/binding-wasm32-wasip1/workerd";
import parserUrl from "@oxc-parser/binding-wasm32-wasip1/wasm?url";
import { instantiate as instantiateTransformer } from "@oxc-transform/binding-wasm32-wasip1/workerd";
import transformerUrl from "@oxc-transform/binding-wasm32-wasip1/wasm?url";
// The guide's reach into the package's internals: the compiler's core, run from files in memory (README.md).
import { createMemoryCompiler, type MemoryCompiler } from "../../../ecs/src/implementation/compiler/memory-compiler.js";
import { oxcParse, oxcStrip } from "../../../ecs/src/implementation/compiler/oxc.js";
import { compileRun } from "../compile/compile-run.js";
import { protect } from "../compile/protect.js";
import { latest } from "../compile/latest.js";
import { compileRequestOf, type CompileReply, type CompileRequest } from "../compile/messages.js";
import { packageFiles } from "../compile/package-files.js";
import { packageRoot, runsCache } from "../compile/run-files.js";

/**
 * The compiler's worker, as `compiler.ts` loads it: compiles each run's modules as `Compiler.plugin()` does, with oxc's WASM parser, and puts
 * each run that compiles in the cache the guide's service worker serves its frame from. It compiles one run at a
 * time, the newest asked for: a request waiting when a later one arrives is answered as superseded. What fails, the
 * compiler's loading included, is answered as a failure, and loading is tried again for the next request.
 */

/**
 * Loads once what loading gives, and again after it fails. Each binding instantiates once per thread, so the parser and
 * the transformer each load on their own: one that loaded isn't loaded again because the other failed.
 */
const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
    let loading: Promise<T> | null = null;
    return () => loading ??= load().catch((error: unknown) => {
        loading = null;
        throw error;
    });
};
const parserOf = once(() => WebAssembly.compileStreaming(fetch(parserUrl)).then(instantiateParser));
const transformerOf = once(() => WebAssembly.compileStreaming(fetch(transformerUrl)).then(instantiateTransformer));
const load = once(async (): Promise<{ readonly compiler: MemoryCompiler; readonly guard: (code: string) => string }> => {
    const [parser, transformer] = await Promise.all([parserOf(), transformerOf()]);
    const parse = oxcParse(parser);
    return {
        compiler: createMemoryCompiler({ files: packageFiles, packageRoot, parse, strip: oxcStrip(transformer) }),
        guard: code => protect(code, source => parse(source, { lang: "js" })),
    };
});

/** The urls each run put in the cache, so a run's files go once a later run's are in. */
const written = new Map<number, readonly string[]>();

const reply = (message: CompileReply): void => postMessage(message);

/** How long a step in Cache Storage may take before the compile fails, saying which step didn't finish. */
const cacheLimit = 10_000;

/** `promise`, or a rejection naming `what` once it has taken longer than `cacheLimit`. */
const within = <T>(what: string, promise: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} didn't finish within ${cacheLimit / 1000} s`)), cacheLimit);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
};
const reasonOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
const failed = (request: CompileRequest, failure: string): CompileReply =>
    ({ kind: "compiled", run: request.run, diagnostics: [], page: null, systems: [], failure, superseded: false });

const compile = async (request: CompileRequest): Promise<CompileReply> => {
    let loaded: { readonly compiler: MemoryCompiler; readonly guard: (code: string) => string };
    try {
        loaded = await load();
    } catch (error) {
        return failed(request, `The compiler failed to load: ${reasonOf(error)}`);
    }
    try {
        const { diagnostics, files, systems } = await compileRun(loaded.compiler, request, loaded.guard);
        if (files === null) return { kind: "compiled", run: request.run, diagnostics, page: null, systems, failure: null, superseded: false };
        const folder = `${request.runs}${request.run}/`;
        const cache = await within("opening the cache of runs", caches.open(runsCache));
        await within("storing the run's files", Promise.all(files.map(file => cache.put(`${folder}${file.path}`, new Response(file.text, { headers: { "Content-Type": `${file.type}; charset=utf-8` } })))));
        written.set(request.run, files.map(file => `${folder}${file.path}`));
        for (const [run, urls] of written) {
            if (run >= request.run - 1) continue;
            written.delete(run);
            await within("deleting an earlier run's files", Promise.all(urls.map(url => cache.delete(url))));
        }
        return { kind: "compiled", run: request.run, diagnostics, page: `${folder}index.html`, systems, failure: null, superseded: false };
    } catch (error) {
        return failed(request, `The compiler failed: ${reasonOf(error)}`);
    }
};

const ask = latest<CompileRequest>(async request => reply(await compile(request)), request => reply({ ...failed(request, ""), failure: null, superseded: true }));

/** Takes a message the page posted (`serve.ts`). */
export const handle = (data: unknown): void => {
    const request = compileRequestOf(data);
    if (request !== null) ask(request);
};
