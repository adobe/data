// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parseAst, transformWithOxc } from 'vite';
import { wasmHost } from './oxc.test-helper.js';

const root = fileURLToPath(new URL("../../..", import.meta.url));
const filesIn = (folder: string, extension: string): readonly string[] =>
    readdirSync(`${root}${folder}`, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(extension)).map(file => `${root}${folder}/${file}`);

/** A program as JSON, its BigInt and RegExp values written out. */
const json = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? `${item}n` : item instanceof RegExp ? String(item) : item);

test("oxc's WASM parser gives the programs the bundler's parseAst does, for every source and built module of the package", async () => {
    const host = await wasmHost();
    const files = [...filesIn("src", ".ts"), ...filesIn("dist", ".js")];
    expect(files.length).toBeGreaterThan(1000);
    for (const file of files) {
        const code = readFileSync(file, "utf8");
        const options = { lang: file.endsWith(".ts") ? "ts" : "js" } as const;
        expect(json(host.parse(code, options, file)), file).toBe(json(parseAst(code, options, file)));
    }
}, 120000);

test("oxc's WASM transformer strips types to the JavaScript the bundler's does, which parses alike", async () => {
    const host = await wasmHost();
    for (const file of filesIn("src", ".ts")) {
        const code = readFileSync(file, "utf8");
        const stripped = host.strip(code, file, "ts");
        const expected = await transformWithOxc(code, file, { lang: "ts", sourcemap: true });
        expect("code" in stripped ? stripped.code : stripped.error, file).toBe(expected.code);
        if ("code" in stripped) expect(json(host.parse(stripped.code, { lang: "js" })), file).toBe(json(parseAst(expected.code)));
    }
}, 120000);

test("a parse failure throws as the bundler's does, at its position", async () => {
    const host = await wasmHost();
    const code = "const a = ;";
    const thrown = (parse: () => unknown): unknown => {
        try {
            parse();
        } catch (error) {
            return error;
        }
        return null;
    };
    const ours = thrown(() => host.parse(code, { lang: "ts" }));
    const theirs = thrown(() => parseAst(code, { lang: "ts" }));
    expect(ours).toBeInstanceOf(Error);
    expect(Reflect.get(Object(ours), "pos")).toBe(Reflect.get(Object(theirs), "pos"));
    expect(String(Reflect.get(Object(ours), "message")).split("\n")[0]).toBe(String(Reflect.get(Object(theirs), "message")).split("\n")[0]);
    expect(host.strip(code, "broken.ts", "ts")).toMatchObject({ position: 10 });
});

test("a failure after text beyond ASCII is at its place in the code, as the parser counts it, not in UTF-8 bytes", async () => {
    const host = await wasmHost();
    const code = "// résumé — naïve 😀\nconst a: = 1;";
    const at = code.indexOf("= 1");
    expect(host.strip(code, "text.ts", "ts")).toMatchObject({ position: at });
    let position: unknown = null;
    try {
        host.parse(code, { lang: "ts" });
    } catch (error) {
        position = Reflect.get(Object(error), "pos");
    }
    expect(position).toBe(at);
});
