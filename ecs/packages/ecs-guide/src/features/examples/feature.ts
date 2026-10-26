// © 2026 Adobe. MIT License. See /LICENSE for details.
import { chapters as content } from "../../content/guide.js";
import type { Feature } from "../../shared/feature.js";
import { dom, editor, exampleArea, filesElement, resetElement } from "./dom.js";
import { GuideEditor } from "./elements/guide-editor.js";
import { GuideFiles } from "./elements/guide-files.js";
import { GuideReset } from "./elements/guide-reset.js";
import { connect } from "./events.js";
import { addExamples } from "./model.js";

/** Examples: each chapter's files, edited in place, reset to the guide's, and their lines shown from the prose. */
export const examples: Feature = {
    elements: { "guide-editor": GuideEditor, "guide-files": GuideFiles, "guide-reset": GuideReset },
    resources: root => ({
        [editor]: root.querySelector("guide-editor"), [filesElement]: root.querySelector("guide-files"),
        [resetElement]: root.querySelector("guide-reset"), [exampleArea]: root.querySelector<HTMLElement>(".example"),
    }),
    system: dom,
    connect,
    start: async world => {
        await world.run(addExamples, { examples: content.map(item => ({ slug: item.slug, files: item.files.map(file => ({ name: file.name, code: file.source })) })) });
    },
};
