// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { createLinker, isPending, resolveExport, type Link, type LinkHost } from './link.js';
import { estreeOf } from './estree.js';

const parse = (code: string) => estreeOf(parseAst(code));

/** Resolves `./name.js` to `/name.js`, and loads from `files`, which tests may change. */
const host = (files: Map<string, string>, gate: Promise<void> = Promise.resolve()): LinkHost => ({
    resolve: async specifier => `/${specifier.replace(/^\.\//, "")}`,
    load: async file => {
        const code = files.get(file);
        await gate;
        return code === undefined ? { error: `${file} can't be read` } : { code };
    },
});

/** Resolves an export, loading what it needs. */
const resolved = async (link: Link, file: string, name: string) => {
    for (;;) {
        try {
            return resolveExport(link, file, name);
        } catch (error) {
            if (!isPending(error)) throw error;
            await error.pending;
        }
    }
};

describe("linker", () => {
    test("reports why an export * target failed when nothing else exports the name", async () => {
        const files = new Map([["/barrel.js", "export * from './missing.js';"]]);
        expect(await resolved(createLinker(host(files), parse), "/barrel.js", "f")).toEqual({ kind: "error", error: "/missing.js can't be read" });
    });

    test("an ambiguous export * deeper down is ambiguous", async () => {
        const files = new Map([
            ["/top.js", "export * from './both.js';\nexport * from './c.js';"],
            ["/c.js", "export const f = 3;"],
            ["/both.js", "export * from './a.js';\nexport * from './b.js';"],
            ["/a.js", "export const f = 1;"],
            ["/b.js", "export const f = 2;"],
        ]);
        expect(await resolved(createLinker(host(files), parse), "/top.js", "f")).toMatchObject({ kind: "error", error: "f is exported by more than one export * of /both.js" });
    });

    test("a default class export is a class, not a missing export", async () => {
        const files = new Map([["/shape.js", "export default class Shape {}"]]);
        const result = await resolved(createLinker(host(files), parse), "/shape.js", "default");
        expect(result.kind === "binding" ? result.binding.kind : result.kind).toBe("other");
    });

    test("a file changed while loading is loaded again", async () => {
        const files = new Map([["/value.js", "export const v = 1;"]]);
        let open = (): void => {};
        const gate = new Promise<void>(resolve => { open = resolve; });
        const linker = createLinker(host(files, gate), parse);
        let first: unknown;
        try {
            linker.module("/value.js");
        } catch (error) {
            first = error;
        }
        files.set("/value.js", "export const w = 2;");
        linker.forget("/value.js", false);
        open();
        if (isPending(first)) await first.pending;
        expect(await resolved(linker, "/value.js", "w")).toMatchObject({ kind: "binding", name: "w" });
    });
});
