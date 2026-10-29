// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { formatWithOptions } from "node:util";
import ts from "typescript";
import { afterAll, expect, it, vi } from "vitest";

/**
 * Each chapter here is its prose, `NN-name.md`, and a program, which its `main` runs. Run, it prints what the `.out`
 * file beside it says: a line per console call, as node writes its values, on one line each. Ids name the package's
 * version, which is left out of the comparison, so a new version changes no example. The folder is read as the test
 * runs, not through `import.meta.glob`, which vitest's cache of transformed modules would keep as of the test's first
 * run, missing a chapter added since.
 */
const folder = new URL(".", import.meta.url);
const files = readdirSync(folder);
const read = (file: string): string => readFileSync(new URL(file, folder), "utf8");
const names = files.filter(file => /^\d+-[\w-]+\.ts$/.test(file) && !file.endsWith(".type-test.ts")).map(file => file.slice(0, -".ts".length)).sort();
const proseFiles = files.filter(file => /^\d+-[\w-]+\.md$/.test(file)).sort();
/** Where the mutation tests write each program changed: `.mutants` in the package. */
const mutants = new URL("../../.mutants/", import.meta.url);
afterAll(() => rmSync(mutants, { recursive: true, force: true }));

const levels = ["log", "info", "warn", "error", "debug"] as const;
const unversioned = (text: string): string => text.replace(/@adobe\/ecs@[^/\s]+\//g, "@adobe/ecs/");
const chapterOf = (file: string): number => Number(/^(\d+)-/.exec(file)?.[1]);

/** What `main` prints, a line per console call, and how it failed, if it did. */
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

/** Each chapter's code: its files', without comments. */
const codeOf = (chapter: number): string =>
    files.filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts") && chapterOf(file) === chapter).map(file => withoutComments(read(file))).join("\n");

/** What prose shows as code: its inline code and its blocks. */
const shownIn = (prose: string): readonly string[] => [...prose.matchAll(/```\w*\n([\s\S]*?)```|`([^`\n]+)`/g)].map(([, block, inline]) => block ?? inline ?? "");

/** Each link of the prose to lines of a program, which the interactive guide shows in its editor: `NN-name.ts#L4-L9`. */
const editorLinks = proseFiles.flatMap(prose => [...read(prose).matchAll(/\]\(([^)#\s]*)#L(\d+)(?:-L(\d+))?\)/g)].map(([, file = "", from = "", to]) =>
    ({ prose, file, from: Number(from), to: Number(to ?? from) })));

/** The chapters the guide's index lists, in order: each its number, title and prose. */
const listed = [...read("README.md").matchAll(/^(?:- |(\d+)\. )\[([^\]]+)\]\(([^)]+)\)$/gm)].map(([, number = "0", title = "", file = ""]) => ({ number: Number(number), title, file }));

/** What each chapter teaches, which its prose names as code and its program does; 0 is the unnumbered keys chapter's. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    0: ["Symbol()", "declare module \"@adobe/ecs\"", "Components", "Resources", "row[score]", "resources[bonus]", "default"],
    1: ["Resources", "default", "World.create", "readonly: true", "run", "ReadonlyMap", "Entity"],
    2: ["Components", "type: true", "as const", "commands.spawn", "commands.remove", "with: [...Particle]"],
    3: ["System.create", "with", "not", "readonly: true", "optional: [velocity]", "after: [addOne]"],
    4: ["clock", "delta", "cadence", "always", "resources: { changed: [elapsed] }", "wake", "reduce[wake]", "world.add", "world.remove"],
    5: ["after", "during", "System.create([heal, hit])", "during: [update]"],
    6: ["commands.spawn", "commands.add", "commands.despawn", "after: [spawn]"],
    7: ["resources: { changed: [level] }", "changed: [score]", "resources: { is: [map], not: [paused] }", "resources[map]"],
    8: ["world.run(hit, { amount: 3 })", "target: \"entity\""],
    9: ["Rule.create", "derived: true"],
    10: ["world.dispose()", "Finalizer.changes", "changes.previous", "changes.next"],
    11: ["reference: \"owner\"", "reference: \"weak\"", "within: typeof selected", "interface Traits<N>", "Component.With<typeof instanced>"],
    12: ["lookup: { enemy: { with", "lookup.enemy(", "changed: [health]", "changed"],
    13: ["Index.create", "key", "lookup: { at: { index: grid } }", "sorted: true", "{ \">=\": 90 }", "order: byScore", "unique: true", "key: []", "length", "at(i)", "changed: true"],
    14: ["kernel: true", "kernel: false", "F32"],
    15: ["reduce: \"+\"", "\"max\"", "reduce[total]("],
    16: ["kernel: \"gpu\"", "System.render", "accessors", "tables", "table.bind(pass)", "table.count", "Gpu.wgsl(draw)"],
    17: ["reference: \"owner\"", "up: { through: parent }", "up", "null"],
    18: ["explode"],
    19: ["interface Threads", "thread: \"audio\"", "world.share(", "World.join(", "{ threads: [\"audio\"] }", "audio.run"],
    20: ["shared: true", "commands.spawn(Unit, {", "row[cell]", "commands.add", "where: { [cell]: [4, 0] }", "where", "changed: [position]"],
    21: ["thread: \"main\"", "cadence", "always", "commands.add", "is: [stage]", "style.translate", "changed: [position]"],
    22: ["changed: [clock]", "is: [pen]", "key: []", "clearRect(", "arc(", "fill()", "getImageData("],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    0: [
        ["default: 5 ", ""],
        ["export const score = Symbol();", "export const score = Symbol.for(\"score\");", "a component's key score is a top-level `Symbol()` constant of this module"],
        ["export const score = Symbol();", "export const score = [Symbol()][0];", "a component's key score is a top-level `Symbol()` constant of this module"],
        ["        [score]: { type: number };\n", "", "System \"award\" uses component \"score\", which isn't a registered component: declare it beside its key, in interface Components or Resources."],
    ],
    1: [["World.create({ [gravity]: -1.6 })", "World.create()"], ["default: -9.8 ", ""], ["{ default: -Infinity }", "{}"]],
    2: [["commands.remove(row.entity, enemy);", ""], ["{ [position]: [0, 10, 0] }", "{}"]],
    3: [
        ["not: [frozen]", "not: []"], ["System.create([count, fail])", "System.create([fail])"],
        ["const look = System.create({ readonly: true, components: { with: [position] } }", "const look = System.create({ components: { with: [position] } }"],
        ["const peek = System.create({ components: { with: [position] }, after: [addOne] }", "const peek = System.create({ readonly: true, components: { with: [position] } }"],
    ],
    4: [["world.remove(advance);", ""]],
    5: [["after: [hit] ", ""], ["during: [update] ", ""]],
    6: [["commands.add(hero, health, 5);", ""], ["commands.despawn(commands.spawn([health])({ [health]: 1 }));", "commands.spawn([health])({ [health]: 1 });"], ["watched.add(watch);", ""]],
    7: [["resources: { changed: [level] } ", ""], [", changed: [score]", ""], [", not: [paused]", ""], ["is: [map], ", ""]],
    8: [["target: \"entity\",", ""]],
    9: [["with: [mesh], not: [hidden]", "with: [mesh]"], ["Rule.create({ components: { with: [sprite], not: [hidden] }, derive: [drawn] });", ""], ["Rule.create({ components: { with: [drawn] }, derive: [layer] });", ""]],
    10: [["open.delete(row[handle]);", ""], ["await world.dispose();", ""], ["changes.previous(entity, handle)", "null"]],
    11: [["; reference: \"owner\"", ""], ["; reference: \"weak\"", ""], ["; within: typeof selected", ""]],
    12: [["with: [health], not: [frozen]", "with: [health]"], ["with: [health], changed: [health]", "with: [health]"]],
    13: [["sorted: true, ", ""], ["unique: true, ", ""], [", changed: true", ""], ["key: [cell]", "key: [crowded]"]],
    15: [["reduce[count](1);", ""], ["reduce: \"max\"", "reduce: \"+\""]],
    16: [[", dotSize: size", ""]],
    17: [[", up: { through: parent }", ""]],
    19: [["audio.add(listen);", ""], ["await audio.run(mix);", ""]],
    20: [
        [", [velocity]: [4, 0]", ""], ["with: [position], where: { [cell]: [4, 0] }", "with: [position]"],
        ["with: [position], where: { [cell]: (at, { resources }) => resources[camera]?.sees(at) === true } }", "with: [position] }"],
        ["changed: [position], ", ""], ["await world.run(cross);", ""], ["await world.run(look, { x: 2, y: 2 });", ""],
    ],
    21: [["row[dot].remove();", ""], ["commands.add(row.entity, dot, element);", ""]],
    22: [["context.fill();", ""]],
};

it("has prose and an expected output beside each program, and none without one, and Setup's prose", () => {
    expect(files.filter(file => file.endsWith(".out")).map(file => file.slice(0, -".out".length)).sort()).toEqual(names);
    expect(proseFiles).toEqual(["00-setup.md", ...names.map(name => `${name}.md`)].sort());
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
    expect(chapterLinks.length).toBeGreaterThan(0);
    expect(chapterLinks.filter(target => !proseFiles.includes(target))).toEqual([]);
});

/** The messages of TypeScript's syntax errors in code. */
const syntaxErrors = (code: string): readonly string[] => {
    const { diagnostics = [] } = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } });
    return diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
};

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
