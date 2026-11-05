// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LoadParser } from '../syntax.js';
import { once } from './once.js';

/** The app's Vite's parser, as `@adobe/ecs` compiles with it. */
export const loadParser: LoadParser = once(async () => {
    const { parseSync } = await import('vite');
    return (path, text) => parseSync(path, text, { lang: 'ts' }).program;
});
