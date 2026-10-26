// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { chapterNumber, shown } from "../chapters/data.js";
import { sources } from "../examples/data.js";
import { dark, gpuChapter, proseWidth, stacked, webgpu } from "./data.js";
import type { GuideNote } from "./elements/guide-note.js";

/** The page's Spectrum theme and WebGPU note; null until the page provides them. */
export const theme = Symbol();
export const note = Symbol();
/** The splitter between the prose and the example. */
export const columnsElement = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [theme]: { type: HTMLElement | null; thread: "main" };
        [note]: { type: GuideNote | null; thread: "main" };
        [columnsElement]: { type: HTMLElement | null; thread: "main" };
    }
}

/** Colors the page light or dark, as the system prefers. */
export const bindTheme = System.create({
    observer: true,
    resources: { is: [theme], changed: [dark] },
}, ({ resources }) => {
    resources[theme].setAttribute("color", resources[dark] ? "dark" : "light");
});

/** Says whether this browser has WebGPU. */
export const bindWebgpu = System.create({
    observer: true,
    resources: { is: [note], changed: [webgpu] },
}, ({ resources }) => {
    resources[note].webgpu = resources[webgpu];
});

/** Shows the note in the chapter on GPU kernels only. */
export const bindNote = System.create({
    observer: true,
    components: { with: [shown, chapterNumber], changed: [shown] },
    resources: { is: [note] },
}, (row, { resources }) => {
    resources[note].hidden = row[chapterNumber] !== gpuChapter;
});

/**
 * Lets the reader resize the prose beside the example, side by side, to the width they last made it; stacked, or
 * without an example, there's nothing to resize.
 */
export const bindColumns = System.create({
    observer: true,
    components: { with: [shown, sources] },
    resources: { is: [columnsElement] },
}, (row, { resources }) => {
    const element = resources[columnsElement];
    const resizable = !resources[stacked] && row[sources].length > 0;
    if (Reflect.get(element, "resizable") !== resizable) Reflect.set(element, "resizable", resizable);
    const width = resources[proseWidth];
    // A width the splitter already has, as it does while it's dragged, isn't written back.
    if (width > 0 && Math.round(Number(Reflect.get(element, "splitterPos"))) !== Math.round(width)) Reflect.set(element, "primarySize", `${Math.round(width)}px`);
});

/** The appearance feature's DOM systems, as one composite: added, it runs on every tick. */
export const dom = System.create([bindTheme, bindWebgpu, bindNote, bindColumns]);
