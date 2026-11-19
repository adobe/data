// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, relative } from '../path.js';
import type { ESTree } from 'vite';
import { isEntry, isTest, isTestFeature, isWithin, type Graph } from '../graph.js';
import { declarationOf, declaredBy, exportedVariables, isLocal, nameOf, namesOnly, textOf, topLevelNames, walk, type Module, type Node } from '../syntax.js';
import { camel, relativeSpec, type Context } from './context.js';
import { keepUnused } from './exports.js';
import type { Imports } from './imports.js';


/** A declaration: the file declaring it and its name there. */
type Origin = { readonly file: string; readonly name: string };

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

/**
 * Whether an expression is `@adobe/ecs`'s namespace `namespace`: imported under any name, a namespace's member, or the
 * name unbound.
 */
const isEcs = (module: Module, expression: Node, namespace: 'System' | 'Component'): boolean => {
    for (const statement of module.program.body) {
        if (statement.type !== 'ImportDeclaration' || statement.source.value !== '@adobe/ecs') continue;
        for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier' && isMember(expression) && expression.object.type === 'Identifier'
                && expression.object.name === specifier.local.name && expression.property.name === namespace) return true;
            if (specifier.type === 'ImportSpecifier' && expression.type === 'Identifier' && specifier.local.name === expression.name
                && nameOf(specifier.imported) === namespace) return true;
        }
    }
    return expression.type === 'Identifier' && expression.name === namespace && !topLevelNames(module).has(namespace);
};

const isSystem = (module: Module, expression: Node): boolean => isEcs(module, expression, 'System');

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
    // Only the source reaches a system: a test running one doesn't make it part of the app.
    for (const file of graph.tsPaths.filter(path => !isTest(path))) {
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

/** Nothing declares a system nothing runs: each is in a plugin's `systems`, a composite, or passed to `run` or `add`. */
export const checkSystems = ({ graph, violate }: Context): void => {
    const reached = runSystems(graph);
    for (const file of graph.tsPaths) {
        const component = graph.componentOf(file);
        // A test feature's systems are run by the tests using it.
        if (component === undefined || isTestFeature(component) || !/^system\.[a-z0-9-]+\.ts$/.test(basename(file))) continue;
        const name = graph.exportsOf(file)[0];
        if (name === undefined || reached.has(`${file}#${name}`) || graph.textOf(file).includes(keepUnused)) continue;
        violate(file, 'unlisted-system', `system \`${name}\` isn't in a plugin's \`systems\`, a composite, or passed to run or add, so nothing runs it.`,
            `List ${name} in its layer's plugin's systems if the world runs it each tick; for a one-off, call world.run(${name}) where it's needed. If it's public for a caller still to come, write "// ${keepUnused} <reason>" in its file.`);
    }
};

/** `Component.derive(key, ...)` is in the file that declares `key`, beside its `declare module` entry. */
export const checkDerivations = ({ graph, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        if (isTest(file)) continue;
        const module = graph.moduleOf(file);
        walk(module, node => {
            if (node.type !== 'CallExpression' || !isMember(node.callee) || node.callee.property.name !== 'derive' || !isEcs(module, node.callee.object, 'Component')) return;
            const [derived] = node.arguments;
            if (derived?.type !== 'Identifier') return;
            const origin = isLocal(module, derived, derived.name) ? undefined : bindingOrigin(graph, file, derived.name);
            if (origin === undefined || origin.file === file) return;
            violate(file, 'derive-beside-component', `\`Component.derive(${derived.name}, ...)\` derives a component declared in ${origin.file}, not this file.`,
                `Move it into ${origin.file}, below \`export const ${origin.name} = Symbol()\` and its declare module entry: a derived component is defined where it's declared, so whoever imports it gets its derivations.`);
        });
    }
};

/** The call, `new` or `await` a top-level expression statement runs as its module loads, or undefined for none. */
const runsOnLoad = (expression: Node): Node | undefined => {
    const inner = expression.type === 'UnaryExpression' && expression.operator === 'void' ? expression.argument : expression;
    return inner.type === 'CallExpression' || inner.type === 'NewExpression' || inner.type === 'AwaitExpression' ? inner : undefined;
};

/**
 * Only an entry, `entry.<name>.ts`, runs code as it loads: any other module's top-level statements declare. A
 * derivation, `Component.derive(...)`, is a declaration: it registers as its component's module loads.
 */
export const checkSideEffects = ({ graph, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        if (isEntry(file) && graph.exportsOf(file).length > 0) {
            violate(file, 'entry-exports', `entry \`${basename(file)}\` exports ${graph.exportsOf(file).join(', ')}.`,
                'An entry only starts things and exports nothing: move what it exports into its layer: public at the root, or private beside what uses it.');
        }
        if (isTest(file) || isEntry(file) || file.endsWith('.d.ts')) continue;
        const module = graph.moduleOf(file);
        for (const statement of module.program.body) {
            if (statement.type !== 'ExpressionStatement') continue;
            const run = runsOnLoad(statement.expression);
            if (run === undefined) continue;
            if (run.type === 'CallExpression' && isMember(run.callee) && run.callee.property.name === 'derive' && isEcs(module, run.callee.object, 'Component')) continue;
            violate(file, 'runs-on-load', `\`${basename(file)}\` runs ${textOf(module, run).split('\n')[0]} as it loads.`,
                'Only an entry, entry.<name>.ts in the layer it starts, runs code as it loads: move the call into a function the entry, a plugin\'s connect or a system calls.');
        }
    }
};

/** A layer has at most one plugin, `plugin.<feature>-<layer>.ts`, which lists the layer's systems; no two plugins share a name. */
export const checkPlugins = ({ graph, violate }: Context): void => {
    const named = new Map<string, string>();
    for (const component of graph.components) {
        if (graph.componentOf(component) !== undefined) continue;
        const plugins = graph.rootFiles(component).filter(file => /^plugin\./.test(basename(file)));
        // The source root, the root feature, is the app.
        const feature = graph.featureOf(component);
        const name = `${feature === '.' ? 'app' : basename(feature)}-${basename(component)}`;
        for (const file of plugins) {
            if (isTestFeature(file)) continue;
            const first = named.get(name);
            if (first === undefined) named.set(name, file);
            else {
                violate(file, 'plugin-name-clash', `\`${basename(file)}\` exports ${camel(name)}, as ${first} does.`,
                    `Every plugin meets the others in main, so each name is the app's own: rename this feature, or the other, for what sets it apart (${basename(feature)} is a feature's folder).`);
            }
            if (file === `${component}/plugin.${name}.ts`) continue;
            violate(file, 'plugin-name', plugins.length > 1 ? `\`${component}\` has more than one plugin.` : `\`${basename(file)}\` isn't named for its feature and layer.`,
                `A layer has one plugin, plugin.${name}.ts, exporting ${camel(name)}: its systems and its connect to what's outside the world.`);
        }
    }
};

/**
 * `internal/` holds what several of a component's public declarations use, through their parts or other internal files
 * as well: what only one uses is that declaration's part, in the folder named for it.
 */
export const checkInternal = ({ graph, violate }: Context): void => {
    const importers = new Map<string, Set<string>>();
    for (const file of graph.tsPaths) {
        if (isTest(file)) continue;
        for (const { spec } of graph.importsOf(file)) {
            const target = spec.startsWith('.') ? graph.resolve(file, spec) : undefined;
            // A test feature reaches the app's files as a test does: its imports make none of them shared.
            if (target === undefined || (isTestFeature(file) && !isTestFeature(target))) continue;
            let set = importers.get(target);
            if (set === undefined) importers.set(target, set = new Set());
            set.add(file);
        }
    }
    /** The public declaration a file belongs to: itself at a component's root, or the one whose parts folder holds it. */
    const declarationOf = (file: string): string | undefined => {
        const component = graph.componentOf(file);
        if (component === undefined) return undefined;
        if (dirname(file) === component) return file;
        for (let dir = dirname(file); dir !== component && dir !== '.'; dir = dirname(dir)) {
            if (dirname(dir) === component && graph.files.has(`${dir}.ts`)) return `${dir}.ts`;
        }
        return undefined;
    };
    /** The public declarations using a file of internal/, through other internal files too. */
    const usersOf = (file: string, seen = new Set<string>()): Set<string> => {
        const users = new Set<string>();
        if (seen.has(file)) return users;
        seen.add(file);
        for (const importer of importers.get(file) ?? []) {
            if (basename(dirname(importer)) === 'internal') for (const user of usersOf(importer, seen)) users.add(user);
            else {
                const declaration = declarationOf(importer);
                users.add(declaration ?? importer);
            }
        }
        return users;
    };
    for (const file of graph.tsPaths) {
        if (isTest(file) || basename(dirname(file)) !== 'internal' || graph.componentOf(file) === undefined) continue;
        const users = [...usersOf(file)];
        if (users.length > 1) continue;
        violate(file, 'internal-single-use', users.length === 0 ? `\`${basename(file)}\` in internal/ is used by no declaration.` : `\`${basename(file)}\` in internal/ is used only by ${users[0]}.`,
            'internal/ holds what several public declarations use. Make it a part of the one declaration using it: unexported in its file, or in the folder named for it (system.<name>/, function.<name>/) when a test reaches it or the file would grow too large.');
    }
};

/**
 * A declaration's parts folder, `<kind>.<name>/` beside `<kind>.<name>.ts`, is its own: only the declaration and its
 * other parts import from it. What several declarations use is in `internal/`.
 */
export const checkParts = ({ graph, violate }: Context): void => {
    /** The declaration whose parts folder holds a file, if any: the nearest folder named for a file beside it. */
    const ownerOf = (file: string): string | undefined => {
        for (let dir = dirname(file); dir !== '.' && graph.componentOf(`${dir}/x`) !== undefined; dir = dirname(dir)) {
            if (graph.files.has(`${dir}.ts`)) return dir;
        }
        return undefined;
    };
    for (const file of graph.tsPaths) {
        if (isTest(file)) continue;
        for (const { spec } of graph.importsOf(file)) {
            const target = spec.startsWith('.') ? graph.resolve(file, spec) : undefined;
            if (target !== undefined && isTestFeature(file) && !isTestFeature(target)) continue;
            const owner = target === undefined ? undefined : ownerOf(target);
            if (owner === undefined || file === `${owner}.ts` || file.startsWith(`${owner}/`)) continue;
            violate(file, 'parts-reach', `imports ${spec}, a part of \`${basename(owner)}.ts\`, which only it and its parts use.`,
                `Import what ${basename(owner)}.ts exports instead; or, when several declarations need the part, move it into the component's internal/.`);
        }
    }
};

/** No source file outgrows one reading: past `maxLines`, its parts move into the folder named for its declaration. */
export const checkLength = ({ graph, settings, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        if (isTest(file) || file.endsWith('.d.ts')) continue;
        const text = graph.textOf(file);
        // A final newline ends the last line rather than starting another.
        const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
        if (lines <= settings.maxLines) continue;
        violate(file, 'file-too-long', `\`${basename(file)}\` is ${lines} lines, more than ${settings.maxLines}.`,
            `Move its parts into files of their own, in the folder named for its declaration (${basename(file).slice(0, -3)}/), each about one of its ideas.`);
    }
};

/**
 * Tests export nothing, and a helper is no test of its own: what several tests share is a test feature, in `test/`,
 * one declaration per file; what one test uses is in that test.
 */
export const checkTestFiles = ({ graph, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        if (!isTest(file)) continue;
        if (/[.-]test-helper\.ts$/.test(file)) {
            violate(file, 'test-helper', `\`${basename(file)}\` is a test helper, which holds what tests share outside the standard's files.`,
                'Move what several tests share into a test feature, src/test/<feature>/<layer>/, one declaration per file; what only one test uses goes in that test.');
            continue;
        }
        const exported = graph.exportsOf(file);
        if (exported.length === 0) continue;
        violate(file, 'test-exports', `test \`${basename(file)}\` exports ${exported.join(', ')}.`,
            'A test exports nothing: move what other tests use into a test feature, src/test/<feature>/<layer>/, one declaration per file.');
    }
};

/** A plugin lists its own layer's systems, and spreads only the plugins of its sub-features' same layer. */
export const checkPluginSystems = ({ graph, violate }: Context): void => {
    for (const component of graph.components) {
        if (graph.componentOf(component) !== undefined || isTestFeature(component)) continue;
        const feature = graph.featureOf(component);
        for (const file of graph.rootFiles(component).filter(path => /^plugin\./.test(basename(path)))) {
            const module = graph.moduleOf(file);
            walk(module, node => {
                if (node.type !== 'Property' || node.computed || node.key.type !== 'Identifier' || node.key.name !== 'systems' || node.value.type !== 'ArrayExpression') return;
                for (const element of node.value.elements) {
                    if (element === null) continue;
                    const expression = element.type === 'SpreadElement' ? element.argument : element;
                    const ofPlugin = isMember(expression) && expression.property.name === 'systems' && expression.object.type === 'Identifier';
                    const name = ofPlugin && expression.object.type === 'Identifier' ? expression.object.name : expression.type === 'Identifier' ? expression.name : undefined;
                    if (name === undefined || isLocal(module, expression, name)) continue;
                    const origin = bindingOrigin(graph, file, name);
                    const from = origin === undefined ? undefined : graph.componentOf(origin.file);
                    if (origin === undefined || from === undefined || graph.topOf(from) === component) continue;
                    const fromFeature = graph.featureOf(from);
                    const subFeaturePlugin = ofPlugin && basename(graph.topOf(from)) === basename(component) && fromFeature !== feature
                        && isWithin(fromFeature, feature) && /^plugin\./.test(basename(origin.file));
                    if (subFeaturePlugin) continue;
                    violate(file, 'plugin-foreign-systems', `\`${basename(file)}\` lists ${textOf(module, expression)}, systems of \`${graph.topOf(from)}\`.`,
                        'A plugin lists its own layer\'s systems, and spreads its sub-features\' plugins of the same layer. Start the other plugin beside this one, where main starts the plugins.');
                }
            });
        }
    }
};

/** The nodes a statement runs as its module loads: all of it but the bodies of the functions and classes it declares. */
const atLoad = (module: Module, node: Node, visit: (node: Node) => void): void => {
    visit(node);
    for (const child of module.children.get(node) ?? []) {
        if (child.type === 'FunctionExpression' || child.type === 'ArrowFunctionExpression' || child.type === 'FunctionDeclaration'
            || child.type === 'ClassBody' || child.type === 'TSModuleDeclaration') continue;
        atLoad(module, child, visit);
    }
};

/**
 * A function a module calls as it loads reads only what is declared above the call: a `const`, `let` or `class`
 * declared beneath it isn't initialized yet, which the compiler sees in the module's own statements but not through a
 * function declared beneath and hoisted.
 */
export const checkLoadOrder = ({ graph, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        if (isTest(file) || file.endsWith('.d.ts')) continue;
        const module = graph.moduleOf(file);
        const body = module.program.body;
        const declaredAt = new Map<string, number>();
        const functions = new Map<string, ESTree.Function>();
        body.forEach((statement, at) => {
            const declaration = declarationOf(statement);
            if (declaration.type === 'FunctionDeclaration' && declaration.id !== null) functions.set(declaration.id.name, declaration);
            else if ((declaration.type === 'VariableDeclaration' && declaration.kind !== 'var') || declaration.type === 'ClassDeclaration') {
                for (const name of declaredBy(declaration)) declaredAt.set(name, at);
            }
        });
        if (functions.size === 0) continue;
        body.forEach((statement, at) => {
            const reported = new Set<string>();
            const called = new Set<string>();
            /** What calling `name` as the module loads reads: its body, and the functions it calls in turn. */
            const call = (name: string, through: string): void => {
                const declaration = functions.get(name);
                if (declaration === undefined || called.has(name) || declaration.body === null || declaration.body === undefined) return;
                called.add(name);
                atLoad(module, declaration.body, node => {
                    if (node.type !== 'Identifier' || namesOnly(module, node) || isLocal(module, node, node.name)) return;
                    const declared = declaredAt.get(node.name);
                    if (declared !== undefined && declared > at && !reported.has(node.name)) {
                        reported.add(node.name);
                        violate(file, 'used-before-declared', `\`${basename(file)}\` calls ${through}() as it loads, which reads \`${node.name}\`, declared beneath the call: it isn't initialized yet.`,
                            `Declare \`${node.name}\` above the statement calling ${through}(), or pass it to the function.`);
                    }
                    if (node.type === 'Identifier' && functions.has(node.name)) call(node.name, through);
                });
            };
            if (declarationOf(statement).type === 'FunctionDeclaration') return;
            atLoad(module, statement, node => {
                if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee.type === 'Identifier' && !isLocal(module, node.callee, node.callee.name)) call(node.callee.name, node.callee.name);
            });
        });
    }
};
