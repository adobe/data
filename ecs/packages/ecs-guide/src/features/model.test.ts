// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, workers, World } from "@adobe/ecs";
import { expect, it } from "vitest";
import type { Entry } from "../run/protocol.js";
import type { FileSystems } from "../compile/messages.js";
import { buildProblems, consoleSeen, described, keptLines, logged, page, runState, systemOpened, tab, tabPicked, typeProblems } from "./builds/data.js";
import { addBuilds, compileRevised, forgetHiddenRun, openSystem, receiveChecked, receiveCompiled, receiveRun, selectTab } from "./builds/model.js";
import { chapterNumber, shown, slug } from "./chapters/data.js";
import { addChapters, showChapter } from "./chapters/model.js";
import { fileShown, revealed, revision, sources } from "./examples/data.js";
import { addExamples, editSource, locate, resetExamples, reveal, reviseShown } from "./examples/model.js";

/** A chapter as tests read it. */
type Read = {
    readonly entity: Entity; readonly slug: string; readonly shown: boolean; readonly revision: number; readonly code: readonly string[];
    readonly fileShown: number; readonly revealed: unknown; readonly state: string; readonly logged: readonly string[]; readonly dropped: number; readonly page: string | null;
    readonly tab: string; readonly seen: number;
    readonly problems: number;
};
const read: Read[] = [];
const readChapters = System.create({
    observer: true,
    components: { with: [slug, chapterNumber, sources, revision, fileShown, revealed, runState, logged, page, typeProblems, buildProblems, tab, consoleSeen], optional: [shown] },
}, row => {
    read.push({
        entity: row.entity, slug: row[slug], shown: row[shown] !== undefined, revision: row[revision], code: row[sources].map(file => file.code),
        fileShown: row[fileShown], revealed: row[revealed], state: row[runState], logged: row[logged].entries.map(entry => `${entry.level} ${entry.text}`), dropped: row[logged].dropped,
        page: row[page], problems: row[typeProblems].length + row[buildProblems].length, tab: row[tab], seen: row[consoleSeen],
    });
});
const chaptersOf = async (world: World): Promise<readonly Read[]> => {
    read.length = 0;
    await world.run(readChapters);
    return [...read].sort((a, b) => a.entity - b.entity);
};
const chapterOf = async (world: World, name: string): Promise<Read> => {
    const found = (await chaptersOf(world)).find(item => item.slug === name);
    if (found === undefined) throw new Error(`no chapter ${name}`);
    return found;
};

/** A world with two chapters, as the guide starts them, its ticking systems run by hand. */
const guide = async (): Promise<World> => {
    const world = World.create({ [workers]: 0 });
    await world.run(addChapters, { chapters: [
        { number: 0, slug: "setup", title: "Setup", part: "", prose: "" },
        { number: 1, slug: "1-one", title: "One", part: "Basics", prose: "<p>one</p>" },
    ] });
    await world.run(addExamples, { examples: [{ slug: "1-one", files: [{ name: "01-one.ts", code: "a" }, { name: "01-one.type-test.ts", code: "b" }] }] });
    await world.run(addBuilds);
    return world;
};
const tick = System.create([reviseShown, forgetHiddenRun, compileRevised]);

it("shows the chapter an address names, or the first, and revises a chapter as it's shown", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    expect((await chaptersOf(world)).map(item => [item.slug, item.shown, item.revision, item.state])).toEqual([
        ["setup", false, 0, "waiting"], ["1-one", true, 1, "compiling"],
    ]);
    await world.run(showChapter, { slug: "nowhere" });
    await world.run(tick);
    // A chapter without examples is revised, but has nothing to compile.
    expect((await chaptersOf(world)).map(item => [item.slug, item.shown, item.revision, item.state])).toEqual([
        ["setup", true, 1, "waiting"], ["1-one", false, 1, "compiling"],
    ]);
});

it("edits the shown chapter's files, each edit a revision, and resets them", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    await world.run(editSource, { name: "01-one.type-test.ts", code: "c" });
    await world.run(editSource, { name: "01-one.type-test.ts", code: "c" });
    expect(await chapterOf(world, "1-one")).toMatchObject({ code: ["a", "c"], revision: 2 });
    await world.run(resetExamples);
    expect(await chapterOf(world, "1-one")).toMatchObject({ code: ["a", "b"], revision: 3 });
    await world.run(resetExamples);
    expect(await chapterOf(world, "1-one")).toMatchObject({ revision: 3 });
});

it("reveals lines the prose links and a problem's place, showing their file", async () => {
    await using world = await guide();
    await world.run(reveal, { slug: "1-one", file: "01-one.type-test.ts", from: 3, to: 9 });
    expect(await chapterOf(world, "1-one")).toMatchObject({ fileShown: 1, revealed: { file: 1, from: 3, to: 9, column: 1, serial: 1 } });
    await world.run(showChapter, { slug: "1-one" });
    await world.run(locate, { file: "01-one.ts", line: 4, column: 7 });
    expect(await chapterOf(world, "1-one")).toMatchObject({ fileShown: 0, revealed: { file: 0, from: 4, to: 4, column: 7, serial: 2 } });
});

it("takes results only for the latest revision, and follows a run's console to its end", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    const { entity } = await chapterOf(world, "1-one");
    const problem = { kind: "typescript", severity: "error", file: "01-one.ts", message: "no", line: 1, column: 1, length: 1 } as const;
    await world.run(receiveChecked, { chapter: entity, revision: 0, diagnostics: [problem] });
    await world.run(receiveCompiled, { chapter: entity, revision: 0, run: 9, diagnostics: [], page: "stale", systems: [], failed: false });
    expect(await chapterOf(world, "1-one")).toMatchObject({ problems: 0, page: null, state: "compiling" });
    await world.run(receiveChecked, { chapter: entity, revision: 1, diagnostics: [problem] });
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 2, diagnostics: [], page: "run/2/", systems: [], failed: false });
    expect(await chapterOf(world, "1-one")).toMatchObject({ problems: 1, page: "run/2/", state: "running" });
    await world.run(receiveRun, { message: { kind: "logs", run: 1, entries: [{ level: "log", text: "from an earlier run" }] } });
    await world.run(receiveRun, { message: { kind: "logs", run: 2, entries: [{ level: "log", text: "one" }, { level: "warn", text: "two" }] } });
    await world.run(receiveRun, { message: { kind: "logs", run: 2, entries: [{ level: "log", text: "three" }] } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ logged: ["log one", "warn two", "log three"], state: "running" });
    await world.run(receiveRun, { message: { kind: "finished", run: 2 } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ state: "finished" });
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 3, diagnostics: [], page: null, systems: [], failed: false });
    expect(await chapterOf(world, "1-one")).toMatchObject({ state: "rejected", logged: [], page: null });
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 4, diagnostics: [{ ...problem, kind: "build", file: "", message: "The compiler failed to load: no WASM" }], page: null, systems: [], failed: true });
    expect(await chapterOf(world, "1-one")).toMatchObject({ state: "unavailable", problems: 2, page: null });
});

it("fails a run on an error nothing caught, even as it goes on, or on its failure, and keeps its latest lines", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    const { entity } = await chapterOf(world, "1-one");
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 5, diagnostics: [], page: "run/5/", systems: [], failed: false });
    await world.run(receiveRun, { message: { kind: "logs", run: 5, entries: [{ level: "uncaught", text: "Uncaught (in promise) Error: no" }] } });
    await world.run(receiveRun, { message: { kind: "logs", run: 5, entries: Array.from({ length: keptLines + 1 }, (_, index): Entry => ({ level: "log", text: String(index) })) } });
    await world.run(receiveRun, { message: { kind: "finished", run: 5 } });
    const read = await chapterOf(world, "1-one");
    expect([read.state, read.logged.length, read.dropped, read.logged[0], read.logged.at(-1)]).toEqual(["failed", keptLines, 2, "log 1", `log ${keptLines}`]);
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 6, diagnostics: [], page: "run/6/", systems: [], failed: false });
    await world.run(receiveRun, { message: { kind: "failed", run: 6 } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ state: "failed", logged: [], dropped: 0 });
});

it("shows a tab of the shown chapter's run, counting the lines logged as seen while the Console shows", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    const { entity } = await chapterOf(world, "1-one");
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 7, diagnostics: [], page: "run/7/", systems: [], failed: false });
    await world.run(receiveRun, { message: { kind: "logs", run: 7, entries: [{ level: "log", text: "a" }] } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ tab: "console", seen: 1 });
    await world.run(selectTab, { tab: "output" });
    await world.run(receiveRun, { message: { kind: "logs", run: 7, entries: [{ level: "log", text: "b" }, { level: "log", text: "c" }] } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ tab: "output", seen: 1 });
    await world.run(selectTab, { tab: "console" });
    expect(await chapterOf(world, "1-one")).toMatchObject({ tab: "console", seen: 3 });
    // A new run has nothing seen yet.
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 8, diagnostics: [], page: "run/8/", systems: [], failed: false });
    expect(await chapterOf(world, "1-one")).toMatchObject({ seen: 0, logged: [] });
    expect(await chapterOf(world, "setup")).toMatchObject({ tab: "console" });
});

it("shows the Output of a run that renders, unless the reader picked a tab in its chapter", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    const { entity } = await chapterOf(world, "1-one");
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 9, diagnostics: [], page: "run/9/", systems: [], failed: false });
    await world.run(receiveRun, { message: { kind: "rendered", run: 9 } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ tab: "output" });
    await world.run(selectTab, { tab: "console" });
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 10, diagnostics: [], page: "run/10/", systems: [], failed: false });
    await world.run(receiveRun, { message: { kind: "rendered", run: 10 } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ tab: "console" });
});

it("frames a chapter shown again only once its new revision compiles, not its last page, whose messages it ignores", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    const { entity } = await chapterOf(world, "1-one");
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 2, diagnostics: [], page: "run/2/", systems: [], failed: false });
    await world.run(receiveRun, { message: { kind: "logs", run: 2, entries: [{ level: "log", text: "once" }] } });
    await world.run(showChapter, { slug: "setup" });
    await world.run(tick);
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    expect(await chapterOf(world, "1-one")).toMatchObject({ revision: 2, page: null, logged: [], state: "compiling" });
    await world.run(receiveRun, { message: { kind: "logs", run: 2, entries: [{ level: "log", text: "twice" }] } });
    expect(await chapterOf(world, "1-one")).toMatchObject({ logged: [] });
});

/** What a chapter's systems compile to, and the system opened, as tests read them. */
const compiledOf = async (world: World): Promise<unknown> => {
    let found: unknown = null;
    await world.run(System.create({ observer: true, components: { with: [shown, described, systemOpened, tab, tabPicked] } }, row => {
        found = { described: row[described], opened: row[systemOpened], tab: row[tab], picked: row[tabPicked] };
    }));
    return found;
};

it("keeps what the last build that compiled says each system compiles to, marked stale while an edit fails, and opens one in the Compiled tab", async () => {
    await using world = await guide();
    await world.run(showChapter, { slug: "1-one" });
    await world.run(tick);
    const { entity } = await chapterOf(world, "1-one");
    const backend = { kind: "none", reason: "per-run systems run as written; only row systems compile" } as const;
    const systems: readonly FileSystems[] = [{ file: "01-one.ts", systems: [{ start: 40, end: 90, line: 3, column: 14, binding: "spawn", kind: "per-run", kernel: null, runs: "Its body as written", js: backend, wasm: backend, wgsl: backend }] }];
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 2, diagnostics: [], page: "run/2/", systems, failed: false });
    expect(await compiledOf(world)).toMatchObject({ described: { systems, stale: false }, opened: null });
    const rejected = { kind: "build", severity: "error", file: "01-one.ts", message: "a body can't be async", line: 3, column: 1, length: null } as const;
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 3, diagnostics: [rejected], page: null, systems: [], failed: false });
    expect(await compiledOf(world)).toMatchObject({ described: { systems, stale: true } });
    await world.run(openSystem, { file: "01-one.ts", start: 40 });
    await world.run(openSystem, { file: "01-one.ts", start: 40 });
    expect(await compiledOf(world)).toMatchObject({ tab: "compiled", picked: true, opened: { file: "01-one.ts", start: 40, serial: 2 } });
    await world.run(receiveCompiled, { chapter: entity, revision: 1, run: 4, diagnostics: [], page: "run/4/", systems: [], failed: false });
    expect(await compiledOf(world)).toMatchObject({ described: { systems: [], stale: false } });
});
