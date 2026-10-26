// © 2026 Adobe. MIT License. See /LICENSE for details.
import { all, on, type Connect } from "../../shared/connect.js";
import { proseWidthKey, stackedBelow } from "./data.js";
import { setDark, setProseWidth, setStacked, setWebgpu } from "./model.js";

/** Keeps the prose's width for the reader; storage the browser refuses keeps nothing. */
const keep = (width: number): void => {
    try {
        localStorage.setItem(proseWidthKey, String(Math.round(width)));
    } catch {
        // A private window, or storage blocked: the width lasts the visit.
    }
};

/**
 * Follows the system's color scheme and the page's width, asks once whether this browser has WebGPU, and takes the
 * prose's width as the reader resizes it.
 */
export const connect: Connect = (world, root) => {
    const narrow = matchMedia(`(max-width: ${stackedBelow}px)`);
    const stack = (): void => void world.run(setStacked, { stacked: narrow.matches });
    narrow.addEventListener("change", stack);
    const resized = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.classList.contains("columns")) return;
        const width = Number(Reflect.get(target, "splitterPos"));
        if (!Number.isFinite(width)) return;
        keep(width);
        void world.run(setProseWidth, { width });
    };
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const follow = (): void => void world.run(setDark, { dark: scheme.matches });
    scheme.addEventListener("change", follow);
    // Its types declare it, but a browser without WebGPU has none.
    const gpu: GPU | undefined = navigator.gpu;
    const adapter = gpu === undefined ? Promise.resolve(null) : gpu.requestAdapter().catch(() => null);
    void adapter.then(found => world.run(setWebgpu, { webgpu: found === null ? "unavailable" : "available" }));
    return all(() => scheme.removeEventListener("change", follow), () => narrow.removeEventListener("change", stack), on(root, "change", resized));
};
