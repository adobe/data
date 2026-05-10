// © 2026 Adobe. MIT License. See /LICENSE for details.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { PersistenceBackend } from "./persistence-backend.js";

/**
 * Conformance suite for PersistenceBackend implementations. The factory
 * is invoked per test (returning a fresh backend) and the optional
 * teardown is invoked after each test.
 */
export const runPersistenceBackendConformance = (
    name: string,
    setup: () => Promise<{ backend: PersistenceBackend; cleanup?: () => Promise<void> }>,
): void => {
    describe(`PersistenceBackend conformance: ${name}`, () => {
        let backend: PersistenceBackend;
        let cleanup: (() => Promise<void>) | undefined;

        beforeEach(async () => {
            const created = await setup();
            backend = created.backend;
            cleanup = created.cleanup;
        });

        afterEach(async () => {
            if (cleanup) await cleanup();
        });

        test("open creates an empty file", async () => {
            const file = await backend.open("foo.bin");
            try {
                expect(await file.size()).toBe(0);
            } finally {
                await file.close();
            }
        });

        test("write then re-open round-trips contents", async () => {
            {
                const file = await backend.open("foo.bin");
                await file.writeAt(0, new Uint8Array([1, 2, 3]));
                await file.close();
            }
            {
                const file = await backend.open("foo.bin");
                try {
                    const read = await file.readAt(0, 3);
                    expect(Array.from(read)).toEqual([1, 2, 3]);
                } finally {
                    await file.close();
                }
            }
        });

        test("nested paths work", async () => {
            const file = await backend.open("a/b/c.bin");
            try {
                await file.writeAt(0, new Uint8Array([42]));
                expect(await file.size()).toBe(1);
            } finally {
                await file.close();
            }
        });

        test("list returns immediate children", async () => {
            for (const relPath of ["a/x.bin", "a/y.bin", "a/sub/z.bin", "b/q.bin"]) {
                const file = await backend.open(relPath);
                await file.writeAt(0, new Uint8Array([1]));
                await file.close();
            }
            const aChildren = [...(await backend.list("a"))].sort();
            expect(aChildren).toEqual(["sub", "x.bin", "y.bin"]);
            const root = [...(await backend.list("."))].sort();
            expect(root).toEqual(["a", "b"]);
        });

        test("remove deletes a file", async () => {
            const file = await backend.open("foo.bin");
            await file.writeAt(0, new Uint8Array([1]));
            await file.close();
            await backend.remove("foo.bin");
            const reopened = await backend.open("foo.bin");
            try {
                expect(await reopened.size()).toBe(0);
            } finally {
                await reopened.close();
            }
        });

        test("remove of non-existent file is a no-op", async () => {
            await expect(backend.remove("does/not/exist.bin")).resolves.toBeUndefined();
        });

        test("rename moves a file's contents", async () => {
            const file = await backend.open("from.bin");
            await file.writeAt(0, new Uint8Array([7, 8, 9]));
            await file.close();
            await backend.rename("from.bin", "to.bin");
            const renamed = await backend.open("to.bin");
            try {
                const read = await renamed.readAt(0, 3);
                expect(Array.from(read)).toEqual([7, 8, 9]);
            } finally {
                await renamed.close();
            }
        });

        test("rejects path traversal attempts", async () => {
            await expect(backend.open("../etc/passwd")).rejects.toThrow();
            await expect(backend.open("/etc/passwd")).rejects.toThrow();
        });
    });
};
