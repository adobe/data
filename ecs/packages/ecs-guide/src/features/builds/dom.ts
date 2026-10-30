// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { shown } from "../chapters/data.js";
import { fileShown, revision, sources } from "../examples/data.js";
import { editor } from "../examples/dom.js";
import type { Builds } from "./builds.js";
import { buildProblems, consoleSeen, described, linesOf, logged, page, runState, systemOpened, tab, typeProblems } from "./data.js";
import type { GuideCompiled } from "./elements/guide-compiled.js";
import type { GuideConsole } from "./elements/guide-console.js";
import type { GuideOutput } from "./elements/guide-output.js";
import type { GuideProblems } from "./elements/guide-problems.js";
import type { GuideStatus } from "./elements/guide-status.js";
import type { GuideTabs } from "./elements/guide-tabs.js";
import { addBuilds, compileRevised, forgetHiddenRun } from "./model.js";

/** The builds the page's examples go to, and the elements showing their results; null until the page provides them. */
export const builds = Symbol();
export const statusElement = Symbol();
export const consoleElement = Symbol();
export const problemsElement = Symbol();
export const outputElement = Symbol();
export const tabsElement = Symbol();
export const compiledElement = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [builds]: { type: Builds | null; thread: "main" };
        [statusElement]: { type: GuideStatus | null; thread: "main" };
        [consoleElement]: { type: GuideConsole | null; thread: "main" };
        [problemsElement]: { type: GuideProblems | null; thread: "main" };
        [outputElement]: { type: GuideOutput | null; thread: "main" };
        [tabsElement]: { type: GuideTabs | null; thread: "main" };
        [compiledElement]: { type: GuideCompiled | null; thread: "main" };
    }
}

/** Sends each revision of a chapter's files to be checked and compiled. */
export const requestBuilds = System.create({
    readonly: true,
    components: { with: [revision, sources], changed: [revision] },
    resources: { is: [builds] },
}, (row, { resources }) => {
    if (row[revision] > 0 && row[sources].length > 0) resources[builds].request(row.entity, row[revision], row[sources]);
});

/** Lists the shown chapter's problems, and marks the shown file's in the editor. */
export const bindProblems = System.create({
    readonly: true,
    components: { with: [shown, typeProblems, buildProblems, sources, fileShown], changed: [shown, typeProblems, buildProblems, fileShown] },
    resources: { is: [problemsElement, editor] },
}, (row, { resources }) => {
    const all = [...row[buildProblems], ...row[typeProblems]];
    resources[problemsElement].problems = all;
    const name = row[sources][row[fileShown]]?.name;
    resources[editor].problems = all.filter(problem => problem.file === name);
});

/** Shows where the shown chapter's run is. */
export const bindStatus = System.create({
    readonly: true,
    components: { with: [shown, runState], changed: [shown, runState] },
    resources: { is: [statusElement] },
}, (row, { resources }) => {
    resources[statusElement].state = row[runState];
});

/** Shows what the shown chapter's run logged. */
export const bindConsole = System.create({
    readonly: true,
    components: { with: [shown, logged], changed: [shown, logged] },
    resources: { is: [consoleElement] },
}, (row, { resources }) => {
    resources[consoleElement].logged = row[logged];
});

/**
 * Shows the shown chapter's tab of the run's window, and on each tab what it holds: the Console's lines logged since it
 * was last shown, and the Problems, each saying whether an error is among them.
 */
export const bindTabs = System.create({
    readonly: true,
    components: { with: [shown, tab, logged, consoleSeen, typeProblems, buildProblems], changed: [shown, tab, logged, consoleSeen, typeProblems, buildProblems] },
    resources: { is: [tabsElement] },
}, (row, { resources }) => {
    const log = row[logged];
    const unseen = log.entries.slice(Math.max(row[consoleSeen] - log.dropped, 0));
    const problems = [...row[buildProblems], ...row[typeProblems]];
    resources[tabsElement].selected = row[tab];
    resources[tabsElement].badges = {
        console: { count: linesOf(log) - row[consoleSeen], errors: unseen.some(entry => entry.level === "error" || entry.level === "uncaught") },
        output: { count: 0, errors: false },
        problems: { count: problems.length, errors: problems.some(problem => problem.severity === "error") },
        compiled: { count: 0, errors: false },
    };
});

/** Lists what the shown chapter's systems compile to, and opens the one the reader chose. */
export const bindCompiled = System.create({
    readonly: true,
    components: { with: [shown, described, systemOpened], changed: [shown, described, systemOpened] },
    resources: { is: [compiledElement] },
}, (row, { resources }) => {
    resources[compiledElement].systems = row[described].systems;
    resources[compiledElement].stale = row[described].stale;
    resources[compiledElement].opened = row[systemOpened];
});

/** Lets the editor ask TypeScript what's at a place in the shown chapter's files. */
export const bindQuickInfo = System.create({
    readonly: true,
    components: { with: [shown], changed: [shown] },
    resources: { is: [editor, builds] },
}, (row, { resources }) => {
    const { entity } = row;
    const service = resources[builds];
    resources[editor].quickInfo = (file, code, position) => service.info(entity, file, code, position);
});

/** Marks the shown file's systems in the editor at their calls. */
export const bindSystemMarks = System.create({
    readonly: true,
    components: { with: [shown, described, sources, fileShown], changed: [shown, described, fileShown] },
    resources: { is: [editor] },
}, (row, { resources }) => {
    const name = row[sources][row[fileShown]]?.name;
    resources[editor].systems = row[described].systems.find(file => file.file === name)?.systems ?? [];
    resources[editor].systemsStale = row[described].stale;
});

/** Frames the shown chapter's latest run. */
export const bindOutput = System.create({
    readonly: true,
    components: { with: [shown, page], changed: [shown, page] },
    resources: { is: [outputElement] },
}, (row, { resources }) => {
    resources[outputElement].page = row[page];
});

/** The builds feature's systems, as one composite: added, it runs on every tick. */
export const dom = System.create([addBuilds, forgetHiddenRun, compileRevised, requestBuilds, bindProblems, bindStatus, bindConsole, bindTabs, bindOutput, bindCompiled, bindSystemMarks, bindQuickInfo]);
