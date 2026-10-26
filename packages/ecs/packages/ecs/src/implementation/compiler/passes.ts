// © 2026 Adobe. MIT License. See /LICENSE for details.
import { archetypeInsertions } from './archetypes.js';
import { augmentationInsertions, type AugmentationHost } from './augmentations.js';
import type { Failure } from './failure.js';
import { inputInsertions, type InputHost } from './input-schemas.js';
import { insertInto, type SourceMap } from './source-map.js';
import { moduleOf } from './type-schemas.js';

/** Whether a module may declare keys, create systems or list keys `as const`: only such a module has anything for the input pass. */
export const mayHaveInput = (code: string): boolean =>
    (code.includes("declare module") && code.includes("@adobe/ecs")) || (code.includes("System") && code.includes(".create(")) || code.includes("as const");

/**
 * What the input pass gives a module: its code with the registrations, input schemas and archetype indexes inserted,
 * null when it inserted nothing, or why it failed, and the other files it read, which a change to makes it run again.
 */
export type InputPass = {
    readonly result: { readonly code: string; readonly map: SourceMap } | { readonly failure: Failure } | null;
    readonly dependencies: readonly string[];
};

/**
 * Registers the keys `declare module "@adobe/ecs"` blocks declare (`augmentations.ts`), passes each system's
 * `create` the schema of its body's input (`input-schemas.ts`), and gives lists of keys declared `as const` their
 * indexes (`archetypes.ts`), from a TypeScript module's source, before its types are stripped.
 */
export const inputPass = async (code: string, file: string, host: InputHost & AugmentationHost): Promise<InputPass> => {
    const module = moduleOf(file, code, host.parse(code, file));
    const results = [await augmentationInsertions(module, host), await inputInsertions(module, host), archetypeInsertions(module)].filter(result => result !== null);
    const dependencies = [...new Set(results.flatMap(result => result.dependencies))].filter(dependency => dependency !== file);
    for (const result of results) if ("failure" in result) return { result: { failure: result.failure }, dependencies };
    const insertions = results.flatMap(result => "insertions" in result ? result.insertions : []);
    return { result: insertions.length === 0 ? null : insertInto(code, insertions, file), dependencies };
};
