// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import { createChecker } from "../../check/checker.js";
import type { Diagnostic } from "../../compile/diagnostic.js";
import type { QuickInfo } from "../../check/messages.js";
import type { FileSystems, Source } from "../../compile/messages.js";
import { createRuns } from "../../compile/runs.js";

/**
 * The guide's builds: TypeScript's checks and the ECS build's compiles of each chapter's files, off the main thread.
 * A request names the chapter and its files' revision; checks and compiles start once the files stop changing, a
 * chapter's first at once, and each result is dispatched on the page's root, as `guide-checked` and `guide-compiled`:
 * a failure of TypeScript or the compiler themselves among them, as a problem, and they're tried again on the next.
 */
export type Builds = {
    readonly request: (chapter: Entity, revision: number, files: readonly Source[]) => void;
    /**
     * What TypeScript says is at `position` in a chapter's file, with `code` its text as it is now, the chapter's other
     * files as last requested; null for nothing, or a request a newer one replaced.
     */
    readonly info: (chapter: Entity, file: string, code: string, position: number) => Promise<QuickInfo | null>;
};

export type BuildEvents = {
    readonly "guide-checked": CustomEvent<{ readonly chapter: Entity; readonly revision: number; readonly diagnostics: readonly Diagnostic[] }>;
    readonly "guide-retrying": CustomEvent<{ readonly chapter: Entity; readonly revision: number; readonly reason: string }>;
    readonly "guide-compiled": CustomEvent<{
        readonly chapter: Entity; readonly revision: number; readonly run: number; readonly diagnostics: readonly Diagnostic[]; readonly page: string | null;
        readonly systems: readonly FileSystems[]; readonly failed: boolean;
    }>;
};

/** How long files stay unchanged before each is checked and compiled, in milliseconds. */
export const quiet = { check: 150, compile: 350 };

/** A failure of TypeScript or the compiler themselves, as a problem of the chapter's, at no place in its files. */
const problemOf = (kind: Diagnostic["kind"], message: string): Diagnostic => ({ kind, severity: "error", file: "", message, line: null, column: null, length: null });

export const createBuilds = (root: HTMLElement): Builds => {
    const checker = createChecker();
    const runs = createRuns();
    const built = new Set<Entity>();
    /** Each chapter's files as last requested, which a request for what's at a place reads the others of. */
    const requested = new Map<Entity, readonly Source[]>();
    const timers = new Map<Entity, { check: ReturnType<typeof setTimeout>; compile: ReturnType<typeof setTimeout> }>();
    const send = <K extends keyof BuildEvents>(type: K, detail: BuildEvents[K]["detail"]): void => {
        root.dispatchEvent(new CustomEvent(type, { detail }));
    };
    return {
        info: (chapter, file, code, position) => {
            const files = requested.get(chapter) ?? [];
            const current = files.some(source => source.name === file) ? files.map(source => source.name === file ? { name: file, code } : source) : [...files, { name: file, code }];
            return checker.info(current, file, position);
        },
        request: (chapter, revision, files) => {
            requested.set(chapter, files);
            const pending = timers.get(chapter);
            if (pending !== undefined) {
                clearTimeout(pending.check);
                clearTimeout(pending.compile);
            }
            const first = !built.has(chapter);
            built.add(chapter);
            const check = setTimeout(() => void checker.check(files).then(({ diagnostics, failure }) =>
                send("guide-checked", { chapter, revision, diagnostics: failure === null ? diagnostics : [problemOf("typescript", failure)] })), first ? 0 : quiet.check);
            const compile = setTimeout(() => {
                timers.delete(chapter);
                void runs.compile(files, reason => send("guide-retrying", { chapter, revision, reason })).then(({ run, diagnostics, page, systems, failure, superseded }) => {
                    // A request a later one replaced is that one's to answer.
                    if (superseded) return;
                    send("guide-compiled", { chapter, revision, run, page, systems, diagnostics: failure === null ? diagnostics : [problemOf("build", failure)], failed: failure !== null });
                });
            }, first ? 0 : quiet.compile);
            timers.set(chapter, { check, compile });
        },
    };
};

declare global {
    interface HTMLElementEventMap extends BuildEvents {}
}
