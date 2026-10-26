// © 2026 Adobe. MIT License. See /LICENSE for details.
import { linesOf } from "../../content/chapters.js";
import { all, on, type Connect } from "../../shared/connect.js";
import { editSource, locate, resetExamples, reveal, showFile } from "./model.js";

export const connect: Connect = (world, root) => {
    const revealLines = (): void => {
        const found = linesOf(location.hash);
        if (found !== null) void world.run(reveal, { slug: found.slug, file: found.lines.file, from: found.lines.from, to: found.lines.to });
    };
    // A link to the lines the address already names changes nothing, so no hashchange shows them again.
    const followAgain = (event: MouseEvent): void => {
        const link = event.composedPath().find(item => item instanceof HTMLAnchorElement);
        if (link instanceof HTMLAnchorElement && link.hash === location.hash) revealLines();
    };
    addEventListener("hashchange", revealLines);
    revealLines();
    return all(
        () => removeEventListener("hashchange", revealLines),
        on(root, "click", followAgain),
        on(root, "guide-edit", event => void world.run(editSource, { name: event.detail.name, code: event.detail.code })),
        on(root, "guide-reset", () => void world.run(resetExamples)),
        on(root, "guide-select-file", event => void world.run(showFile, { file: event.detail.file })),
        on(root, "guide-locate", event => void world.run(locate, { file: event.detail.file, line: event.detail.line, column: event.detail.column })),
    );
};
