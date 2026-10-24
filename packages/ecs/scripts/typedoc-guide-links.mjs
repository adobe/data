// © 2026 Adobe. MIT License. See /LICENSE for details.
// Points the guide's links to the tests its excerpts come from at those files on GitHub, where they render with line
// highlights, instead of at copies typedoc would serve as raw files.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { MarkdownEvent, RendererEvent } from "typedoc";

const source = "https://github.com/adobe/data/blob/main/packages/ecs/src/guide/";
const copied = /href="(?:\.\.\/)*media\/([\w.-]+\.ts)(#L\d+(?:-L\d+)?)?"/g;

/** @param {import("typedoc").Application} app */
export const load = app => {
    const files = new Set();
    app.renderer.on(MarkdownEvent.PARSE, event => {
        event.parsedText = event.parsedText.replace(copied, (_, file, lines = "") => {
            files.add(file);
            return `href="${source}${file}${lines}"`;
        });
    });
    app.renderer.on(RendererEvent.END, event => {
        for (const file of files) rmSync(join(event.outputDirectory, "media", file), { force: true });
    });
};
