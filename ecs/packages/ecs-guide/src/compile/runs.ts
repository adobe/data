// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as ecs from "@adobe/ecs";
import runtimeUrl from "../run/runtime.ts?worker&url";
import { runtimeNames } from "../run/runtime-key.js";
import serviceWorkerUrl from "../service-worker.ts?worker&url";
import { isDiagnostic, type Diagnostic } from "./diagnostic.js";
import { isFileSystems, type CompileReply, type CompileRequest, type FileSystems, type Source } from "./messages.js";
import { createWorkerClient } from "../shared/worker-client.js";
import { runsFolder } from "./run-files.js";

/**
 * A run compiled: its number, the build's diagnostics, its frame's page, null when it failed to compile or this host
 * can't run it, whether it compiled, and what each file that compiled compiles each system to; `failure` says why the compiler itself failed, and `superseded` that a
 * later request replaced it before it compiled.
 */
export type Compiled = {
    readonly run: number; readonly diagnostics: readonly Diagnostic[]; readonly page: string | null; readonly compiled: boolean;
    readonly systems: readonly FileSystems[]; readonly failure: string | null; readonly superseded: boolean;
};

/**
 * Compiles runs of examples off the main thread, for frames the service worker serves them to, or only compiles them
 * where the service worker can't register. Never rejects;
 * `retrying` hears when the compiler's worker failed and is starting again.
 */
export type Runs = { readonly compile: (files: readonly Source[], retrying?: (reason: string) => void) => Promise<Compiled> };

const replyOf = (data: unknown): CompileReply | null => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "kind") !== "compiled") return null;
    const run: unknown = Reflect.get(data, "run");
    const diagnostics: unknown = Reflect.get(data, "diagnostics");
    const page: unknown = Reflect.get(data, "page");
    const compiled: unknown = Reflect.get(data, "compiled");
    const failure: unknown = Reflect.get(data, "failure");
    const superseded: unknown = Reflect.get(data, "superseded");
    const systems: unknown = Reflect.get(data, "systems");
    return typeof run === "number" && Array.isArray(diagnostics) && diagnostics.every(isDiagnostic) && (page === null || typeof page === "string")
        && typeof compiled === "boolean" && isFileSystems(systems) && (failure === null || typeof failure === "string") && typeof superseded === "boolean"
        ? { kind: "compiled", run, diagnostics, page, compiled, systems, failure, superseded } : null;
};

const reasonOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Waits for a service worker to be active. */
const activated = (worker: ServiceWorker): Promise<void> => new Promise(resolve => {
    const changed = (): void => {
        if (worker.state !== "activated") return;
        worker.removeEventListener("statechange", changed);
        resolve();
    };
    worker.addEventListener("statechange", changed);
    changed();
});

/**
 * This page's folder of runs, once the service worker serving them is active and has taken the folder as this page's,
 * which drops the folders of pages that are gone: `runsFolder` in its scope, then the page's own random name.
 */
const registered = async (): Promise<string> => {
    const url = new URL(serviceWorkerUrl, location.href);
    const registration = await navigator.serviceWorker.register(url, { type: "module", scope: new URL("./", url).href });
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (worker === null) throw new Error("the service worker didn't install");
    await activated(worker);
    const folder = crypto.randomUUID();
    const channel = new MessageChannel();
    const adopted = new Promise<unknown>(resolve => channel.port1.addEventListener("message", event => resolve(event.data), { once: true }));
    channel.port1.start();
    worker.postMessage({ folder }, [channel.port2]);
    const answer = await adopted;
    if (typeof answer !== "object" || answer === null || Reflect.get(answer, "adopted") !== true) throw new Error(`the service worker didn't take this page's runs: ${String(Reflect.get(Object(answer), "reason"))}`);
    return `${new URL(runsFolder, registration.scope).href}${folder}/`;
};

export const createRuns = (): Runs => {
    let runs: Promise<string | null> | null = null;
    let next = 1;
    const waiting = new Map<number, { readonly request: CompileRequest; readonly resolve: (reply: CompileReply) => void; readonly retrying: (reason: string) => void }>();
    const worker = createWorkerClient("the compiler's worker", () => new Worker(new URL("../workers/compiler.ts", import.meta.url), { type: "module" }), {
        message: data => {
            const reply = replyOf(data);
            if (reply === null) return;
            waiting.get(reply.run)?.resolve(reply);
            waiting.delete(reply.run);
        },
        retrying: reason => {
            for (const { retrying } of waiting.values()) retrying(reason);
        },
        restarted: () => {
            for (const { request } of waiting.values()) worker.post(request);
        },
        failed: reason => {
            for (const [run, { resolve }] of waiting) resolve({ kind: "compiled", run, diagnostics: [], page: null, compiled: false, systems: [], failure: `The compiler failed to load: ${reason}`, superseded: false });
            waiting.clear();
        },
    });
    return {
        compile: async (files, retrying = () => {}) => {
            const run = next++;
            const folder = await (runs ??= registered().catch((error: unknown) => {
                console.warn(`The guide can't run examples on this host: its service worker didn't register (${reasonOf(error)})`);
                return null;
            }));
            const request: CompileRequest = { kind: "compile", run, files, runs: folder, runtime: new URL(runtimeUrl, location.href).href, names: [...Object.keys(ecs), ...runtimeNames] };
            const reply = await new Promise<CompileReply>(resolve => {
                waiting.set(run, { request, resolve, retrying });
                worker.post(request);
            });
            return { run, diagnostics: reply.diagnostics, page: reply.page, compiled: reply.compiled, systems: reply.systems, failure: reply.failure, superseded: reply.superseded };
        },
    };
};
