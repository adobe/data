// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Feature } from "../../shared/feature.js";
import { createBuilds } from "./builds.js";
import { builds as buildsResource, compiledElement, consoleElement, dom, outputElement, problemsElement, statusElement, tabsElement } from "./dom.js";
import { GuideCompiled } from "./elements/guide-compiled.js";
import { GuideConsole } from "./elements/guide-console.js";
import { GuideOutput } from "./elements/guide-output.js";
import { GuideProblems } from "./elements/guide-problems.js";
import { GuideStatus } from "./elements/guide-status.js";
import { GuideTabs } from "./elements/guide-tabs.js";
import { connect } from "./events.js";

/** Builds: each chapter's files checked, compiled and run as they change, and their problems and what they logged shown. */
export const builds: Feature = {
    elements: { "guide-compiled": GuideCompiled, "guide-console": GuideConsole, "guide-output": GuideOutput, "guide-problems": GuideProblems, "guide-status": GuideStatus, "guide-tabs": GuideTabs },
    resources: root => ({
        [buildsResource]: createBuilds(root), [statusElement]: root.querySelector("guide-status"), [consoleElement]: root.querySelector("guide-console"),
        [problemsElement]: root.querySelector("guide-problems"), [outputElement]: root.querySelector("guide-output"),
        [tabsElement]: root.querySelector("guide-tabs"), [compiledElement]: root.querySelector("guide-compiled"),
    }),
    system: dom,
    connect,
    start: async () => {},
};
