// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The guide's chapters, read from the files beside its programs: its index, `README.md`, which lists them by part, in
 * order, the unnumbered ones, `Setup` and `Keys and declarations`, first; each chapter's prose, `NN-name.md`, under its
 * title; its programs, `NN-name.ts` and `NN-name.type-test.ts`, and what they print, `NN-name.out`, by the prose's name.
 * A chapter's address is its numbered title's anchor, `1-resources`, as GitHub makes it, or an unnumbered one's title's.
 */

/** One of a chapter's files, by its name beside the guide's index. */
export type ExampleFile = { readonly name: string; readonly source: string };

export type Chapter = {
    /** Its address: `1-resources`, or `setup`. */
    readonly slug: string;
    /** Its number, 0 for one unnumbered. */
    readonly number: number;
    readonly title: string;
    /** The part of the guide it's in: `Basics`, `Intermediate`, `Advanced` or `UI`; empty for one unnumbered. */
    readonly part: string;
    /** Its prose as markdown, under its title, each link to lines of a program a link to them in the editor (`linesLink`). */
    readonly prose: string;
    readonly files: readonly ExampleFile[];
    /** What its program prints, as its `.out` file says; empty for none. */
    readonly expected: string;
};

/** A heading's anchor, as GitHub makes it. */
export const slugOf = (heading: string): string =>
    heading.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}\s-]/gu, "").replace(/\s/g, "-");

/** Lines of a chapter's file, counted from 1. */
export type Lines = { readonly file: string; readonly from: number; readonly to: number };

/** The address of lines of a chapter's file, which shows them in its editor. */
export const linesLink = (slug: string, lines: Lines): string => `#${slug}/${lines.file}/L${lines.from}-L${lines.to}`;

/** A lines address's chapter, file and lines; null for any other hash. */
export const linesOf = (hash: string): { readonly slug: string; readonly lines: Lines } | null => {
    const match = /^#([^/]+)\/([^/]+)\/L(\d+)-L(\d+)$/.exec(hash);
    if (match === null) return null;
    return { slug: match[1] ?? "", lines: { file: match[2] ?? "", from: Number(match[3]), to: Number(match[4]) } };
};

/** An entry of the guide's index: `- [Setup](00-setup.md)`, or `1. [Resources](01-resources.md)`. */
const entry = /^(?:- |(\d+)\. )\[([^\]]+)\]\(([^)]+\.md)\)$/;

/** The prose's links: to lines of a program, `[text](01-resources.ts#L4-L9)`, or `#L4` for one, or to a chapter. */
const programLink = /\]\(([^)#\s]+\.ts)#L(\d+)(?:-L(\d+))?\)/g;
const chapterLink = /\]\(([^)#\s]+\.md)\)/g;

/**
 * The guide's chapters, as its index lists them: each with its prose, its files and what its programs print, given by
 * their names.
 */
export const chaptersOf = (index: string, prose: readonly ExampleFile[], files: readonly ExampleFile[], outputs: readonly ExampleFile[] = []): readonly Chapter[] => {
    const listed: { readonly number: number; readonly title: string; readonly part: string; readonly file: string }[] = [];
    let part = "";
    for (const line of index.split("\n")) {
        const heading = /^## (.+)$/.exec(line);
        if (heading !== null) part = heading[1] ?? "";
        const found = entry.exec(line);
        if (found === null) continue;
        const number = Number(found[1] ?? 0);
        listed.push({ number, title: found[2] ?? "", part: number === 0 ? "" : part, file: found[3] ?? "" });
    }
    const slugs = new Map(listed.map(item => [item.file, item.number === 0 ? slugOf(item.title) : slugOf(`${item.number}. ${item.title}`)]));
    return listed.map(({ number, title, part: within, file }) => {
        const slug = slugs.get(file) ?? "";
        const stem = file.slice(0, -".md".length);
        const source = prose.find(item => item.name === file)?.source ?? "";
        const body = source.replace(/^# [^\n]*\n/, "").trim()
            .replace(programLink, (_link, name: string, from: string, to: string | undefined) =>
                `](${linesLink(slug, { file: name, from: Number(from), to: Number(to ?? from) })} "${to === undefined || to === from ? `Line ${from}` : `Lines ${from}–${to}`} of ${name}, in the editor")`)
            .replace(chapterLink, (link, name: string) => slugs.has(name) ? `](#${slugs.get(name)})` : link);
        const expected = outputs.find(output => output.name === `${stem}.out`)?.source ?? "";
        return { slug, number, title, part: within, prose: body, files: files.filter(item => item.name.startsWith(`${stem}.`)), expected };
    });
};
