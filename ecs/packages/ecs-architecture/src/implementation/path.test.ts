// © 2026 Adobe. MIT License. See /LICENSE for details.
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { basename, dirname, join, normalize, relative } from './path.js';

describe('posix paths', () => {
    it('match node\'s for the paths the checks name', () => {
        const paths = ['a/b/c.ts', 'a/b/../c.ts', 'a', 'a/b/', 'a/./b', '../a/b', 'x/../../y', '.'];
        for (const path of paths) {
            expect([path, dirname(path), basename(path)]).toEqual([path, posix.dirname(path), posix.basename(path)]);
            expect([path, normalize(path)]).toEqual([path, posix.normalize(path).replace(/(?<=.)\/$/, '')]);
        }
        expect(join('a/b', '../c/index.js')).toBe(posix.join('a/b', '../c/index.js'));
        for (const [from, to] of [['a/b', 'a/c/d'], ['a', 'a/b'], ['a/b', 'a'], ['x/y', 'z']] as const) expect(relative(from, to)).toBe(posix.relative(from, to));
    });
});
