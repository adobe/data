// © 2026 Adobe. MIT License. See /LICENSE for details.
import { instantiate } from '@oxc-parser/binding-wasm32-wasip1/workerd';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bindingParser } from './binding-parser.js';
import { loadParser } from './node.js';

const packages = fileURLToPath(new URL('../../../../', import.meta.url));

/** Every `.ts` file under `folder`, but in `node_modules`. */
const sourcesIn = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourcesIn(path);
    return entry.name.endsWith('.ts') ? [path] : [];
});

/** A program as JSON, the BigInt and regular expression values Vite's parser gives as `null`, as the binding's parser leaves them. */
const json = (program: unknown): string =>
    JSON.stringify(program, (_key, value: unknown) => (typeof value === 'bigint' || value instanceof RegExp ? null : value));

describe("the parser over oxc's WebAssembly binding", () => {
    it("gives the program Vite's parser gives, for this package's sources and the samples', odd text and text that doesn't parse", async () => {
        const wasm = readFileSync(createRequire(import.meta.url).resolve('@oxc-parser/binding-wasm32-wasip1/wasm'));
        const browser = bindingParser(await instantiate(WebAssembly.compile(wasm)));
        const node = await loadParser();
        const files = ['ecs-architecture', 'ecs-todo-vanillajs', 'ecs-particles-webgpu', 'ecs-transfers-canvas', 'ecs-gpu-views']
            .flatMap(name => sourcesIn(join(packages, name, 'src')))
            .map((path): readonly [string, string] => [relative(packages, path), readFileSync(path, 'utf8')]);
        files.push(
            ['odd.ts', "/** Ünïcödé, 🎉 and 中文 before the code. */\nexport const big = 10n ** 20n;\nexport const pattern = /a(?<b>c)+/giu;\nexport const text = `${'é'}🎉`;\n"],
            ['broken.ts', "import { a } from './a.js';\nexport const b = (;\n"],
        );
        expect(files.length).toBeGreaterThan(100);
        for (const [path, text] of files) expect(json(browser(path, text)), path).toBe(json(node(path, text)));
    });
});
