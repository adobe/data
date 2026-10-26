// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import type { Source } from "../../compile/messages.js";
import { chapter, shown, slug } from "../chapters/data.js";
import { Example, fileShown, originals, revealed, revision, sources, unedited } from "./data.js";

/** Gives each chapter its example files, by its address. */
export const addExamples = System.create({
    components: { with: [chapter, slug] },
}, (row, { commands }, input: { readonly examples: readonly { readonly slug: string; readonly files: readonly Source[] }[] }) => {
    const files = input.examples.find(item => item.slug === row[slug])?.files ?? [];
    commands.add(row.entity, Example, { [originals]: files, [sources]: files, [fileShown]: 0, [revealed]: null, [revision]: 0 });
});

/** Each chapter shown starts a new revision of its files, which builds them, so a chapter shown runs again. */
export const reviseShown = System.create({
    components: { with: [shown, revision], changed: [shown] },
}, row => {
    row[revision] += 1;
});

/** Edits a file of the shown chapter. */
export const editSource = System.create({
    components: { with: [shown, sources, revision] },
}, (row, _context, input: { readonly name: string; readonly code: string }) => {
    const current = row[sources];
    const index = current.findIndex(file => file.name === input.name);
    if (index < 0 || current[index]?.code === input.code) return;
    row[sources] = current.map((file, at) => at === index ? { name: file.name, code: input.code } : file);
    row[revision] += 1;
});

/** Resets the shown chapter's files to the guide's. */
export const resetExamples = System.create({
    components: { with: [shown, sources, originals, revision] },
}, row => {
    if (unedited(row[sources], row[originals])) return;
    row[sources] = row[originals];
    row[revision] += 1;
});

/** Shows another of the shown chapter's files. */
export const showFile = System.create({
    components: { with: [shown, sources, fileShown] },
}, (row, _context, input: { readonly file: number }) => {
    if (input.file >= 0 && input.file < row[sources].length) row[fileShown] = input.file;
});

/** Shows a place in the shown chapter's file, by its name: a problem's. */
export const locate = System.create({
    components: { with: [shown, sources, fileShown, revealed] },
}, (row, _context, input: { readonly file: string; readonly line: number; readonly column: number }) => {
    const file = row[sources].findIndex(item => item.name === input.file);
    if (file < 0) return;
    row[fileShown] = file;
    row[revealed] = { file, from: input.line, to: input.line, column: input.column, serial: (row[revealed]?.serial ?? 0) + 1 };
});

/** Shows lines of a chapter's file, by the chapter's address and the file's name: lines the prose links. */
export const reveal = System.create({
    components: { with: [slug, sources, fileShown, revealed] },
}, (row, _context, input: { readonly slug: string; readonly file: string; readonly from: number; readonly to: number }) => {
    if (row[slug] !== input.slug) return;
    const file = row[sources].findIndex(item => item.name === input.file);
    if (file < 0) return;
    row[fileShown] = file;
    row[revealed] = { file, from: input.from, to: input.to, column: 1, serial: (row[revealed]?.serial ?? 0) + 1 };
});
