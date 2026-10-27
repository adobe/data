// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Diagnostic } from "../../compile/diagnostic.js";
import type { FileSystems } from "../../compile/messages.js";
import type { Entry } from "../../run/protocol.js";

/** TypeScript's diagnostics of a chapter's files, as of their last check. */
export const typeProblems = Symbol();
/** The ECS build's diagnostics of a chapter's files, as of their last compile. */
export const buildProblems = Symbol();
/** The run of a chapter's files the page shows: its number, 0 before the first, and its frame's page, null for none. */
export const run = Symbol();
export const page = Symbol();
/** Where a chapter's latest run is. */
export const runState = Symbol();
/** What a chapter's latest run logged. */
export const logged = Symbol();
/**
 * Which tab of the run's window a chapter shows, whether the reader picked it, and how many of its run's lines the
 * reader has seen there.
 */
export const tab = Symbol();
export const tabPicked = Symbol();
export const consoleSeen = Symbol();
/**
 * What each system of a chapter's files compiles to, as its last build that compiled said, and whether an edit since
 * failed to compile; and the system the reader last opened in the Compiled tab.
 */
export const described = Symbol();
export const systemOpened = Symbol();

export type RunState = "waiting" | "compiling" | "running" | "finished" | "failed" | "rejected" | "compiled" | "unavailable" | "retrying";

export type Tab = "console" | "output" | "problems" | "compiled";

export type Described = { readonly systems: readonly FileSystems[]; readonly stale: boolean };
export const nothingDescribed: Described = { systems: [], stale: false };

/** A system to open in the Compiled tab, by its file and its call's start, once for each `serial`. */
export type SystemOpened = { readonly file: string; readonly start: number; readonly serial: number };

/** A run's console: its latest lines, at most `keptLines`, and how many came before them. */
export type Logged = { readonly entries: readonly Entry[]; readonly dropped: number };

/** How many of a run's lines its console keeps. */
export const keptLines = 1000;

export const nothingLogged: Logged = { entries: [], dropped: 0 };

// Values holding objects live on the thread that shows them, as the elements they're written to do.
declare module "@adobe/ecs" {
    interface Components {
        [typeProblems]: { type: readonly Diagnostic[]; thread: "main" };
        [buildProblems]: { type: readonly Diagnostic[]; thread: "main" };
        [run]: { type: number };
        [page]: { type: string | null };
        [runState]: { type: RunState; default: "waiting" };
        [logged]: { type: Logged; thread: "main" };
        [tab]: { type: Tab; default: "console" };
        [tabPicked]: { type: boolean };
        [consoleSeen]: { type: number };
        [described]: { type: Described; thread: "main" };
        [systemOpened]: { type: SystemOpened | null; thread: "main" };
    }
}

export const Build = [typeProblems, buildProblems, run, page, runState, logged, tab, tabPicked, consoleSeen, described, systemOpened] as const;

/** How many lines a run has logged. */
export const linesOf = (log: Logged): number => log.dropped + log.entries.length;

/** `logged` with `entries` after it, keeping the latest `keptLines`. */
export const appended = (current: Logged, entries: readonly Entry[]): Logged => {
    const all = [...current.entries, ...entries];
    const excess = Math.max(all.length - keptLines, 0);
    return { entries: excess === 0 ? all : all.slice(excess), dropped: current.dropped + excess };
};
