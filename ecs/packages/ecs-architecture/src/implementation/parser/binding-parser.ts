// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ESTree } from 'vite';
import type { Parse } from '../syntax.js';

/** What oxc's parser binding gives, by the fields read here: its program as ESTree JSON. */
export type ParserBinding = {
    readonly parseSync: (filename: string, source: string, options: { readonly lang: 'ts' }) => { readonly program: unknown };
};

/** Whether a value is a program, by the fields every program has. */
const isProgram = (value: unknown): value is ESTree.Program =>
    typeof value === 'object' && value !== null && Reflect.get(value, 'type') === 'Program' && Array.isArray(Reflect.get(value, 'body'));

/**
 * The parser over oxc's binding, reading its JSON as Vite's does, but for the values of BigInt and regular expression
 * literals, which stay `null`: the checks read no literal but strings.
 */
export const bindingParser = (binding: ParserBinding): Parse => (path, text) => {
    const json = binding.parseSync(path, text, { lang: 'ts' }).program;
    // The binding's declarations type the program as a node, but it's the JSON its wrapper parses.
    if (typeof json !== 'string') throw new Error(`the parser gave no program JSON for ${path}`);
    const parsed: unknown = JSON.parse(json);
    const program: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'node') : undefined;
    if (!isProgram(program)) throw new Error(`the parser gave no program for ${path}`);
    return program;
};
