// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Feature } from "../../shared/feature.js";
import { dark, proseWidth, proseWidthKey, stacked, stackedBelow } from "./data.js";
import { columnsElement, dom, note, theme } from "./dom.js";
import { GuideNote } from "./elements/guide-note.js";
import { connect } from "./events.js";

/** The prose's width the reader last made it, if the browser kept it. */
const keptWidth = (): number => {
    try {
        const kept = Number(localStorage.getItem(proseWidthKey) ?? "");
        return Number.isFinite(kept) && kept > 0 ? kept : 0;
    } catch {
        return 0;
    }
};

/**
 * Appearance: the page light or dark as the system prefers, its columns side by side or stacked as its width allows,
 * the prose as wide as the reader made it, and whether this browser has WebGPU, where it matters.
 */
export const appearance: Feature = {
    elements: { "guide-note": GuideNote },
    resources: root => ({
        [theme]: root.closest<HTMLElement>("sp-theme"), [note]: root.querySelector("guide-note"), [dark]: matchMedia("(prefers-color-scheme: dark)").matches,
        [columnsElement]: root.querySelector<HTMLElement>("sp-split-view.columns"), [stacked]: matchMedia(`(max-width: ${stackedBelow}px)`).matches, [proseWidth]: keptWidth(),
    }),
    system: dom,
    connect,
    start: async () => {},
};
