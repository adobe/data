// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { formatWithOptions } from "node:util";
import ts from "typescript";
import { afterAll, expect, it, vi } from "vitest";

/**
 * A package's guide chapters, in `folder`: its index, `README.md`, listing them; each chapter's prose, `NN-name.md`,
 * and a program, which its `main` runs and which prints what the `.out` file beside it says.
 */
export type Chapters = {
    /** The folder holding the chapters, which is the package's `src/guide`. */
    readonly folder: URL;
    /** What each chapter teaches, by its number, 0 for an unnumbered one: names its prose shows as code and its program uses. */
    readonly teaches: { readonly [chapter: number]: readonly string[] };
    /**
     * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code
     * as written, once in the program, what takes its place, and the failure it then prints, where it's one.
     */
    readonly mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] };
};

const levels = ["log", "info", "warn", "error", "debug"] as const;
/** Ids name a package's version, which is left out of comparisons, so a new version changes no chapter's output. */
const unversioned = (text: string): string => text.replace(/(@[\w-]+\/[\w-]+)@[^/\s]+\//g, "$1/");
const chapterOf = (file: string): number => Number(/^(\d+)-/.exec(file)?.[1]);

/** What `main` prints, a line per console call, as node writes its values, on one line each, and how it failed, if it did. */
const printed = async (main: () => Promise<void>): Promise<string> => {
    const lines: string[] = [];
    const spies = levels.map(level => vi.spyOn(console, level).mockImplementation((...values: unknown[]) => {
        lines.push(formatWithOptions({ breakLength: Infinity, compact: true }, ...values));
    }));
    try {
        await main();
    } catch (error) {
        lines.push(`main failed: ${String(error)}`);
    } finally {
        for (const spy of spies) spy.mockRestore();
    }
    return lines.map(line => `${line}\n`).join("");
};

/** What a program prints, run from its file, or how it failed, as a declaration the world rejects fails its import. */
const run = (file: URL): Promise<string> => printed(async () => {
    const program: unknown = await import(/* @vite-ignore */ file.href);
    const main: unknown = Reflect.get(Object(program), "main");
    if (typeof main !== "function") throw new Error(`${file.pathname} exports no main`);
    await Reflect.apply(main, undefined, []);
});

/** Code without its comments, as TypeScript prints it. */
const withoutComments = (source: string): string =>
    ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile("program.ts", source, ts.ScriptTarget.ESNext, false));

/** What prose shows as code: its inline code and its blocks. */
const shownIn = (prose: string): readonly string[] => [...prose.matchAll(/```\w*\n([\s\S]*?)```|`([^`\n]+)`/g)].map(([, block, inline]) => block ?? inline ?? "");

/** The messages of TypeScript's syntax errors in code. */
const syntaxErrors = (code: string): readonly string[] => {
    const { diagnostics = [] } = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } });
    return diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
};

/**
 * Defines the tests a package's chapters pass, in the test file calling it. The folder is read as the tests run, not
 * through `import.meta.glob`, which vitest's cache of transformed modules would keep as of their first run, missing a
 * chapter added since. Each mutant is written to `.mutants` in the package, beside `src`, and run from there.
 */
export const checkChapters = ({ folder, teaches, mutations }: Chapters): void => {
    const files = readdirSync(folder);
    const read = (file: string): string => readFileSync(new URL(file, folder), "utf8");
    const names = files.filter(file => /^\d+-[\w-]+\.ts$/.test(file) && !file.endsWith(".type-test.ts")).map(file => file.slice(0, -".ts".length)).sort();
    const proseFiles = files.filter(file => /^\d+-[\w-]+\.md$/.test(file)).sort();
    const mutants = new URL("../../.mutants/", folder);
    afterAll(() => rmSync(mutants, { recursive: true, force: true }));

    /** Each chapter's code: its files', without comments. */
    const codeOf = (chapter: number): string =>
        files.filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts") && chapterOf(file) === chapter).map(file => withoutComments(read(file))).join("\n");
    /** Each link of the prose to lines of a program, which the interactive guide shows in its editor: `NN-name.ts#L4-L9`. */
    const editorLinks = proseFiles.flatMap(prose => [...read(prose).matchAll(/\]\(([^)#\s]*)#L(\d+)(?:-L(\d+))?\)/g)].map(([, file = "", from = "", to]) =>
        ({ prose, file, from: Number(from), to: Number(to ?? from) })));
    /** The chapters the index lists, in order: each its number, title and prose. */
    const listed = [...read("README.md").matchAll(/^(?:- |(\d+)\. )\[([^\]]+)\]\(([^)]+)\)$/gm)].map(([, number = "0", title = "", file = ""]) => ({ number: Number(number), title, file }));

    it("has prose and an expected output beside each program, and no prose but the chapters' and the unnumbered ones its index lists", () => {
        expect(files.filter(file => file.endsWith(".out")).map(file => file.slice(0, -".out".length)).sort()).toEqual(names);
        // An unnumbered chapter may be prose alone, as a package's setup is.
        const proseAlone = listed.map(chapter => chapter.file).filter(file => !names.includes(file.slice(0, -".md".length)));
        expect(proseFiles).toEqual([...proseAlone, ...names.map(name => `${name}.md`)].sort());
    });

    it("lists every chapter in its index, the unnumbered first, numbered as its files are and by the title its prose gives", () => {
        expect(listed.map(chapter => chapter.file).sort()).toEqual(proseFiles);
        expect(listed.map(chapter => chapter.number)).toEqual(listed.map(chapter => chapter.number).sort((a, b) => a - b));
        for (const { number, title, file } of listed) {
            expect(number).toBe(chapterOf(file));
            const [heading, ...rest] = read(file).split("\n");
            expect(heading).toBe(`# ${title}`);
            expect(rest.join("\n").trim()).not.toBe("");
        }
    });

    it.each(names)("%s prints what its .out says", async name => {
        const expected = read(`${name}.out`);
        expect(expected.trim()).not.toBe("");
        expect(unversioned(await run(new URL(`${name}.ts`, folder)))).toBe(unversioned(expected));
    });

    it.each(Object.entries(teaches))("chapter %s's prose names what it teaches, as code, and its program does it", (chapter, taught) => {
        const prose = `${names.find(name => chapterOf(name) === Number(chapter)) ?? ""}.md`;
        const shown = shownIn(read(prose)).join("\n");
        const code = codeOf(Number(chapter));
        expect(taught.filter(name => !shown.includes(name))).toEqual([]);
        expect(taught.filter(name => !code.includes(name))).toEqual([]);
    });

    it("teaches something in every chapter", () => {
        expect(Object.keys(teaches).map(Number)).toEqual(names.map(chapterOf));
    });

    it("keeps code in the prose to a line or two, the program in the editor showing the rest", () => {
        const long = proseFiles.flatMap(file => [...read(file).matchAll(/```\w*\n([\s\S]*?)```/g)].filter(([, block = ""]) => block.split("\n").length > 3).map(() => file));
        expect(long).toEqual([]);
    });

    it("links chapters only to chapters there are", () => {
        const chapterLinks = proseFiles.flatMap(file => [...read(file).matchAll(/\]\(([^)#\s]+\.md)\)/g)].map(([, target = ""]) => target));
        expect(chapterLinks.filter(target => !proseFiles.includes(target))).toEqual([]);
    });

    it.each(editorLinks.map(link => [`${link.prose} to ${link.file}#L${link.from}-L${link.to}`, link] as const))("links %s, lines of its own program that are whole code", (_place, { prose, file, from, to }) => {
        expect(file.startsWith(prose.replace(/\.md$/, "."))).toBe(true);
        const lines = read(file).split("\n");
        expect(from).toBeGreaterThanOrEqual(1);
        expect(to).toBeGreaterThanOrEqual(from);
        expect(to).toBeLessThanOrEqual(lines.length);
        const code = lines.slice(from - 1, to).join("\n");
        expect(withoutComments(code).trim()).not.toBe("");
        expect(lines[from - 1]?.trim()).not.toBe("");
        expect(lines[to - 1]?.trim()).not.toBe("");
        // Lines cut short leave a brace or a call open, which parses neither as statements nor as a declaration's members.
        expect(syntaxErrors(code).length === 0 || syntaxErrors(`interface Members {\n${code}\n}`).length === 0 ? [] : syntaxErrors(code)).toEqual([]);
    });

    it.each(Object.entries(mutations).flatMap(([chapter, changes]) => changes.map(([from, to, failure], index) => [Number(chapter), from, to, failure, index] as const)))(
        "catches chapter %s's point taken away, %j, in its output", async (chapter, from, to, failure, index) => {
            const name = names.find(item => chapterOf(item) === chapter) ?? "";
            const source = read(`${name}.ts`);
            expect(source.split(from).length).toBe(2);
            // A file of the package's own, compiled as the program is, outside its sources, which other tests read.
            const mutant = `${name}-${index}.ts`;
            mkdirSync(mutants, { recursive: true });
            const file = new URL(mutant, mutants);
            writeFileSync(file, source.replace(from, to).replace(` from "../index.js";`, ` from "../src/index.js";`));
            try {
                const output = (await run(file)).replaceAll(`.mutants/${mutant}`, `src/guide/${name}.ts`);
                expect(unversioned(output)).not.toBe(unversioned(read(`${name}.out`)));
                if (failure !== undefined) expect(output).toContain(failure);
            } finally {
                rmSync(file, { force: true });
            }
        });
};
