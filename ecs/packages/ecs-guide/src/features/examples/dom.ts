// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { shown } from "../chapters/data.js";
import { fileShown, originals, revealed, sources, unedited } from "./data.js";
import type { GuideEditor } from "./elements/guide-editor.js";
import type { GuideFiles } from "./elements/guide-files.js";
import type { GuideReset } from "./elements/guide-reset.js";
import { reviseShown } from "./model.js";

/** The page's editor, file tabs, reset button and example area; null until the page provides them. */
export const editor = Symbol();
export const filesElement = Symbol();
export const resetElement = Symbol();
export const exampleArea = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [editor]: { type: GuideEditor | null; thread: "main" };
        [filesElement]: { type: GuideFiles | null; thread: "main" };
        [resetElement]: { type: GuideReset | null; thread: "main" };
        [exampleArea]: { type: HTMLElement | null; thread: "main" };
    }
}

/** Puts the shown chapter's shown file in the editor, and its files in the tabs; a chapter without examples hides them. */
export const bindEditor = System.create({
    readonly: true,
    components: { with: [shown, sources, fileShown], changed: [shown, sources, fileShown] },
    resources: { is: [editor, filesElement, exampleArea] },
}, (row, { resources }) => {
    const file = row[sources][row[fileShown]];
    resources[exampleArea].hidden = file === undefined;
    resources[editor].file = file ?? { name: "", code: "" };
    resources[filesElement].names = row[sources].map(item => item.name);
    resources[filesElement].selected = row[fileShown];
});

/** Shows the lines asked for in the editor. */
export const bindRevealed = System.create({
    readonly: true,
    components: { with: [shown, revealed], changed: [shown, revealed] },
    resources: { is: [editor] },
}, (row, { resources }) => {
    resources[editor].revealed = row[revealed];
});

/** Lets the reset button reset only a chapter edited. */
export const bindReset = System.create({
    readonly: true,
    components: { with: [shown, sources, originals], changed: [shown, sources] },
    resources: { is: [resetElement] },
}, (row, { resources }) => {
    resources[resetElement].disabled = unedited(row[sources], row[originals]);
});

/** The examples feature's systems, as one composite: added, it runs on every tick. */
export const dom = System.create([reviseShown, bindEditor, bindRevealed, bindReset]);
