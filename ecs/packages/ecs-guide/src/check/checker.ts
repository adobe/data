// © 2026 Adobe. MIT License. See /LICENSE for details.
import { isDiagnostic, type Diagnostic } from "../compile/diagnostic.js";
import type { Source } from "../compile/messages.js";
import { latestAnswer } from "../compile/latest.js";
import { createWorkerClient } from "../shared/worker-client.js";
import { isQuickInfo, type CheckReply, type CheckRequest, type InfoReply, type InfoRequest, type QuickInfo } from "./messages.js";

/**
 * Checks examples with TypeScript, off the main thread, in one language service kept across checks. It never rejects:
 * `failure` says why TypeScript itself failed, after its worker has been started again a few times, and the next
 * check tries again.
 */
export type Checker = {
    readonly check: (owner: string, files: readonly Source[]) => Promise<{ readonly diagnostics: readonly Diagnostic[]; readonly failure: string | null }>;
    /**
     * What's at `position` in the file named, of `files` as they are now, examples of `owner`, or null: one asked at a
     * time, and only the newest answered, a reply to one asked before another dropped.
     */
    readonly info: (owner: string, files: readonly Source[], file: string, position: number) => Promise<QuickInfo | null>;
};

const infoReplyOf = (data: unknown): InfoReply | null => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "kind") !== "info") return null;
    const serial: unknown = Reflect.get(data, "serial");
    const info: unknown = Reflect.get(data, "info");
    const failure: unknown = Reflect.get(data, "failure");
    return typeof serial === "number" && (info === null || isQuickInfo(info)) && (failure === null || typeof failure === "string") ? { kind: "info", serial, info, failure } : null;
};

const replyOf = (data: unknown): CheckReply | null => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "kind") !== "checked") return null;
    const version: unknown = Reflect.get(data, "version");
    const diagnostics: unknown = Reflect.get(data, "diagnostics");
    const failure: unknown = Reflect.get(data, "failure");
    return typeof version === "number" && Array.isArray(diagnostics) && diagnostics.every(isDiagnostic) && (failure === null || typeof failure === "string")
        ? { kind: "checked", version, diagnostics, failure } : null;
};

export const createChecker = (): Checker => {
    let next = 1;
    const waiting = new Map<number, { readonly request: CheckRequest; readonly resolve: (reply: CheckReply) => void }>();
    let serial = 0;
    const asking = new Map<number, { readonly request: InfoRequest; readonly resolve: (info: QuickInfo | null) => void }>();
    const worker = createWorkerClient("TypeScript's worker", () => new Worker(new URL("../workers/typescript.ts", import.meta.url), { type: "module" }), {
        message: data => {
            const answered = infoReplyOf(data);
            if (answered !== null) {
                asking.get(answered.serial)?.resolve(answered.info);
                asking.delete(answered.serial);
                return;
            }
            const reply = replyOf(data);
            if (reply === null) return;
            waiting.get(reply.version)?.resolve(reply);
            waiting.delete(reply.version);
        },
        retrying: () => {},
        restarted: () => {
            for (const { request } of waiting.values()) worker.post(request);
            for (const { request } of asking.values()) worker.post(request);
        },
        failed: reason => {
            for (const [version, { resolve }] of waiting) resolve({ kind: "checked", version, diagnostics: [], failure: `TypeScript failed to load: ${reason}` });
            waiting.clear();
            for (const { resolve } of asking.values()) resolve(null);
            asking.clear();
        },
    });
    const info = latestAnswer<{ readonly owner: string; readonly files: readonly Source[]; readonly file: string; readonly position: number }, QuickInfo | null>(({ owner, files, file, position }) => {
        const request: InfoRequest = { kind: "info", serial: ++serial, owner, files, file, position };
        return new Promise(resolve => {
            asking.set(request.serial, { request, resolve });
            worker.post(request);
        });
    }, null);
    return {
        check: async (owner, files) => {
            const request: CheckRequest = { kind: "check", version: next++, owner, files };
            const reply = await new Promise<CheckReply>(resolve => {
                waiting.set(request.version, { request, resolve });
                worker.post(request);
            });
            return { diagnostics: reply.diagnostics, failure: reply.failure };
        },
        info: (owner, files, file, position) => info({ owner, files, file, position }),
    };
};
