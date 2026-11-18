// © 2026 Adobe. MIT License. See /LICENSE for details.
import { dirname, join, normalize } from '../path.js';
import { nameOf } from '../syntax.js';
import { isEntry } from '../graph.js';
import type { Context } from './context.js';
import type { Imports } from './imports.js';


/** The comment a root file holds to keep an export nothing outside its component uses. */
export const keepUnused = 'component-check: unused-export-ok';

/** Every public export is used outside its component. */
export const checkExports = ({ graph, violate }: Context, { uses }: Imports): void => {
    /** The names a component's index re-exports by name from its parts, each with the part and its name there. */
    const partExports = (component: string): Map<string, { readonly part: string; readonly name: string }> => {
        const parts = new Map<string, { readonly part: string; readonly name: string }>();
        for (const statement of graph.moduleOf(`${component}/index.ts`).program.body) {
            if (statement.type !== 'ExportNamedDeclaration' || statement.source === null) continue;
            const part = normalize(join(component, dirname(statement.source.value)));
            for (const specifier of statement.specifiers) parts.set(nameOf(specifier.exported), { part, name: nameOf(specifier.local) });
        }
        return parts;
    };
    const usedOutside = (component: string, name: string): boolean => {
        if ((uses.get(component) ?? []).some(use => !use.importer.startsWith(`${component}/`) && (use.names.includes(name) || use.names.includes('*')))) return true;
        // A parent component passing on its part, or a parent feature's layer passing on its sub-feature's.
        for (const outer of passersOn(component)) {
            for (const [exposed, from] of partExports(outer)) if (from.part === component && from.name === name && usedOutside(outer, exposed)) return true;
            if (passesAllOn(outer, component) && usedOutside(outer, name)) return true;
        }
        return false;
    };
    const reExported = (outer: string): string[] => graph.moduleOf(`${outer}/index.ts`).program.body
        .flatMap(statement => (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') && statement.source !== null
            ? [normalize(join(outer, dirname(statement.source.value)))] : []);
    const passersOn = (component: string): string[] => graph.components.filter(outer => outer !== component && reExported(outer).includes(component));
    const passesAllOn = (outer: string, component: string): boolean => graph.moduleOf(`${outer}/index.ts`).program.body
        .some(statement => statement.type === 'ExportAllDeclaration' && statement.exported === null && normalize(join(outer, dirname(statement.source.value))) === component);
    // What an entry imports straight from its own layer's root is used: the entry is that layer's consumer.
    const enteredFiles = new Set<string>();
    for (const file of graph.tsPaths) {
        if (!isEntry(file)) continue;
        for (const { spec } of graph.importsOf(file)) {
            const target = spec.startsWith('.') ? graph.resolve(file, spec) : undefined;
            if (target !== undefined) enteredFiles.add(target);
        }
    }
    for (const component of graph.components) {
        const declared: { readonly name: string; readonly file: string }[] = [];
        for (const statement of graph.moduleOf(`${component}/index.ts`).program.body) {
            if (statement.type !== 'ExportAllDeclaration' || statement.exported !== null) continue;
            const file = join(component, `${statement.source.value.slice(2, -3)}.ts`);
            if (graph.files.has(file)) for (const name of graph.exportsOf(file)) declared.push({ name, file });
        }
        for (const name of partExports(component).keys()) declared.push({ name, file: `${component}/index.ts` });
        for (const { name, file } of declared) {
            if (usedOutside(component, name) || enteredFiles.has(file) || graph.textOf(file).includes(keepUnused)) continue;
            violate(file, 'unused-export', `\`${name}\` is exported by \`${component}\` but nothing outside the component imports it.`,
                `Make it private and drop it from index.ts: move it into the folder of the one declaration using it, named for that declaration (system.<name>/), or into ${component}/internal/ when several use it. If it must stay public (a type for outside implementers), write "// ${keepUnused} <reason>" in its file.`);
        }
    }
};
