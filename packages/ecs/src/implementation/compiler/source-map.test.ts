import { describe, expect, test } from "vitest";
import { decodeMappings, insertInto } from "./source-map.js";

describe("insertInto", () => {
    const source = `const a = Symbol("a");\nexport const b = Symbol("b"); const after = 2;\n`;
    const insertions = [
        { at: source.indexOf(`Symbol("a")`), text: "wrap(" },
        { at: source.indexOf(`Symbol("a")`) + `Symbol("a")`.length, text: `, "a")` },
        { at: source.indexOf(`Symbol("b")`), text: "wrap(" },
        { at: source.indexOf(`Symbol("b")`) + `Symbol("b")`.length, text: `, "b")` },
        { at: source.length, text: "\nfunction wrap(value) { return value; }\n" },
    ];

    test("makes the insertions in order of offset, those at one offset in the order given", () => {
        const { code } = insertInto("ab", [{ at: 1, text: "2" }, { at: 0, text: "0" }, { at: 1, text: "3" }], "x.ts");
        expect(code).toBe("0a23b");
        expect(insertInto(source, insertions, "src/keys.ts").code).toBe(`const a = wrap(Symbol("a"), "a");\nexport const b = wrap(Symbol("b"), "b"); const after = 2;\n\nfunction wrap(value) { return value; }\n`);
    });

    test("maps the start of every word of the source to itself, with a segment of its own", () => {
        const { code, map } = insertInto(source, insertions, "src/keys.ts");
        expect({ sources: map.sources, sourcesContent: map.sourcesContent, version: map.version }).toEqual({ sources: ["src/keys.ts"], sourcesContent: [source], version: 3 });
        const generated = code.split("\n");
        const lines = decodeMappings(map.mappings);
        const original = source.split("\n");
        for (let line = 0; line < 2; line++) {
            for (const match of (original[line] ?? "").matchAll(/[\w$]+/g)) {
                const word = match[0];
                const column = match.index;
                // The same word, at the same occurrence along the generated line.
                const occurrence = [...(original[line] ?? "").slice(0, column).matchAll(new RegExp(`\\b${word}\\b`, "g"))].length;
                const at = [...(generated[line] ?? "").matchAll(new RegExp(`\\b${word}\\b`, "g"))][occurrence]?.index ?? -1;
                const segment = lines[line]?.find(candidate => candidate.column === at);
                expect([word, segment?.sourceLine, segment?.sourceColumn]).toEqual([word, line, column]);
            }
        }
        // Inserted text starts no segment of its own.
        expect(lines[0]?.some(segment => segment.column === generated[0]?.indexOf("wrap("))).toBe(false);
    });
});
