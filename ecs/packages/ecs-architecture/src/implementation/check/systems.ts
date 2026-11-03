// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, relative } from '../path.js';
import ts from 'typescript';
import { isTest, type Graph } from '../graph.js';
import { isExported, isLocal, topLevelNames, walk } from '../syntax.js';
import { camel, relativeSpec, type Context } from './context.js';
import type { Imports } from './imports.js';


/** A declaration: the file declaring it and its name there. */
type Origin = { readonly file: string; readonly name: string };

/** What a component's `constant.systems.ts` says: how `systems` is typed, the names it lists and the parts it spreads. */
type Listing = { readonly type: string | undefined; readonly listed: ReadonlySet<string>; readonly spread: ReadonlySet<string> };

const systemsFile = 'constant.systems.ts';

const listingOf = (graph: Graph, component: string): Listing | undefined => {
    const path = `${component}/${systemsFile}`;
    if (!graph.files.has(path)) return undefined;
    const module = graph.moduleOf(path);
    const aliases = new Map<string, string>();
    let declaration: ts.VariableDeclaration | undefined;
    for (const statement of module.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            const bindings = statement.importClause?.namedBindings;
            if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
            for (const element of bindings.elements) if ((element.propertyName ?? element.name).text === 'systems') aliases.set(element.name.text, statement.moduleSpecifier.text);
        } else if (ts.isVariableStatement(statement) && isExported(statement)) {
            declaration ??= statement.declarationList.declarations.find(each => ts.isIdentifier(each.name) && each.name.text === 'systems');
        }
    }
    const listed = new Set<string>();
    const spread = new Set<string>();
    if (declaration?.initializer !== undefined && ts.isArrayLiteralExpression(declaration.initializer)) {
        for (const element of declaration.initializer.elements) {
            if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) spread.add(aliases.get(element.expression.text) ?? element.expression.text);
            else if (ts.isIdentifier(element)) listed.add(element.text);
        }
    }
    return { type: declaration?.type?.getText(module).replace(/\s+/g, ' '), listed, spread };
};

/** The declaration a module's export `name` is, through its re-exports. */
const exportOrigin = (graph: Graph, file: string, name: string, seen = new Set<string>()): Origin | undefined => {
    const key = `${file}#${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (graph.exportsOf(file).includes(name)) {
        // `export { local as name }` names a local or an import of its own.
        for (const statement of graph.moduleOf(file).statements) {
            if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier !== undefined || statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) continue;
            const element = statement.exportClause.elements.find(each => each.name.text === name);
            if (element !== undefined) return bindingOrigin(graph, file, (element.propertyName ?? element.name).text, seen);
        }
        return { file, name };
    }
    for (const statement of graph.moduleOf(file).statements) {
        if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const target = graph.resolve(file, statement.moduleSpecifier.text);
        if (target === undefined) continue;
        const clause = statement.exportClause;
        if (clause === undefined) {
            const found = exportOrigin(graph, target, name, seen);
            if (found !== undefined) return found;
        } else if (ts.isNamedExports(clause)) {
            const element = clause.elements.find(each => each.name.text === name);
            if (element !== undefined) return exportOrigin(graph, target, (element.propertyName ?? element.name).text, seen);
        }
    }
    return undefined;
};

/** The declaration a name bound in a module is: one of its own, or what it imports it from. */
const bindingOrigin = (graph: Graph, file: string, local: string, seen = new Set<string>()): Origin | undefined => {
    for (const statement of graph.moduleOf(file).statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
        const element = bindings.elements.find(each => each.name.text === local);
        if (element === undefined) continue;
        const target = graph.resolve(file, statement.moduleSpecifier.text);
        return target === undefined ? undefined : exportOrigin(graph, target, (element.propertyName ?? element.name).text, seen);
    }
    return { file, name: local };
};

/** The declaration `name` is in the module a namespace import, `import * as namespace`, binds. */
const namespaceOrigin = (graph: Graph, file: string, namespace: string, name: string): Origin | undefined => {
    for (const statement of graph.moduleOf(file).statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings === undefined || !ts.isNamespaceImport(bindings) || bindings.name.text !== namespace) continue;
        const target = graph.resolve(file, statement.moduleSpecifier.text);
        return target === undefined ? undefined : exportOrigin(graph, target, name);
    }
    return undefined;
};

/** Whether an expression is `@adobe/ecs`'s `System`: imported under any name, a namespace's member, or `System` unbound. */
const isSystem = (module: ts.SourceFile, expression: ts.Expression): boolean => {
    for (const statement of module.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== '@adobe/ecs') continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings === undefined) continue;
        if (ts.isNamespaceImport(bindings)) {
            if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === bindings.name.text && expression.name.text === 'System') return true;
            continue;
        }
        if (ts.isIdentifier(expression) && bindings.elements.some(element => element.name.text === expression.text && (element.propertyName ?? element.name).text === 'System')) return true;
    }
    return ts.isIdentifier(expression) && expression.text === 'System' && !topLevelNames(module).has('System');
};

/**
 * The systems something runs: those listed in a `systems` list or property, members of a composite
 * (`System.create([...])`), and those passed to a `run` or an `add`, each as the declaration it names.
 */
const runSystems = (graph: Graph): Set<string> => {
    const reached = new Set<string>();
    const reach = (file: string, expression: ts.Expression): void => {
        const origin = ts.isIdentifier(expression) ? (isLocal(expression, expression.text) ? undefined : bindingOrigin(graph, file, expression.text))
            : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && !isLocal(expression, expression.expression.text)
                ? namespaceOrigin(graph, file, expression.expression.text, expression.name.text) : undefined;
        if (origin !== undefined) reached.add(`${origin.file}#${origin.name}`);
    };
    const reachAll = (file: string, list: ts.Expression): void => {
        if (!ts.isArrayLiteralExpression(list)) return;
        for (const element of list.elements) reach(file, ts.isSpreadElement(element) ? element.expression : element);
    };
    for (const file of graph.tsPaths) {
        walk(graph.moduleOf(file), node => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'systems' && node.initializer !== undefined) reachAll(file, node.initializer);
            else if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === 'systems') reachAll(file, node.initializer);
            else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const method = node.expression.name.text;
                const [first] = node.arguments;
                if (first === undefined) return;
                if (method === 'run' || method === 'add') reach(file, first);
                else if (method === 'create' && isSystem(graph.moduleOf(file), node.expression.expression)) reachAll(file, first);
            }
        });
    }
    return reached;
};

/** Every model and view exports its systems; a parent spreads its parts'; nothing declares a system nothing runs. */
export const checkSystems = ({ graph, settings, violate }: Context): void => {
    const hasSystems = (component: string): boolean => {
        const layer = graph.layerOf(component);
        return layer !== undefined && settings.systems.includes(layer);
    };
    for (const component of graph.components) {
        const layer = graph.layerOf(component);
        const own = listingOf(graph, component);
        const parent = graph.componentOf(component);
        if (parent === undefined && hasSystems(component) && own === undefined) {
            violate(`${component}/${systemsFile}`, 'systems-export', `${layer} \`${component}\` has no ${systemsFile}.`,
                `Every ${settings.systems.join(' and ')} exports \`systems\`, the systems the world adds (empty if none): export const systems: readonly System[] = [a, b, ...part];`);
        }
        if (own !== undefined && own.type !== 'readonly System[]') {
            violate(`${component}/${systemsFile}`, 'systems-export', '`systems` must be declared `export const systems: readonly System[] = [...]`.',
                'Type it readonly System[], so a parent can spread it.');
        }
        if (own === undefined || parent === undefined) continue;
        const spec = `./${relative(parent, component)}/index.js`;
        if (listingOf(graph, parent)?.spread.has(spec) === true) continue;
        const alias = camel(basename(component));
        violate(`${parent}/${systemsFile}`, 'systems-spread', `\`${parent}\` doesn't spread the systems of its part \`${relative(parent, component)}\`.`,
            `In ${parent}/${systemsFile}: import { systems as ${alias} } from '${spec}'; and spread ...${alias} into systems.`);
    }
    const reached = runSystems(graph);
    for (const file of graph.tsPaths) {
        const component = graph.componentOf(file);
        if (component === undefined || !hasSystems(component) || !/^system\.[a-z0-9-]+\.ts$/.test(basename(file))) continue;
        const name = graph.exportsOf(file)[0];
        if (name === undefined || reached.has(`${file}#${name}`)) continue;
        violate(file, 'unlisted-system', `system \`${name}\` isn't in a \`systems\` list, a composite, or passed to run or add, so nothing runs it.`,
            `Add ${name} to systems in ${graph.topOf(component)}/${systemsFile} (or the part's) if the world runs it each tick; for a one-off, call world.run(${name}) where it's needed.`);
    }
};

/** An app that lists layers' systems lists those of the layers they depend on, too. */
export const checkApps = ({ graph, settings, violate }: Context, { edges }: Imports): void => {
    const outer = graph.components.filter(component => graph.componentOf(component) === undefined);
    const outerSet = new Set(outer);
    const withSystems = new Set(outer.filter(component => {
        const layer = graph.layerOf(component);
        return layer !== undefined && settings.systems.includes(layer);
    }));
    const listsAny = (component: string): boolean => {
        const listing = listingOf(graph, component);
        return listing !== undefined && listing.listed.size + listing.spread.size > 0;
    };
    const dependsOn = new Map<string, Set<string>>();
    for (const [from, targets] of edges) {
        for (const to of targets) {
            const [a, b] = [graph.topOf(from), graph.topOf(to)];
            if (a === b) continue;
            let set = dependsOn.get(a);
            if (set === undefined) dependsOn.set(a, set = new Set());
            set.add(b);
        }
    }
    /** The layer whose index an import from `from` names, if it's one of `among`. */
    const layerImported = (from: string, spec: string, among: ReadonlySet<string>): string | undefined => {
        const target = graph.resolve(from, spec);
        return target !== undefined && basename(target) === 'index.ts' && among.has(dirname(target)) ? dirname(target) : undefined;
    };
    /** The layer whose systems an import of `systems` in a layer's root file names: another's index, or its own list. */
    const systemsImported = (from: string, spec: string): string | undefined => {
        const target = graph.resolve(from, spec);
        const component = target === undefined ? undefined : graph.componentOf(target);
        if (target === undefined || component === undefined) return undefined;
        const layer = graph.topOf(component);
        return withSystems.has(layer) && (target === `${layer}/index.ts` || target === `${component}/${systemsFile}`) ? layer : undefined;
    };
    /** The layers whose systems each app lists: an app is a folder of an apps folder, and any other file is one of its own. */
    const listing = new Map<string, { readonly file: string; readonly layers: Set<string> }>();
    for (const file of graph.tsPaths) {
        if (graph.componentOf(file) !== undefined || isTest(file)) continue;
        const listed = new Set<string>();
        for (const { spec, typeOnly, values: names } of graph.importsOf(file)) {
            if (!spec.startsWith('.') || typeOnly) continue;
            const layer = layerImported(file, spec, outerSet);
            if (layer === undefined) continue;
            if (names.includes('systems') && withSystems.has(layer)) listed.add(layer);
            // A plugin, or anything else a layer exports, that lists layers' systems covers those layers.
            for (const root of graph.rootFiles(layer)) {
                if (!graph.exportsOf(root).some(name => names.includes(name))) continue;
                for (const inner of graph.importsOf(root)) {
                    if (!inner.spec.startsWith('.') || inner.typeOnly || !inner.values.includes('systems')) continue;
                    const covered = systemsImported(root, inner.spec);
                    if (covered !== undefined) listed.add(covered);
                }
            }
        }
        if (listed.size === 0) continue;
        const app = graph.appOf(file) ?? file;
        const entry = listing.get(app);
        if (entry === undefined) listing.set(app, { file, layers: listed });
        else for (const layer of listed) entry.layers.add(layer);
    }
    for (const { file, layers: listed } of listing.values()) {
        const reach = new Set(listed);
        for (const layer of reach) for (const next of dependsOn.get(layer) ?? []) reach.add(next);
        for (const layer of [...reach].sort()) {
            if (listed.has(layer) || !withSystems.has(layer) || !listsAny(layer)) continue;
            violate(file, 'app-misses-systems', `lists the systems of layers that depend on \`${layer}\` but not its own, which run what they read or write.`,
                `Import \`systems\` from '${relativeSpec(relative(dirname(file), `${layer}/index.js`))}' and add it to the world, or, if this app leaves the layer out on purpose, stop listing the layers that need it.`);
        }
    }
};
