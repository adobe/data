// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, relative } from '../path.js';
import { isInMain, isTest, isTestFeature, isWithin, mainFeature, testFeatureOwner } from '../graph.js';
import { isLocal, namesOnly, topLevelNames, walk, type Module, type Node } from '../syntax.js';
import { relativeSpec, type Context } from './context.js';

/** What the headless layers may not name: the DOM, the network, timers, storage and the global object. */
const headlessGlobals = new Set([
    'document', 'window', 'HTMLElement', 'customElements', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage',
    'indexedDB', 'navigator', 'fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval', 'globalThis',
]);

/** Each component to those it imports at runtime. */
export type Edges = Map<string, Set<string>>;

/** What the import checks find, which the checks of systems and exports read. */
export type Imports = {
    /** Each component to those its files import at runtime. */
    readonly edges: Edges;
    /** Each component to the files importing its index, with the names each takes. */
    readonly uses: Map<string, { readonly importer: string; readonly names: readonly string[] }[]>;
};

const addEdge = (edges: Edges, from: string, to: string): void => {
    let targets = edges.get(from);
    if (targets === undefined) edges.set(from, targets = new Set());
    targets.add(to);
};

const isBanned = (spec: string, prefix: string): boolean => spec === prefix || spec.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);

/** The headless globals a module reads: names no scope around their use declares. */
const globalsIn = (module: Module): string[] => {
    const top = topLevelNames(module);
    const global = (node: Node, name: string): boolean => !top.has(name) && !isLocal(module, node, name);
    const found = new Set<string>();
    walk(module, node => {
        if (node.type === 'Identifier' && headlessGlobals.has(node.name) && !namesOnly(module, node) && global(node, node.name)) found.add(node.name);
        else if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.property.type === 'Identifier' && node.property.name === 'now'
            && (node.object.name === 'Date' || node.object.name === 'performance') && global(node, node.object.name)) found.add(`${node.object.name}.now`);
    });
    return [...found];
};

/** Imports: through an index, never into a part from outside its layer, never to a parent, down the layers, and no cycles. */
export const checkImports = ({ graph, settings, violate }: Context): Imports => {
    const edges: Edges = new Map();
    const uses: Imports['uses'] = new Map();
    const addUse = (component: string, importer: string, names: readonly string[]): void => {
        let list = uses.get(component);
        if (list === undefined) uses.set(component, list = []);
        list.push({ importer, names });
    };
    for (const file of graph.tsPaths) {
        if (basename(file) === 'index.ts') {
            // An index's re-exports are no imports to check, but they load the parts they name.
            const from = graph.componentOf(file);
            for (const { spec, typeOnly, names } of graph.importsOf(file)) {
                const target = spec.startsWith('.') && !typeOnly ? graph.resolve(file, spec) : undefined;
                const to = target === undefined ? undefined : graph.componentOf(target);
                if (from !== undefined && to !== undefined && to !== from) addEdge(edges, from, to);
                // The source root's index is the package's public API: what it re-exports is used.
                // `export *` names nothing: it passes on every name.
                if (file === 'index.ts' && to !== undefined && target === `${to}/index.ts`) addUse(to, file, names.length === 0 ? ['*'] : names);
            }
            continue;
        }
        const testing = isTest(file);
        const from = graph.componentOf(file);
        const layer = from === undefined ? undefined : graph.layerOf(from);
        for (const { spec, typeOnly, names } of graph.importsOf(file)) {
            if (testing) {
                const target = spec.startsWith('.') ? graph.resolve(file, spec) : undefined;
                const to = target === undefined ? undefined : graph.componentOf(target);
                const owner = to === undefined ? undefined : testFeatureOwner(to);
                if (owner !== undefined && !isWithin(file, owner)) {
                    violate(file, 'test-feature-import', `imports \`${to}\`, a test feature of \`${owner}\`, from outside it.`,
                        `Import it only from tests, or from other test features, inside ${owner}/; move the test, or move the test feature up to a feature holding both.`);
                }
                // A test's imports don't make an export public, but for a test feature's, which only tests use.
                if (to !== undefined && to !== from && target === `${to}/index.ts` && owner !== undefined) addUse(to, file, names);
                continue;
            }
            if (!spec.startsWith('.')) {
                const banned = (layer === undefined ? undefined : settings.banned[layer])?.find(entry => isBanned(spec, entry.module));
                if (banned !== undefined) violate(file, banned.rule, `${layer} code imports ${spec}.`, banned.fix);
                continue;
            }
            const target = graph.resolve(file, spec);
            if (target === undefined) continue;
            const to = graph.componentOf(target);
            if (to === undefined || to === from) continue;
            const owner = testFeatureOwner(to);
            if (owner !== undefined && !(isTestFeature(file) && isWithin(file, owner))) {
                violate(file, 'test-feature-import', `imports \`${to}\`, a test feature, which only tests and test features of ${owner === '.' ? 'the source root' : `\`${owner}\``} may import.`,
                    `Import it only from tests, or from other test features, inside ${owner === '.' ? 'the source folder' : `${owner}/`}. If code outside tests needs it, move it out of test/ into a feature.`);
            }
            if (from !== undefined && from.startsWith(`${to}/`)) {
                violate(file, 'part-imports-parent', `imports its parent component \`${to}\` (${spec}).`,
                    'A part never imports its parent. Move what both need into a component of its own beside the part, and import that.');
                continue;
            }
            // A test feature reaches past an interface as a test does: by the file's path.
            const reachesLikeATest = isTestFeature(file);
            if (target === `${to}/index.ts`) addUse(to, file, names);
            else if (!reachesLikeATest) {
                const inside = relative(to, target);
                violate(file, 'deep-import', `imports ${spec}, inside component \`${to}\`${inside.startsWith('internal/') ? ', in its private internal/' : ''}.`,
                    `Import from the component's index.ts (${relativeSpec(relative(dirname(file), `${to}/index.js`))}). If the name isn't exported there, either it should be public, declared in the component's root and its index.ts, or this file uses something it shouldn't.`);
            }
            const outer = graph.topOf(to);
            if (to !== outer && !reachesLikeATest && !(from !== undefined && (from === outer || from.startsWith(`${outer}/`)))) {
                violate(file, 'nested-import', `imports \`${to}\`, a part inside \`${outer}\`.`,
                    `Import \`${outer}\`'s index.ts. If it doesn't export what you need, re-export it there by name: export { name } from './<part>/index.js'.`);
            }
            if (from === undefined) continue;
            const fromFeature = graph.featureOf(from);
            const toFeature = graph.featureOf(to);
            const composing = isInMain(fromFeature);
            if (isInMain(toFeature) && !composing) {
                violate(file, 'imports-main', `imports \`${to}\`, in \`${mainFeature}\`, which starts the app.`,
                    `Nothing outside ${mainFeature} imports it: it depends on every feature, so importing it closes a cycle. Move what this file needs out of main into the lowest feature both build on.`);
            }
            if (fromFeature !== toFeature && isWithin(toFeature, fromFeature) && owner === undefined && !composing && !(basename(file).startsWith('plugin.') && dirname(file) === from)) {
                violate(file, 'parent-imports-sub-feature', `imports \`${to}\`, a layer of \`${toFeature}\`, a sub-feature of this file's feature${fromFeature === '.' ? ', the source root' : ` \`${fromFeature}\``}.`,
                    'A parent uses its sub-features only to aggregate them, in its plugin (plugin.<feature>-<layer>.ts) or its index.ts. Move the logic into the sub-feature, or into the parent\'s layers for the sub-feature to import.');
            }
            const fromLayer = graph.layerOf(from);
            const toLayer = graph.layerOf(to);
            const allowed = fromLayer === undefined ? undefined : settings.layers[fromLayer];
            if (fromLayer !== undefined && toLayer !== undefined && allowed !== undefined && !allowed.includes(toLayer) && !composing) {
                violate(file, 'layer-rank', `${fromLayer} code imports ${toLayer} (\`${to}\`).`,
                    `A ${fromLayer} may import only ${allowed.join(', ')}. ${settings.headless.includes(fromLayer)
                        ? 'Reverse the dependency: the view or port calls the model, never the other way; if a model system must be ordered against a view system, put the before or after on the view system.'
                        : 'Move the shared part down into a layer both may import.'}`);
            }
            if (!typeOnly) addEdge(edges, from, to);
        }
        if (layer !== undefined && settings.headless.includes(layer) && !testing) {
            const found = globalsIn(graph.moduleOf(file));
            if (found.length > 0) {
                violate(file, 'model-is-headless', `${layer} code uses ${found.map(name => `\`${name}\``).join(', ')}.`,
                    'The model runs headless: no DOM, network, timers or global object. Move this code to the feature\'s view, which binds the DOM, or its ports, which connect what\'s outside; time comes from the clock resource.');
            }
        }
    }
    const cycles = (graphEdges: Edges, rule: string, what: string, fix: string, where: (node: string) => string): void => {
        const state = new Map<string, 1 | 2>();
        const reported = new Set<string>();
        const visit = (node: string, stack: readonly string[]): void => {
            if (state.get(node) === 2) return;
            if (state.get(node) === 1) {
                const cycle = [...stack.slice(stack.indexOf(node)), node];
                const key = [...cycle].sort().join();
                if (!reported.has(key)) {
                    reported.add(key);
                    violate(where(node), rule, `${what} import each other in a cycle: ${cycle.join(' -> ')}.`, fix);
                }
                return;
            }
            state.set(node, 1);
            for (const next of [...(graphEdges.get(node) ?? [])].sort()) visit(next, [...stack, node]);
            state.set(node, 2);
        };
        for (const node of [...graphEdges.keys()].sort()) visit(node, []);
    };
    cycles(edges, 'import-cycle', 'components',
        'Components form a directed acyclic graph. Move what the cycle shares into a component of its own both import, or reverse one dependency (an ordering `after: [x]` can often flip to `before`). Type-only imports may close a cycle.',
        node => `${node}/index.ts`);
    return { edges, uses };
};
