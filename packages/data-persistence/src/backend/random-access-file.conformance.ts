// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, test } from "vitest";
import { RandomAccessFile } from "./random-access-file.js";

/**
 * Conformance suite for RandomAccessFile implementations. Invoke from a
 * thin per-runtime test file with the appropriate factory:
 *
 *     // memory-file.test.ts
 *     runRandomAccessFileConformance("memory", () => createMemoryFile());
 *
 *     // node-fs-file.node.test.ts
 *     runRandomAccessFileConformance("node-fs", async () => {
 *         const tmp = await fs.mkdtemp(...);
 *         return createNodeFsFile(path.join(tmp, "f.bin"));
 *     });
 *
 *     // opfs-sync-file.browser.test.ts
 *     runRandomAccessFileConformance("opfs", async () => createOpfsSyncFile(...));
 *
 * All implementations must satisfy identical semantics.
 */
export const runRandomAccessFileConformance = (
    name: string,
    createFile: () => RandomAccessFile | Promise<RandomAccessFile>,
): void => {
    describe(`RandomAccessFile conformance: ${name}`, () => {
        test("size() of a new file is 0", async () => {
            const file = await createFile();
            try {
                expect(await file.size()).toBe(0);
            } finally {
                await file.close();
            }
        });

        test("appendAt grows the file and returns the new size", async () => {
            const file = await createFile();
            try {
                const newSize = await file.appendAt(new Uint8Array([1, 2, 3]));
                expect(newSize).toBe(3);
                expect(await file.size()).toBe(3);
            } finally {
                await file.close();
            }
        });

        test("writeAt then readAt round-trips at non-zero offset", async () => {
            const file = await createFile();
            try {
                const payload = new Uint8Array([10, 20, 30, 40]);
                await file.writeAt(8, payload);
                expect(await file.size()).toBe(12);
                const read = await file.readAt(8, 4);
                expect(Array.from(read)).toEqual([10, 20, 30, 40]);
            } finally {
                await file.close();
            }
        });

        test("writeAt grows the file and zero-fills the gap", async () => {
            const file = await createFile();
            try {
                await file.writeAt(4, new Uint8Array([99]));
                expect(await file.size()).toBe(5);
                const read = await file.readAt(0, 5);
                expect(Array.from(read)).toEqual([0, 0, 0, 0, 99]);
            } finally {
                await file.close();
            }
        });

        test("readAt past EOF returns a short buffer", async () => {
            const file = await createFile();
            try {
                await file.appendAt(new Uint8Array([1, 2, 3]));
                const read = await file.readAt(2, 10);
                expect(read.byteLength).toBe(1);
                expect(read[0]).toBe(3);
            } finally {
                await file.close();
            }
        });

        test("readAt entirely past EOF returns an empty buffer", async () => {
            const file = await createFile();
            try {
                const read = await file.readAt(10, 5);
                expect(read.byteLength).toBe(0);
            } finally {
                await file.close();
            }
        });

        test("truncate shrinks reported size and zeroes the freed range when grown back", async () => {
            const file = await createFile();
            try {
                await file.writeAt(0, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
                await file.truncate(4);
                expect(await file.size()).toBe(4);
                await file.truncate(8);
                const read = await file.readAt(0, 8);
                expect(Array.from(read)).toEqual([1, 2, 3, 4, 0, 0, 0, 0]);
            } finally {
                await file.close();
            }
        });

        test("multiple writeAt to disjoint ranges produce expected layout", async () => {
            const file = await createFile();
            try {
                await Promise.all([
                    file.writeAt(0, new Uint8Array([1, 2])),
                    file.writeAt(8, new Uint8Array([3, 4])),
                    file.writeAt(16, new Uint8Array([5, 6])),
                ]);
                expect(await file.size()).toBe(18);
                const read = await file.readAt(0, 18);
                expect(Array.from(read)).toEqual([
                    1, 2, 0, 0, 0, 0, 0, 0,
                    3, 4, 0, 0, 0, 0, 0, 0,
                    5, 6,
                ]);
            } finally {
                await file.close();
            }
        });

        test("operations after close() reject", async () => {
            const file = await createFile();
            await file.close();
            await expect(file.size()).rejects.toThrow();
        });

        test("readAt returns a copy, not a reference into the buffer", async () => {
            const file = await createFile();
            try {
                await file.writeAt(0, new Uint8Array([1, 2, 3]));
                const a = await file.readAt(0, 3);
                a[0] = 99;
                const b = await file.readAt(0, 3);
                expect(b[0]).toBe(1);
            } finally {
                await file.close();
            }
        });

        test("sync() does not throw and is idempotent", async () => {
            const file = await createFile();
            try {
                await file.sync();
                await file.appendAt(new Uint8Array([1]));
                await file.sync();
                await file.sync();
            } finally {
                await file.close();
            }
        });
    });
};
