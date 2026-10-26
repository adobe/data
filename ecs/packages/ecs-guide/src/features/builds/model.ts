// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import type { Diagnostic } from "../../compile/diagnostic.js";
import type { RunMessage } from "../../run/protocol.js";
import { chapter, shown } from "../chapters/data.js";
import { revision, sources } from "../examples/data.js";
import { reviseShown } from "../examples/model.js";
import type { FileSystems } from "../../compile/messages.js";
import { appended, Build, buildProblems, consoleSeen, described, linesOf, logged, nothingDescribed, nothingLogged, page, run, runState, systemOpened, tab, tabPicked, typeProblems, type Tab } from "./data.js";

/** Gives each chapter with examples what its builds leave: nothing checked, compiled or run yet. */
export const addBuilds = System.create({
    components: { with: [chapter, revision], not: [run] },
}, (row, { commands }) => {
    commands.add(row.entity, Build, { [typeProblems]: [], [buildProblems]: [], [run]: 0, [page]: null, [runState]: "waiting", [logged]: nothingLogged, [tab]: "console", [tabPicked]: false, [consoleSeen]: 0, [described]: nothingDescribed, [systemOpened]: null });
});

/**
 * A chapter no longer shown forgets its last run, so showing it again frames nothing until its new revision compiles,
 * and its program's effects happen once per revision.
 */
export const forgetHiddenRun = System.create({
    components: { with: [run, page, logged, consoleSeen], not: [shown] },
}, row => {
    if (row[page] === null && row[run] === 0) return;
    row[run] = 0;
    row[page] = null;
    row[logged] = nothingLogged;
    row[consoleSeen] = 0;
});

/** A chapter whose files were revised compiles again. */
export const compileRevised = System.create({
    components: { with: [revision, sources, runState], changed: [revision] },
    after: [reviseShown],
}, row => {
    if (row[revision] > 0 && row[sources].length > 0) row[runState] = "compiling";
});

/** The result of a chapter's files' revision, as a check or a compile of it gives it back. */
type Result = { readonly chapter: Entity; readonly revision: number; readonly diagnostics: readonly Diagnostic[] };

/** The compiler's worker failed as the chapter's latest revision compiled, and starts again. */
export const receiveRetrying = System.create({
    target: "chapter",
    components: { with: [revision, runState] },
}, (row, _context, input: { readonly chapter: Entity; readonly revision: number }) => {
    if (input.revision === row[revision] && (row[runState] === "waiting" || row[runState] === "compiling")) row[runState] = "retrying";
});

/** Takes TypeScript's diagnostics of the chapter's latest revision. */
export const receiveChecked = System.create({
    target: "chapter",
    components: { with: [revision, typeProblems] },
}, (row, _context, input: Result) => {
    if (input.revision === row[revision]) row[typeProblems] = input.diagnostics;
});

/**
 * Takes the build's diagnostics of the chapter's latest revision, the run it compiled to and what its systems compile
 * to: no run when it failed, or when the compiler itself did, which `failed` says, and then the systems of the last
 * build that compiled, marked stale.
 */
export const receiveCompiled = System.create({
    target: "chapter",
    components: { with: [revision, buildProblems, run, page, runState, logged, consoleSeen, described] },
}, (row, _context, input: Result & { readonly run: number; readonly page: string | null; readonly systems: readonly FileSystems[]; readonly failed: boolean }) => {
    if (input.revision !== row[revision]) return;
    const last = row[described];
    row[described] = input.page !== null ? { systems: input.systems, stale: false } : last.systems.length === 0 || last.stale ? last : { systems: last.systems, stale: true };
    row[buildProblems] = input.diagnostics;
    row[run] = input.run;
    row[page] = input.page;
    row[runState] = input.failed ? "unavailable" : input.page === null ? "rejected" : "running";
    row[logged] = nothingLogged;
    row[consoleSeen] = 0;
});

/**
 * Takes what the frame of a chapter's latest run tells: what it logged, whether it rendered, which shows its Output
 * unless the reader picked a tab, and how it ended. An error nothing caught fails it, even while it goes on running,
 * as an animation does.
 */
export const receiveRun = System.create({
    components: { with: [run, runState, logged, tab, tabPicked, consoleSeen] },
}, (row, _context, input: { readonly message: RunMessage }) => {
    const { message } = input;
    if (message.run !== row[run]) return;
    switch (message.kind) {
        case "logs":
            row[logged] = appended(row[logged], message.entries);
            // Lines logged while the Console shows are seen.
            if (row[tab] === "console") row[consoleSeen] = linesOf(row[logged]);
            if (message.entries.some(entry => entry.level === "uncaught")) row[runState] = "failed";
            break;
        case "rendered":
            if (!row[tabPicked]) row[tab] = "output";
            break;
        case "finished":
            if (row[runState] === "running") row[runState] = "finished";
            break;
        case "failed":
            row[runState] = "failed";
            break;
    }
});

/** Opens a system of the shown chapter in the Compiled tab, from its mark in the editor. */
export const openSystem = System.create({
    components: { with: [shown, tab, tabPicked, systemOpened] },
}, (row, _context, input: { readonly file: string; readonly start: number }) => {
    row[tab] = "compiled";
    row[tabPicked] = true;
    row[systemOpened] = { file: input.file, start: input.start, serial: (row[systemOpened]?.serial ?? 0) + 1 };
});

/** Shows the tab of the shown chapter's run window the reader picked; the Console shown, its lines are seen. */
export const selectTab = System.create({
    components: { with: [shown, tab, tabPicked, logged, consoleSeen] },
}, (row, _context, input: { readonly tab: Tab }) => {
    row[tab] = input.tab;
    row[tabPicked] = true;
    if (input.tab === "console") row[consoleSeen] = linesOf(row[logged]);
});
