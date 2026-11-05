// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, relative } from '../path.js';
import type { ESTree } from 'vite';
import { isTest, type Graph } from '../graph.js';
import { exportedVariables, isLocal, nameOf, textOf, topLevelNames, walk, type Module, type Node } from '../syntax.js';
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
    for (const statement of module.program.body) {
        if (statement.type !== 'ImportDeclaration') continue;
        for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportSpecifier' && nameOf(specifier.imported) === 'systems') aliases.set(specifier.local.name, statement.source.value);
        }
    }
    const declaration = exportedVariables(module).flatMap(each => each.declarations).find(each => each.id.type === 'Identifier' && each.id.name === 'systems');
    const listed = new Set<string>();
    const spread = new Set<string>();
    if (declaration?.init?.type === 'ArrayExpression') {
        for (const element of declaration.init.elements) {
            if (element?.type === 'SpreadElement' && element.argument.type === 'Identifier') spread.add(aliases.get(element.argument.name) ?? element.argument.name);
            else if (element?.type === 'Identifier') listed.add(element.name);
        }
    }
    const annotation = declaration?.id.typeAnnotation;
    return { type: annotation === undefined || annotation === null ? undefined : textOf(module, annotation.typeAnnotation).replace(/\s+/g, ' '), listed, spread };
};

/** The declaration a module's export `name` is, through its re-exports. */
const exportOrigin = (graph: Graph, file: string, name: string, seen = new Set<string>()): Origin | undefined => {
    const key = `${file}#${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (graph.exportsOf(file).includes(name)) {
        // `export { local as name }` names a local or an import of its own.
        for (const statement of graph.moduleOf(file).program.body) {
            if (statement.type !== 'ExportNamedDeclaration' || statement.source !== null) continue;
            const specifier = statement.specifiers.find(each => nameOf(each.exported) === name);
            if (specifier !== undefined) return bindingOrigin(graph, file, nameOf(specifier.local), seen);
        }
        return { file, name };
    }
    for (const statement of graph.moduleOf(file).program.body) {
        if (statement.type === 'ExportAllDeclaration') {
            const target = statement.exported === null ? graph.resolve(file, statement.source.value) : undefined;
            const found = target === undefined ? undefined : exportOrigin(graph, target, name, seen);
            if (found !== undefined) return found;
        } else if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) {
            const target = graph.resolve(file, statement.source.value);
            const specifier = statement.specifiers.find(each => nameOf(each.exported) === name);
            if (target !== undefined && specifier !== undefined) return exportOrigin(graph, target, nameOf(specifier.local), seen);
        }
    }
    return undefined;
};

/** The declaration a name bound in a module is: one of its own, or what it imports it from. */
const bindingOrigin = (graph: Graph, file: string, local: string, seen = new Set<string>()): Origin | undefined => {
    for (const statement of graph.moduleOf(file).program.body) {
        if (statement.type !== 'ImportDeclaration') continue;
        const specifier = statement.specifiers.find((each): each is ESTree.ImportSpecifier => each.type === 'ImportSpecifier' && each.local.name === local);
        if (specifier === undefined) continue;
        const target = graph.resolve(file, statement.source.value);
        return target === undefined ? undefined : exportOrigin(graph, target, nameOf(specifier.imported), seen);
    }
    return { file, name: local };
};

/** The declaration `name` is in the module a namespace import, `import * as namespace`, binds. */
const namespaceOrigin = (graph: Graph, file: string, namespace: string, name: string): Origin | undefined => {
    for (const statement of graph.moduleOf(file).program.body) {
        if (statement.type !== 'ImportDeclaration' || !statement.specifiers.some(each => each.type === 'ImportNamespaceSpecifier' && each.local.name === namespace)) continue;
        const target = graph.resolve(file, statement.source.value);
        return target === undefined ? undefined : exportOrigin(graph, target, name);
    }
    return undefined;
};

/** Whether a node reads a member by its name: `a.b`. */
const isMember = (node: Node): node is ESTree.StaticMemberExpression => node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier';

/** Whether an expression is `@adobe/ecs`'s `System`: imported under any name, a namespace's member, or `System` unbound. */
const isSystem = (module: Module, expression: Node): boolean => {
    for (const statement of module.program.body) {
        if (statement.type !== 'ImportDeclaration' || statement.source.value !== '@adobe/ecs') continue;
        for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier' && isMember(expression) && expression.object.type === 'Identifier'
                && expression.object.name === specifier.local.name && expression.property.name === 'System') return true;
            if (specifier.type === 'ImportSpecifier' && expression.type === 'Identifier' && specifier.local.name === expression.name
                && nameOf(specifier.imported) === 'System') return true;
        }
    }
    return expression.type === 'Identifier' && expression.name === 'System' && !topLevelNames(module).has('System');
};

/**
 * The systems something runs: those listed in a `systems` list or property, members of a composite
 * (`System.create([...])`), and those passed to a `run` or an `add`, each as the declaration it names.
 */
const runSystems = (graph: Graph): Set<string> => {
    const reached = new Set<string>();
    const reach = (module: Module, file: string, expression: Node): void => {
        const origin = expression.type === 'Identifier' ? (isLocal(module, expression, expression.name) ? undefined : bindingOrigin(graph, file, expression.name))
            : isMember(expression) && expression.object.type === 'Identifier' && !isLocal(module, expression, expression.object.name)
                ? namespaceOrigin(graph, file, expression.object.name, expression.property.name) : undefined;
        if (origin !== undefined) reached.add(`${origin.file}#${origin.name}`);
    };
    const reachAll = (module: Module, file: string, list: Node): void => {
        if (list.type !== 'ArrayExpression') return;
        for (const element of list.elements) if (element !== null) reach(module, file, element.type === 'SpreadElement' ? element.argument : element);
    };
    for (const file of graph.tsPaths) {
        const module = graph.moduleOf(file);
        walk(module, node => {
            if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.id.name === 'systems' && node.init !== null) reachAll(module, file, node.init);
            else if (node.type === 'Property' && module.parents.get(node)?.type === 'ObjectExpression' && node.kind === 'init' && !node.method && !node.shorthand && !node.computed
                && (node.key.type === 'Identifier' ? node.key.name : node.key.type === 'Literal' ? node.key.value : undefined) === 'systems') reachAll(module, file, node.value);
            else if (node.type === 'CallExpression' && isMember(node.callee)) {
                const method = node.callee.property.name;
                const [first] = node.arguments;
                if (first === undefined) return;
                if (method === 'run' || method === 'add') reach(module, file, first);
                else if (method === 'create' && isSystem(module, node.callee.object)) reachAll(module, file, first);
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
