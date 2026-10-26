// © 2026 Adobe. MIT License. See /LICENSE for details.
import index from "../../../ecs/src/guide/README.md?raw";
import { chaptersOf, type Chapter } from "./chapters.js";

/** The guide's files, read from the package as the guide builds: its prose, its programs and what they print. */
const prose: { readonly [path: string]: string } = import.meta.glob("../../../ecs/src/guide/[0-9]*.md", { query: "?raw", import: "default", eager: true });
const sources: { readonly [path: string]: string } = import.meta.glob("../../../ecs/src/guide/[0-9]*.ts", { query: "?raw", import: "default", eager: true });
const outputs: { readonly [path: string]: string } = import.meta.glob("../../../ecs/src/guide/[0-9]*.out", { query: "?raw", import: "default", eager: true });

const named = (files: { readonly [path: string]: string }, read: (source: string) => string = source => source) => Object.entries(files)
    .map(([path, source]) => ({ name: path.slice(path.lastIndexOf("/") + 1), source: read(source) }))
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * A guide file as a reader sees it: importing the package as `@adobe/ecs`, as a consumer does, where the file, one of
 * the package's own, imports its sources' root as `../index.js`. Both resolve to the package where the guide compiles
 * it, in the package's sources, and checks it, so the file is otherwise the same, line for line.
 */
export const asConsumer = (source: string): string => source.replaceAll(` from "../index.js";`, ` from "@adobe/ecs";`);

export const chapters: readonly Chapter[] = chaptersOf(index, named(prose), named(sources, asConsumer), named(outputs));

/** The chapter numbered `number`: `1` for Resources. */
export const numbered = (number: number): Chapter | undefined => chapters.find(chapter => chapter.number === number && number > 0);
