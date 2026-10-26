// © 2026 Adobe. MIT License. See /LICENSE for details.
import { formatLine, formatTable, inspect } from "./inspect.js";
import type { Entry, RunMessage } from "./protocol.js";

/**
 * A run's program: `start` loads its modules, then runs each one's `main`, telling the page what its console takes as it
 * logs, and whether it finished or failed.
 */

export const describeError = (error: unknown): string => error instanceof Error ? `${error.name}: ${error.message}` : formatLine([error]);

/** Whether a module is a chapter's type test, which has no `main`. */
export const isTypeTest = (name: string): boolean => name.endsWith(".type-test.ts");

/** Whether a console call comes from the dev server's client, which loads in a run's frame served from it. */
export const fromDevServer = (stack: string): boolean => /\/@vite\/client\b/.test(stack);

/** A line the console took at `level`, as the guide shows it. */
export const entryOf = (level: Entry["level"], values: readonly unknown[]): Entry => ({ level, text: formatLine(values) });

/** What a run's console is captured from: its frame's console and global scope, or another for a test. */
export type ConsoleScope = {
    readonly console: Console;
    readonly addEventListener: (type: "error" | "unhandledrejection", listener: (event: Event) => void) => void;
};

/**
 * Takes what the console writes, as node's console writes it, and errors nothing caught, as entries, still writing them
 * to the frame's console, and gives each turn's entries to `flush` together, once the turn's microtasks have run.
 */
export const captureConsole = (flush: (entries: readonly Entry[]) => void, scope: ConsoleScope = globalThis): (() => void) => {
    const { console } = scope;
    let pending: Entry[] = [];
    const take = (): void => {
        if (pending.length === 0) return;
        const entries = pending;
        pending = [];
        flush(entries);
    };
    const add = (entry: Entry): void => {
        if (fromDevServer(new Error().stack ?? "")) return;
        if (pending.length === 0) queueMicrotask(take);
        pending.push(entry);
    };
    /** Replaces one of the console's methods, keeping what it did. */
    const wrap = (name: "log" | "info" | "warn" | "error" | "debug" | "dir" | "table" | "assert" | "trace" | "count" | "countReset", entry: (...values: unknown[]) => Entry | null): void => {
        const original: unknown = Reflect.get(console, name);
        Reflect.set(console, name, (...values: unknown[]) => {
            const taken = entry(...values);
            if (taken !== null) add(taken);
            if (typeof original === "function") Reflect.apply(original, console, values);
        });
    };
    for (const level of ["log", "info", "warn", "error", "debug"] as const) wrap(level, (...values) => entryOf(level, values));
    wrap("dir", value => ({ level: "log", text: inspect(value) }));
    wrap("table", (data, only) => ({ level: "log", text: formatTable(data, Array.isArray(only) ? only.map(String) : undefined) }));
    wrap("assert", (condition, ...values) => condition ? null : { level: "error", text: values.length === 0 ? "Assertion failed" : `Assertion failed${typeof values[0] === "string" ? ": " : " "}${formatLine(values)}` });
    wrap("trace", (...values) => {
        const frames = (new Error().stack ?? "").split("\n").filter(line => line.trim().startsWith("at ")).slice(2);
        return { level: "log", text: [`Trace${values.length === 0 ? "" : `: ${formatLine(values)}`}`, ...frames].join("\n") };
    });
    const counts = new Map<string, number>();
    wrap("count", label => {
        const name = label === undefined ? "default" : String(label);
        const count = (counts.get(name) ?? 0) + 1;
        counts.set(name, count);
        return { level: "log", text: `${name}: ${count}` };
    });
    wrap("countReset", label => {
        counts.delete(label === undefined ? "default" : String(label));
        return null;
    });
    scope.addEventListener("error", event => add({ level: "uncaught", text: `Uncaught ${describeError(Reflect.get(event, "error") ?? Reflect.get(event, "message"))}` }));
    scope.addEventListener("unhandledrejection", event => add({ level: "uncaught", text: `Uncaught (in promise) ${describeError(Reflect.get(event, "reason"))}` }));
    return take;
};

/** Calls `rendered` once something is first put in `output`. */
export const watchOutput = (output: Element, rendered: () => void): void => {
    const observer = new MutationObserver(() => {
        observer.disconnect();
        rendered();
    });
    observer.observe(output, { childList: true });
};

/**
 * Loads a run's modules, relative to its frame's page, then awaits each one's `main`, telling the page that framed it
 * what's logged, when it first renders into `#output`, and how it ended: a module that fails to load or a `main` that
 * rejects fails the run, its error the last line.
 */
export const start = async (run: number, modules: readonly string[]): Promise<void> => {
    const post = (message: RunMessage): void => parent.postMessage(message, location.origin);
    const take = captureConsole(entries => post({ kind: "logs", run, entries }));
    const output = document.querySelector("#output");
    if (output !== null) watchOutput(output, () => post({ kind: "rendered", run }));
    const fail = (error: unknown): void => {
        take();
        post({ kind: "logs", run, entries: [{ level: "uncaught", text: `Uncaught ${describeError(error)}` }] });
        post({ kind: "failed", run });
    };
    const loaded: { readonly name: string; readonly module: unknown }[] = [];
    for (const module of modules) {
        try {
            loaded.push({ name: module.slice(module.lastIndexOf("/") + 1), module: await import(/* @vite-ignore */ new URL(module, location.href).href) });
        } catch (error) {
            return fail(error);
        }
    }
    for (const { name, module } of loaded) {
        const main: unknown = Reflect.get(Object(module), "main");
        // A type test shows what TypeScript reports, and runs nothing; any other example is a program.
        if (typeof main !== "function") {
            if (isTypeTest(name)) continue;
            return fail(new Error(`${name} exports no main, which runs it`));
        }
        try {
            const done: unknown = Reflect.apply(main, undefined, []);
            await done;
        } catch (error) {
            return fail(error);
        }
    }
    take();
    post({ kind: "finished", run });
};
