// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Source } from "../../compile/messages.js";

/** A chapter's example files as the guide has them. */
export const originals = Symbol();
/** Its example files as the reader has edited them, in the same order. */
export const sources = Symbol();
/** Which of its files the editor shows, by index. */
export const fileShown = Symbol();
/** Lines of a file to show and select in the editor: lines the prose links, or a problem's; `serial` tells one request from the last. */
export const revealed = Symbol();
/** How many times its sources have been edited or shown, so a result can tell whether it's for the latest. */
export const revision = Symbol();

export type Revealed = { readonly file: number; readonly from: number; readonly to: number; readonly column: number; readonly serial: number };

// Values holding objects live on the thread that shows them, as the elements they're written to do.
declare module "@adobe/ecs" {
    interface Components {
        [originals]: { type: readonly Source[]; thread: "main" };
        [sources]: { type: readonly Source[]; thread: "main" };
        [fileShown]: { type: number };
        [revealed]: { type: Revealed | null; thread: "main" };
        [revision]: { type: number };
    }
}

export const Example = [originals, sources, fileShown, revealed, revision] as const;

/** Whether a chapter's files are as the guide has them. */
export const unedited = (current: readonly Source[], original: readonly Source[]): boolean =>
    current.length === original.length && current.every((file, index) => file.code === original[index]?.code);
