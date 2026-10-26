// © 2026 Adobe. MIT License. See /LICENSE for details.

/** What a run's frame tells the guide's page, by `postMessage`, as its program runs. */

/** An error, as a message carries it. */
export type Described = { readonly name: string; readonly message: string; readonly stack: string };

/**
 * A line of a run's console: what it logged at a level, or an error nothing caught, `uncaught`, as a run of a world
 * left unawaited rejects.
 */
export type Entry = { readonly level: "log" | "info" | "warn" | "error" | "debug" | "uncaught"; readonly text: string };

export type RunMessage =
    /** Lines the console took since the last message. */
    | { readonly kind: "logs"; readonly run: number; readonly entries: readonly Entry[] }
    /** Something was put in the page's `#output`, for the first time. */
    | { readonly kind: "rendered"; readonly run: number }
    /** Every module loaded and each `main` resolved. */
    | { readonly kind: "finished"; readonly run: number }
    /** A module failed to load, or its `main` rejected, which the last line says. */
    | { readonly kind: "failed"; readonly run: number };

const levels: ReadonlySet<string> = new Set(["log", "info", "warn", "error", "debug", "uncaught"]);

const isEntries = (value: unknown): value is readonly Entry[] =>
    Array.isArray(value) && value.every(item => typeof item === "object" && item !== null && levels.has(String(Reflect.get(item, "level"))) && typeof Reflect.get(item, "text") === "string");

/** A message from a frame, checked, since any frame may post one; null for anything else. */
export const runMessageOf = (data: unknown): RunMessage | null => {
    if (typeof data !== "object" || data === null) return null;
    const run: unknown = Reflect.get(data, "run");
    if (typeof run !== "number") return null;
    switch (Reflect.get(data, "kind")) {
        case "logs": {
            const entries: unknown = Reflect.get(data, "entries");
            return isEntries(entries) ? { kind: "logs", run, entries } : null;
        }
        case "rendered": return { kind: "rendered", run };
        case "finished": return { kind: "finished", run };
        case "failed": return { kind: "failed", run };
        default: return null;
    }
};
