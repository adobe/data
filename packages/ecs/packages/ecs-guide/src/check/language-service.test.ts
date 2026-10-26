// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { chapters, numbered } from "../content/guide.js";
import { createCheck } from "./language-service.js";

const check = createCheck();

it("finds no error in any chapter's files, as the package's own build checks them", () => {
    for (const chapter of chapters.filter(chapter => chapter.files.length > 0)) {
        const diagnostics = check(chapter.files.map(file => ({ name: file.name, code: file.source })));
        expect([chapter.slug, diagnostics]).toEqual([chapter.slug, []]);
    }
});

it("reports a type error at its place in the file, and none once it's fixed", () => {
    const resources = numbered(1)?.files[0];
    if (resources === undefined) throw new Error("no 01-resources.ts");
    const edited = resources.source.replace("await using moon = World.create({ [gravity]: -1.6 });", "await using moon = World.create({ [gravity]: \"low\" });");
    const diagnostics = check([{ name: resources.name, code: edited }]);
    const line = edited.split("\n").findIndex(text => text.includes("\"low\"")) + 1;
    expect(diagnostics).toEqual([expect.objectContaining({ kind: "typescript", severity: "error", file: resources.name, line })]);
    // Checked again after the error is fixed, the file has none.
    expect(check([{ name: resources.name, code: resources.source }])).toEqual([]);
});

it("reports the error the type-test chapter expects, once its @ts-expect-error is gone, saying what the chapter says", () => {
    const traits = numbered(11)?.files.find(file => file.name.endsWith(".type-test.ts"));
    if (traits === undefined) throw new Error("no 11-traits.type-test.ts");
    const edited = traits.source.replace(/\/\/ @ts-expect-error[^\n]*\n\/\/[^\n]*\n/, "");
    expect(edited).not.toBe(traits.source);
    const [diagnostic] = check([{ name: traits.name, code: edited }]);
    expect(diagnostic?.line).toBe(edited.split("\n").indexOf("instance(name);") + 1);
    expect(diagnostic?.message).toBe("Argument of type 'typeof name' is not assignable to parameter of type 'typeof transform'.");
    expect(traits.source).toContain(`\n// ${diagnostic?.message}\n`);
});

it("reports TypeScript's errors at each use of a key the keys chapter no longer declares", () => {
    const keys = chapters.find(chapter => chapter.slug === "keys-and-declarations")?.files[0];
    if (keys === undefined) throw new Error("no 00-keys.ts");
    const edited = keys.source.replace("        [score]: { type: number };\n", "");
    expect(edited).not.toBe(keys.source);
    const lines = check([{ name: keys.name, code: edited }]).map(diagnostic => edited.split("\n")[(diagnostic.line ?? 0) - 1]?.trim());
    expect(lines).toContain("row[score] += resources[bonus];");
    expect(lines).toContain("console.log(\"score\", row[score]);");
});
