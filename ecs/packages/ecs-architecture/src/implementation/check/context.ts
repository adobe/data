// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Violation } from '../../violation.js';
import type { Graph, Settings } from '../graph.js';

/** What every rule reads, and how it reports a violation. */
export type Context = {
    readonly graph: Graph;
    readonly settings: Settings;
    readonly violate: (file: string, rule: string, problem: string, fix: string) => void;
};

export const createContext = (graph: Graph, settings: Settings): { readonly context: Context; readonly violations: Violation[] } => {
    const violations: Violation[] = [];
    return { context: { graph, settings, violate: (file, rule, problem, fix) => violations.push({ file, rule, problem, fix }) }, violations };
};

/** `clear-completed` as `clearCompleted`. */
export const camel = (kebab: string): string => kebab.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

/** A path from `from`'s folder to `to`, starting `./` or `../`, as an import names it. */
export const relativeSpec = (relativePath: string): string => (relativePath.startsWith('.') ? relativePath : `./${relativePath}`);
