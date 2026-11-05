// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const field = (name: string): Record<string, unknown> => {
    const value: unknown = typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, name) : undefined;
    return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
};

describe('the package manifest', () => {
    it("parses with the app's Vite, as @adobe/ecs compiles with it, and needs no TypeScript at runtime", () => {
        expect(field('peerDependencies')).toHaveProperty('vite', '^8.0.0');
        expect(field('peerDependencies')).not.toHaveProperty('typescript');
        expect(field('dependencies')).not.toHaveProperty('typescript');
    });
});
