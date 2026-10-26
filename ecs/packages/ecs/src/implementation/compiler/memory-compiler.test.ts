// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { createMemoryCompiler, type MemoryCompiler } from './memory-compiler.js';
import { wasmHost } from './oxc.test-helper.js';
import { plugin } from './plugin.js';

const root = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "");
const filesIn = (folder: string, extension: string): readonly string[] =>
    readdirSync(`${root}/${folder}`, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(extension)).map(file => `${root}/${folder}/${file}`);
/** The guide's examples: its programs and its type test. */
const guide = filesIn("src/guide", ".ts").filter(file => /\/src\/guide\/\d+-[^/]+\.ts$/.test(file));

/** The package's files where they are, its sources and its build, read into memory. */
const files = new Map([`${root}/package.json`, ...filesIn("src", ".ts"), ...filesIn("dist", ".js")].map(file => [file, readFileSync(file, "utf8")]));

/** Code with its imports' specifiers and its kernels' urls left out, which name files where each build serves them. */
const normalized = (code: string): string => code.replace(/ from "[^"]*"/g, ` from "*"`).replace(/^url: "[^"]*",$/gm, "url: *,");

let server: ViteDevServer;
let compiler: MemoryCompiler;
beforeAll(async () => {
    server = await createServer({
        root, configFile: false, logLevel: "silent", plugins: [plugin()], appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] },
    });
    const { parse, strip } = await wasmHost();
    compiler = createMemoryCompiler({ files, packageRoot: root, parse, strip });
}, 60000);
afterAll(async () => {
    await server.close();
});

/** What the plugin, serving `file` with `code` in place of its own, gives: its code and its kernels' modules, or its error. */
const served = async (file: string): Promise<{ readonly code: string; readonly kernels: readonly string[] } | { readonly failure: string }> => {
    try {
        const result = await server.transformRequest(file.slice(root.length));
        if (result === null) return { failure: "nothing served" };
        const urls = [...result.code.matchAll(/^url: "([^"]*)",$/gm)].map(([, url]) => url ?? "");
        const kernels = await Promise.all(urls.map(async url => (await server.transformRequest(url))?.code ?? ""));
        return { code: result.code, kernels };
    } catch (error) {
        return { failure: error instanceof Error ? error.message : String(error) };
    }
};

describe("the memory compiler", () => {
    test.each(guide.map(file => [file.slice(root.length + 1), file]))("compiles %s as the plugin serves it", async (_name, file) => {
        const expected = await served(file);
        const compiled = await compiler.compile(file, files.get(file) ?? "", index => JSON.stringify(`kernel:${index}`));
        if ("failure" in expected || "failure" in compiled) throw new Error("failure" in expected ? expected.failure : "failure" in compiled ? compiled.failure : "");
        expect(normalized(compiled.code)).toBe(normalized(expected.code));
        expect(compiled.kernels.map(kernel => kernel.trim())).toEqual(expected.kernels.map(kernel => kernel.trim()));
    });

    test("compiles a module that isn't among its files as one that is, reading what the module declares from the code given", async () => {
        const file = `${root}/src/guide/15-reductions.ts`;
        const elsewhere = new Map([...files].filter(([path]) => path !== file));
        const { parse, strip } = await wasmHost();
        const compiled = await createMemoryCompiler({ files: elsewhere, packageRoot: root, parse, strip }).compile(file, files.get(file) ?? "", index => JSON.stringify(`kernel:${index}`));
        const expected = await served(file);
        if ("failure" in expected || "failure" in compiled) throw new Error("failure" in expected ? expected.failure : "failure" in compiled ? compiled.failure : "");
        expect(compiled.kernels).toHaveLength(expected.kernels.length);
        expect(normalized(compiled.code)).toBe(normalized(expected.code));
    });

    test("compiles a module of the package again after an edit from its new code, not the syntax it last parsed", async () => {
        const file = `${root}/src/guide/13-indexes.ts`;
        const source = files.get(file) ?? "";
        const { parse, strip } = await wasmHost();
        const again = createMemoryCompiler({ files, packageRoot: root, parse, strip });
        await again.compile(file, source, index => JSON.stringify(`kernel:${index}`));
        const edited = source.replace("        [cell]: { type: Vec2.I32 };\n", "        [cell]: { type: Vec2.I32 };\n        // An edit inside the block.\n");
        expect(edited).not.toBe(source);
        const compiled = await again.compile(file, edited, index => JSON.stringify(`kernel:${index}`));
        const fresh = await createMemoryCompiler({ files, packageRoot: root, parse, strip }).compile(file, edited, index => JSON.stringify(`kernel:${index}`));
        expect(compiled).toEqual(fresh);
        expect(compiled).not.toHaveProperty("failure");
    });

    test("locates a failure after text beyond ASCII at its column, as the editor counts it", async () => {
        const file = `${root}/src/guide/03-systems.ts`;
        const source = files.get(file) ?? "";
        const edited = source.replace("}, (row, { resources }) => {\n    // Values", "}, /* résumé — naïve 😀 */ async (row, { resources }) => {\n    // Values");
        const lines = edited.split("\n");
        const line = lines.findIndex(text => text.includes("async (row")) + 1;
        const compiled = await compiler.compile(file, edited, index => JSON.stringify(`kernel:${index}`));
        expect(compiled).toMatchObject({ location: { line, column: (lines[line - 1] ?? "").indexOf("async") + 1 } });
    });

    test("gives a failure, as data, when its parser or type stripper throws", async () => {
        const { parse } = await wasmHost();
        const panicking = createMemoryCompiler({ files, packageRoot: root, parse, strip: () => { throw new Error("unreachable executed"); } });
        const file = `${root}/src/guide/14-kernels.ts`;
        expect(await panicking.compile(file, files.get(file) ?? "", index => JSON.stringify(`kernel:${index}`))).toEqual({ failure: "The compiler failed: unreachable executed", location: null });
    });

    test("fails a module the build rejects, with the plugin's message, located in its source", async () => {
        const file = `${root}/src/guide/03-systems.ts`;
        const source = files.get(file) ?? "";
        let edited = source;
        const editing = await createServer({
            root, configFile: false, logLevel: "silent", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false },
            optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: "edited", enforce: "pre", load: id => id === file ? edited : null }, ...plugin()],
        });
        try {
            // A body that's async, and one using a key its declaration doesn't require.
            for (const [from, to] of [["(row, { resources }) => {\n    // Values", "async (row, { resources }) => {\n    // Values"], ["with: [velocity, position], not:", "with: [position], not:"]]) {
                edited = source.replace(from ?? "", to ?? "");
                expect(edited).not.toBe(source);
                const compiled = await compiler.compile(file, edited, index => JSON.stringify(`kernel:${index}`));
                if (!("failure" in compiled)) throw new Error("compiled");
                const line = edited.split("\n").findIndex((text, index) => text !== source.split("\n")[index]) + 1;
                expect(compiled.location?.line).toBeGreaterThanOrEqual(line);
                expect(compiled.location?.line).toBeLessThanOrEqual(line + 2);
                editing.moduleGraph.invalidateAll();
                const message = await editing.transformRequest(file.slice(root.length)).then(() => "served", (error: unknown) => error instanceof Error ? error.message : String(error));
                expect(message).toContain(compiled.failure);
            }
        } finally {
            await editing.close();
        }
    }, 60000);

    test("compiles a module of a package of its own, its keys' and systems' ids naming that package", async () => {
        const guideFiles = new Map(files);
        const file = "/guide/src/move.ts";
        guideFiles.set("/guide/package.json", JSON.stringify({ name: "guide", version: "0.0.0" }));
        guideFiles.set(file, `import { System, Vec3 } from "@adobe/ecs";
export const position = Symbol();
declare module "@adobe/ecs" { interface Components { [position]: { type: Vec3 } } }
export const move = System.create({ components: { with: [position] } }, row => { row[position] = Vec3.add(row[position], [1, 0, 0]); });
`);
        for (const path of files.keys()) if (path.startsWith(root)) guideFiles.set(`/node_modules/@adobe/ecs${path.slice(root.length)}`, files.get(path) ?? "");
        const { parse, strip } = await wasmHost();
        const ownCompiler = createMemoryCompiler({ files: guideFiles, packageRoot: "/node_modules/@adobe/ecs", parse, strip });
        const compiled = await ownCompiler.compile(file, guideFiles.get(file) ?? "", index => JSON.stringify(`kernel:${index}`));
        if ("failure" in compiled) throw new Error(compiled.failure);
        expect(compiled.code).toContain(`"guide@0.0.0/src/move.ts#position"`);
        expect(compiled.code).toContain(`"guide@0.0.0/src/move.ts#move"`);
        expect(compiled.code).toContain(`from "/node_modules/@adobe/ecs/dist/implementation/world/attach-kernel.js"`);
        expect(compiled.kernels).toHaveLength(1);
    });
});
