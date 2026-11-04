// © 2026 Adobe. MIT License. See /LICENSE for details.
import { dirname, join, normalize } from '../path.js';
import ts from 'typescript';
import type { Context } from './context.js';
import type { Imports } from './imports.js';


/** The comment a root file holds to keep an export nothing outside its component uses. */
export const keepUnused = 'component-check: unused-export-ok';

/** Every public export is used outside its component. */
export const checkExports = ({ graph, violate }: Context, { uses }: Imports): void => {
    /** The names a component's index re-exports by name from its parts, each with the part and its name there. */
    const partExports = (component: string): Map<string, { readonly part: string; readonly name: string }> => {
        const parts = new Map<string, { readonly part: string; readonly name: string }>();
        for (const statement of graph.moduleOf(`${component}/index.ts`).statements) {
            if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const clause = statement.exportClause;
            if (clause === undefined || !ts.isNamedExports(clause)) continue;
            const part = normalize(join(component, dirname(statement.moduleSpecifier.text)));
            for (const element of clause.elements) parts.set(element.name.text, { part, name: (element.propertyName ?? element.name).text });
        }
        return parts;
    };
    const usedOutside = (component: string, name: string): boolean => {
        if ((uses.get(component) ?? []).some(use => !use.importer.startsWith(`${component}/`) && (use.names.includes(name) || use.names.includes('*')))) return true;
        const parent = graph.componentOf(component);
        if (parent === undefined) return false;
        for (const [exposed, from] of partExports(parent)) if (from.part === component && from.name === name && usedOutside(parent, exposed)) return true;
        return false;
    };
    for (const component of graph.components) {
        const declared: { readonly name: string; readonly file: string }[] = [];
        for (const statement of graph.moduleOf(`${component}/index.ts`).statements) {
            if (!ts.isExportDeclaration(statement) || statement.exportClause !== undefined || statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const file = join(component, `${statement.moduleSpecifier.text.slice(2, -3)}.ts`);
            if (graph.files.has(file)) for (const name of graph.exportsOf(file)) declared.push({ name, file });
        }
        for (const name of partExports(component).keys()) declared.push({ name, file: `${component}/index.ts` });
        for (const { name, file } of declared) {
            if (name === 'systems' || usedOutside(component, name) || graph.textOf(file).includes(keepUnused)) continue;
            violate(file, 'unused-export', `\`${name}\` is exported by \`${component}\` but nothing outside the component imports it.`,
                `Move its declaration into a private folder of the component, a folder without an index.ts such as ${component}/shared/, and drop it from index.ts. If it must stay public (a finalizer registered by being imported, a type for outside implementers), write "// ${keepUnused} <reason>" in its file.`);
        }
    }
};
