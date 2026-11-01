// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import readme from "../../../../README.md?raw";
import { chaptersOf, linesLink, linesOf, slugOf } from "./chapters.js";
import { packages } from "virtual:guide-packages";
import { asConsumer, chapters, numbered } from "./guide.js";

/** Every package's chapters' prose, as the guide reads it. */
const prose: readonly string[] = packages.flatMap(item => item.prose.map(file => file.source));

it("gives a chapter for Setup and each chapter the index lists, each with its files and what they print, and one for any chapter the repository's README links", () => {
    const packages = [...new Set(chapters.map(chapter => chapter.package))];
    expect(chapters.map(chapter => chapter.number)).toEqual([0, 0, ...Array.from({ length: chapters.length - 2 }, (_, index) => index + 1)]);
    // The first package's chapters are in the parts its index gives; each later package's, in one titled by its name.
    for (const later of packages.slice(1)) expect(chapters.filter(chapter => chapter.package === later).every(chapter => chapter.part === later)).toBe(true);
    expect(packages.length).toBeGreaterThan(1);
    const linked = [...readme.matchAll(/\]\(ecs\/samples\/#ecs-guide\/([^)]+)\)/g)].map(([, slug]) => slug);
    for (const slug of linked) expect(chapters.map(chapter => chapter.slug)).toContain(slug);
    expect(chapters[0]).toMatchObject({ slug: "setup", title: "Setup", part: "", files: [], expected: "" });
    expect(chapters[1]).toMatchObject({ slug: "keys-and-declarations", title: "Keys and declarations", part: "", expected: "score 15\n" });
    expect(chapters[1]?.files.map(file => file.name)).toEqual(["00-keys.ts"]);
    expect(numbered(1)).toMatchObject({ slug: "1-resources", title: "Resources", part: "Basics" });
    expect(numbered(19)).toMatchObject({ slug: "19-threads", title: "Threads", part: "Advanced" });
    expect(numbered(20)).toMatchObject({ slug: "20-shared-components-and-where", title: "Shared components and where", part: "Advanced" });
    expect(numbered(21)).toMatchObject({ slug: "21-animating-elements", title: "Animating elements", part: "UI" });
    expect(numbered(22)).toMatchObject({ slug: "22-drawing-on-a-canvas", title: "Drawing on a canvas", part: "UI" });
    expect(numbered(11)?.files.map(file => file.name)).toEqual(["11-traits.ts", "11-traits.type-test.ts"]);
    expect(numbered(15)?.expected).toBe("3 weigh 10, at most 5\n");
    for (const chapter of chapters) expect(chapter.prose).not.toBe("");
    for (const chapter of chapters.filter(chapter => chapter.slug !== "setup")) {
        expect(chapter.files.length).toBeGreaterThan(0);
        expect(chapter.expected).not.toBe("");
        // A chapter's files are numbered as it is in its own package.
        const stems = new Set(chapter.files.map(file => /^\d+-/.exec(file.name)?.[0]));
        expect(stems.size).toBe(1);
    }
});

it("gives each chapter's prose under its title, its links to a program's lines showing them in the editor and its links to chapters their addresses", () => {
    const resources = numbered(1)?.prose ?? "";
    expect(resources.startsWith("# ")).toBe(false);
    expect(resources).toContain("](#1-resources/01-resources.ts/L14-L23 \"Lines 14–23 of 01-resources.ts, in the editor\")");
    expect(resources).toContain("](#1-resources/01-resources.ts/L30-L30 \"Line 30 of 01-resources.ts, in the editor\")");
    expect(resources).toContain("](#15-reductions)");
    expect(resources).not.toMatch(/\]\([\w-]+\.(ts|md)/);
    const shown = chapters.reduce((count, chapter) => count + [...chapter.prose.matchAll(/\]\(#[^)\s]+\/L\d+-L\d+ "/g)].length, 0);
    expect(shown).toBe(prose.reduce((count, text) => count + [...text.matchAll(/\]\([^)#\s]+\.ts#L\d+/g)].length, 0));
});

it("reads a lines address back, and slugs headings as GitHub does", () => {
    const lines = { file: "03-systems.ts", from: 28, to: 58 };
    expect(linesOf(linesLink("3-systems", lines))).toEqual({ slug: "3-systems", lines });
    expect(linesOf("#3-systems")).toBeNull();
    expect(slugOf("11. Traits, within and references")).toBe("11-traits-within-and-references");
    const index = "# Guide\n\n- [Setup](00-setup.md)\n\n## Basics\n\n1. [One](01-one.md)\n";
    const prose = [{ name: "00-setup.md", source: "# Setup\n\nSee [one](01-one.md).\n" }, { name: "01-one.md", source: "# One\n\n[Two lines](01-one.ts#L2-L3).\n" }];
    expect(chaptersOf({ package: "first", after: 0, part: null }, index, prose, [{ name: "01-one.ts", source: "" }], [{ name: "01-one.out", source: "a\n" }])).toEqual([
        { package: "first", slug: "setup", number: 0, title: "Setup", part: "", prose: "See [one](#1-one).", files: [], expected: "" },
        { package: "first", slug: "1-one", number: 1, title: "One", part: "Basics", prose: "[Two lines](#1-one/01-one.ts/L2-L3 \"Lines 2–3 of 01-one.ts, in the editor\").", files: [{ name: "01-one.ts", source: "" }], expected: "a\n" },
    ]);
    // A later package's chapters number on from the chapters before them, in one part titled by its name.
    expect(chaptersOf({ package: "later", after: 22, part: "later" }, "1. [One](01-one.md)\n", prose.slice(1), []).map(chapter => [chapter.slug, chapter.number, chapter.part]))
        .toEqual([["23-one", 23, "later"]]);
});

it("shows each file importing the package as a consumer does, line for line as the guide has it", () => {
    for (const file of chapters.flatMap(chapter => chapter.files)) {
        expect(file.source).not.toContain("../index.js");
        expect(file.source.split("\n").length).toBe(asConsumer(file.source, "package").split("\n").length);
    }
    expect(numbered(3)?.files[0]?.source).toContain(`import { System, Vec3, World } from "@adobe/ecs";`);
});
