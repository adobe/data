// © 2026 Adobe. MIT License. See /LICENSE for details.

export type Compiler = never;

/**
 * The build's compiler: `Compiler.plugin()` in an application's Vite config, `Compiler.plugin({ library: true })` in a
 * library's.
 */
export * as Compiler from './public.js';
