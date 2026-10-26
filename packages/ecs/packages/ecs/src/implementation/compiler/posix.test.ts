// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { posix as node } from 'node:path';
import { expect, test } from 'vitest';
import * as posix from './posix.js';

const paths = [
    "", "/", "//", "///", ".", "..", "a", "a/", "a/b", "/a", "/a/", "/a/b", "/a/b/", "//a", "//a/b", "a//b", "/a//b//",
    "./a", "../a", "a/./b", "a/../b", "/a/../../b", "a/../../b", "../../a/b", "/a/b/../c/./d", "C:", "C:/", "C:/a/b",
    "file.ts", "/x/file.d.ts", ".hidden", "/x/.hidden", "a.", "a..", "/a/b.c/d", "..b", "a.b.c", "/a/b/.", "/a/b/..",
    "/node_modules/@adobe/ecs/dist/index.js", "guide/src/01-resources.test.ts", "/a/b?x", "a\\b",
];

test("dirname, basename, extname and isAbsolute match node's posix ones", () => {
    for (const path of paths) {
        expect([path, posix.dirname(path)]).toEqual([path, node.dirname(path)]);
        expect([path, posix.basename(path)]).toEqual([path, node.basename(path)]);
        expect([path, posix.extname(path)]).toEqual([path, node.extname(path)]);
        expect([path, posix.isAbsolute(path)]).toEqual([path, node.isAbsolute(path)]);
    }
});

test("resolve and relative match node's posix ones for absolute paths, and for relative ones that stay below the directory they start from", () => {
    const absolute = paths.filter(path => path.startsWith("/"));
    for (const from of absolute) {
        expect([from, posix.resolve(from)]).toEqual([from, node.resolve(from)]);
        for (const to of paths) {
            expect([from, to, posix.resolve(from, to)]).toEqual([from, to, node.resolve(from, to)]);
            if (to.startsWith("/")) expect([from, to, posix.relative(from, to)]).toEqual([from, to, node.relative(from, to)]);
        }
    }
    const relatives = paths.filter(path => !path.startsWith("/") && !path.includes(".."));
    for (const from of relatives) for (const to of relatives) expect([from, to, posix.relative(from, to)]).toEqual([from, to, node.relative(from, to)]);
});
