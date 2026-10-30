// © 2026 Adobe. MIT License. See /LICENSE for details.
import { packages } from "virtual:guide-packages";
import { chaptersOf, type Chapter } from "./chapters.js";

/**
 * A guide file as a reader sees it: importing its package by name, as a consumer does, where the file, one of the
 * package's own, imports its sources' root as `../index.js`. Both resolve to the package where the guide compiles it,
 * in the package's sources, and checks it, so the file is otherwise the same, line for line.
 */
export const asConsumer = (source: string, name: string): string => source.replaceAll(` from "../index.js";`, ` from ${JSON.stringify(name)};`);

const byName = <T extends { readonly name: string }>(files: readonly T[]): readonly T[] => [...files].sort((a, b) => a.name.localeCompare(b.name));

/**
 * The guide's chapters: each package's, in the guide's order, numbered on from the chapters before them. The first
 * package's chapters are in the parts its index gives; each other package's are in one part, titled by its name.
 */
export const chapters: readonly Chapter[] = packages.reduce<readonly Chapter[]>((before, { name, index, prose, sources, outputs }, at) => [
    ...before,
    ...chaptersOf(
        { package: name, after: before.filter(chapter => chapter.number > 0).length, part: at === 0 ? null : name },
        index, byName(prose), byName(sources).map(file => ({ name: file.name, source: asConsumer(file.source, name) })), byName(outputs),
    ),
], []);

/** The chapter numbered `number` in the guide: `1` for Resources. */
export const numbered = (number: number): Chapter | undefined => chapters.find(chapter => chapter.number === number && number > 0);
