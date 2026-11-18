// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, join } from '../path.js';
import { isEntry, isTest, isWithin } from '../graph.js';
import { declarationOf, declaredBy, exportedVariables, firstLine, isExport, isReExport, textOf, walk, type Module, type Node } from '../syntax.js';
import { camel, type Context } from './context.js';


/** `export {}`: what the index of a layer holding only entries and private code says, and of an app with no public API. */
const isEmptyExport = (statement: Node): boolean =>
    statement.type === 'ExportNamedDeclaration' && statement.source === null && statement.declaration === null && statement.specifiers.length === 0;

/** The files the source root may hold beside its folders. */
const isRootFile = (path: string): boolean => path === 'index.ts' || path.endsWith('.md') || path.endsWith('.d.ts') || isTest(path);

/** The source root holds only its index, documents and tests, and its index only re-exports. */
export const checkRoot = ({ graph, violate }: Context): void => {
    for (const path of graph.paths) {
        if (dirname(path) !== '.' || isRootFile(path)) continue;
        violate(path, 'src-root-files', `${path} is in the root of the source folder, which holds only index.ts, documents, tests and folders.`,
            'Move it into a layer: one of the source root\'s (<layer>/), or of a feature (features/<feature>/<layer>/).');
    }
    if (!graph.files.has('index.ts')) return;
    const module = graph.moduleOf('index.ts');
    for (const statement of module.program.body) {
        // `export {}`: an app with no public API.
        if (isReExport(statement) || isEmptyExport(statement)) continue;
        violate('index.ts', 'index-is-only-re-exports', `index.ts has a statement that isn't a re-export: ${firstLine(module, statement)}`,
            'The source root\'s index.ts re-exports the package\'s public API and nothing else; code that runs as the app starts belongs in an entry, entry.<name>.ts, in the layer it starts.');
    }
};

/**
 * The source root is the root feature. A feature holds its layers, `features/`, which holds only features, and
 * `test/`, which holds only test features, each holding only its layers; beside them, only documents. A feature but
 * the root has a layer of its own. A component outside another is a layer.
 */
export const checkFolders = ({ graph, violate }: Context): void => {
    const { layers } = graph;
    const list = layers.join(', ');
    const childrenOf = (dir: string): string[] => [...graph.dirs].filter(child => dirname(child) === dir).sort();
    const filesIn = (dir: string): string[] => graph.paths.filter(path => dirname(path) === dir);
    const holdsOnlyFeatures = (dir: string, what: string): void => {
        for (const path of filesIn(dir)) {
            if (path.endsWith('.md')) continue;
            violate(path, 'folder-holds-only-folders', `\`${dir}/\` holds only ${what}, but it holds ${basename(path)}.`,
                `Move ${basename(path)} into a layer (${list}) of a feature.`);
        }
    };
    const feature = (dir: string, test: boolean): void => {
        const root = dir === '.';
        const at = (name: string): string => root ? name : `${dir}/${name}`;
        let ownLayers = 0;
        for (const child of childrenOf(dir)) {
            const name = basename(child);
            if (layers.includes(name)) {
                ownLayers++;
                if (!graph.componentSet.has(child)) {
                    violate(`${child}/index.ts`, 'layer-needs-index', `\`${child}/\` is named like a layer but has no index.ts.`,
                        'A layer is a component: give it index.ts and README.md, or rename the folder if it isn\'t a layer.');
                }
            } else if (!test && (name === 'features' || name === 'test')) {
                holdsOnlyFeatures(child, name === 'features' ? 'features' : 'test features');
                for (const sub of childrenOf(child)) feature(sub, name === 'test');
            } else if (!graph.componentSet.has(child)) {
                violate(`${child}/`, 'feature-contents', `\`${root ? 'src' : dir}/\` is a feature, which holds only its layers${test ? '' : ', features/ and test/'}, but it holds \`${name}/\`.`,
                    test ? `A test feature holds only its layers (${list}): move \`${name}/\` into one of them.`
                        : `Move \`${name}/\` into one of its layers (${list}), or, if it's a feature, into ${at('features')}/.`);
            }
        }
        if (root) return;
        holdsOnlyFeatures(dir, 'folders and documents');
        if (ownLayers === 0) {
            violate(`${dir}/`, 'feature-without-layers', `feature \`${dir}\` has no layer of its own.`,
                `A feature has at least one layer (${list}): there are no groups of features. Give it the layer that composes its sub-features (its plugin, its index), or move its sub-features up into the features/ folder holding it.`);
        }
    };
    feature('.', false);
    for (const component of graph.components) {
        if (graph.componentOf(component) !== undefined || layers.includes(basename(component))) continue;
        violate(`${component}/index.ts`, 'layer-name', `component \`${component}\` isn't a layer: a component outside another is named one of ${list}.`,
            `Make it a layer of a feature (features/<feature>/<layer>, or <layer> at the source root), or make it a feature and move its parts into layers.`);
    }
};

/** Each component's README, index and root files. */
export const checkComponents = ({ graph, settings, violate }: Context): void => {
    // A layer's index may pass on a sub-feature's layer: a parent aggregates its sub-features.
    const isSubFeatureLayer = (component: string, spec: string): boolean => {
        const target = graph.resolve(`${component}/index.ts`, spec);
        const to = target === undefined ? undefined : graph.componentOf(target);
        if (to === undefined || target !== `${to}/index.ts` || graph.componentOf(to) !== undefined) return false;
        const parent = graph.featureOf(component);
        const child = graph.featureOf(to);
        return child !== parent && isWithin(child, parent);
    };
    const hasEntry = (component: string): boolean => graph.tsPaths.some(path => dirname(path) === component && isEntry(path));
    for (const component of graph.components) {
        const readme = graph.files.get(`${component}/README.md`);
        if (readme === undefined) {
            if (graph.componentOf(component) === undefined) {
                violate(`${component}/README.md`, 'readme', 'the layer has no README.md.',
                    'Add README.md: "# <component>", then a concise summary paragraph, then only as much as understanding its purpose and interface needs.');
            }
        } else if (!/^# .+\n\n\S/.test(readme)) {
            violate(`${component}/README.md`, 'readme', 'README.md must start with a "# <component>" heading, a blank line, then the summary paragraph.',
                'Put the concise summary directly under the heading; the description follows it.');
        }
        const indexPath = `${component}/index.ts`;
        const index = graph.moduleOf(indexPath);
        const reexported = new Set<string>();
        for (const statement of index.program.body) {
            const exported = isReExport(statement)
                ? { spec: statement.source.value, all: statement.type === 'ExportAllDeclaration' && statement.exported === null } : undefined;
            if (exported?.all === true && /^\.\/[^/]+\.js$/.test(exported.spec)) reexported.add(exported.spec.slice(2, -3));
            else if (isEmptyExport(statement) && hasEntry(component)) continue;
            else if (exported !== undefined && isSubFeatureLayer(component, exported.spec)) continue;
            else if (!(exported?.all === false && /^\.\/[^/]+\/index\.js$/.test(exported.spec))) {
                violate(indexPath, 'index-is-only-re-exports', `index.ts has a statement that isn't a re-export of a root file or a part: ${firstLine(index, statement)}`,
                    'index.ts holds only `export * from \'./<root file>.js\'` and named re-exports of parts (`export { name } from \'./part/index.js\'`).');
            }
        }
        const roots = graph.rootFiles(component);
        const bases = new Set(roots.map(file => file.slice(component.length + 1, -3)));
        for (const file of roots) {
            const base = file.slice(component.length + 1, -3);
            checkDeclarationFile({ graph, settings, violate }, file, base);
            if (!reexported.has(base)) violate(indexPath, 'index-exports-root-files', `index.ts doesn't re-export \`${base}.ts\`.`, `Add: export * from './${base}.js';`);
        }
        for (const name of reexported) {
            if (bases.has(name)) continue;
            violate(indexPath, 'index-exports-root-files', `index.ts re-exports './${name}.js', which isn't a declaration file in the component's root.`,
                'Re-export only root files (export * from), or a part by name: export { name } from \'./part/index.js\';');
        }
    }
};

/**
 * A folder inside a component is a part component (it has an index.ts), `internal/`, or the parts of the declaration
 * beside it, named for it: `system.draw-frame/` beside `system.draw-frame.ts`.
 */
export const checkPrivateFolders = ({ graph, violate }: Context): void => {
    for (const dir of [...graph.dirs].sort()) {
        const component = graph.componentOf(`${dir}/x`);
        if (component === undefined || component === dir || basename(dir) === 'internal' || graph.files.has(`${dir}.ts`)) continue;
        violate(`${dir}/`, 'private-folder', `\`${basename(dir)}/\` in \`${component}\` is neither internal/ nor named for a declaration beside it.`,
            'Move each file into the folder of the one declaration using it, named for it (system.<name>/ beside system.<name>.ts), or into internal/ when several declarations use it.');
    }
};

/** Every file in a component's private folders that exports something: like a root file, it exports one declaration, first. */
export const checkFiles = ({ graph, settings, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        const component = graph.componentOf(file);
        if (component === undefined || dirname(file) === component || file.endsWith('.d.ts') || isTest(file)) continue;
        if (exportedNames(graph.moduleOf(file), graph.exportsOf(file)).length > 0) checkDeclarationFile({ graph, settings, violate }, file, basename(file).slice(0, -3));
    }
};

/** A test outside the source root is named for the file beside it that it tests. */
export const checkTests = ({ graph, violate }: Context): void => {
    for (const file of graph.tsPaths) {
        const subject = /^(.+?)\.(?:browser\.)?(?:test|type-test)\.ts$/.exec(basename(file))?.[1];
        if (subject === undefined || dirname(file) === '.' || graph.files.has(join(dirname(file), `${subject}.ts`))) continue;
        violate(file, 'test-name', `\`${basename(file)}\` isn't named for a file beside it: there's no ${subject}.ts in ${dirname(file)}/.`,
            'Name a test for the file it tests, with only the test suffix added: <file>.test.ts beside <file>.ts, or <file>.browser.test.ts. A component\'s test of its whole interface is index.test.ts; a test of the app as a whole sits at the source root.');
    }
};

/** What a module exports: its declarations' names, and the first line of each re-export. */
const exportedNames = (module: Module, declared: readonly string[]): string[] =>
    [...declared, ...module.program.body.filter(isReExport).map(statement => firstLine(module, statement))];

/** A file declaring an export: named for its kind and export, which it exports alone and first, a system typed as its interface. */
const checkDeclarationFile = ({ graph, settings, violate }: Context, file: string, base: string): void => {
    // Any modifiers, then the kind, then the name: `persistent.component.done`. Modifiers are the app's own, for grouping.
    const match = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\.)*([a-z]+)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(base);
    const kind = match?.[1];
    const name = match?.[2];
    if (kind === undefined || name === undefined || !settings.kinds.includes(kind)) {
        violate(file, 'file-name', `\`${base}.ts\` isn't named <kind>.<name>.ts with a known kind.`,
            `Rename it <kind>.<kebab-name>.ts, after any modifiers of the app's own (<modifier>.<kind>.<kebab-name>.ts), with its kind one of: ${settings.kinds.join(', ')}. A file exports one declaration: give each other export a file of its own, in a folder without an index.ts if it's private.`);
        return;
    }
    const exported = camel(name);
    const module = graph.moduleOf(file);
    const names = exportedNames(module, graph.exportsOf(file));
    if (names.length !== 1 || names[0]?.toLowerCase() !== exported.toLowerCase()) {
        violate(file, 'file-exports-its-name', `\`${base}.ts\` exports [${names.join(', ')}]; it should export exactly one name, ${exported} (either case of the first letter).`,
            `Export only ${exported} from this file, or rename the file for what it exports. Give each other export a file of its own, in a folder without an index.ts if it's private.`);
    }
    if (kind === 'system') {
        const annotation = exportedVariables(module)[0]?.declarations[0]?.id.typeAnnotation;
        const type = annotation === undefined || annotation === null ? undefined : textOf(module, annotation.typeAnnotation);
        if (type === undefined || !/^System(<|$)/.test(type)) {
            violate(file, 'system-typed', `system \`${base}.ts\` isn't typed as its interface (${type ?? 'no type'}).`,
                `Declare it with its interface: export const ${exported}: System = …; with type arguments only for input and result (System<{ readonly x: number }, Entity>).`);
        } else if (/^System<\s*undefined/.test(type)) {
            violate(file, 'system-typed', `system \`${base}.ts\` is typed ${type}: a system with no input has input \`void\`.`,
                'Write System<void, Result>, or plain System with neither input nor result.');
        }
    }
    const statements = module.program.body.filter(statement => statement.type !== 'ImportDeclaration');
    const at = statements.findIndex(isExport);
    if (at < 0) {
        violate(file, 'export-first', `\`${base}.ts\` declares nothing.`, `Declare and export \`${exported}\` here.`);
        return;
    }
    const exportStatement = statements[at];
    if (exportStatement === undefined || at === 0) return;
    // A declaration above the export is allowed when the export's own statement uses it as it loads, or another so used does.
    const used = new Set<string>();
    const use = (statement: Node): void => walk(module, node => { if (node.type === 'Identifier') used.add(node.name); }, statement);
    use(exportStatement);
    const above = statements.slice(0, at);
    // Needed: a declaration of a name the export uses, or a statement declaring nothing that reads or changes one
    // (a loop filling an array the export reads), and, in turn, what those use.
    const needed = new Set<(typeof above)[number]>();
    const needs = (statement: (typeof above)[number]): boolean => {
        const declared = declaredBy(declarationOf(statement));
        if (declared.length > 0) return declared.some(each => used.has(each));
        let reads = false;
        walk(module, node => { if (node.type === 'Identifier' && used.has(node.name)) reads = true; }, statement);
        return reads;
    };
    for (let grew = true; grew;) {
        grew = false;
        for (const statement of above) {
            if (needed.has(statement) || !needs(statement)) continue;
            needed.add(statement);
            use(statement);
            grew = true;
        }
    }
    for (const statement of above) {
        const declared = declaredBy(declarationOf(statement));
        if (needed.has(statement)) continue;
        const what = declared[0] === undefined ? 'a statement' : `\`${declared[0]}\``;
        violate(file, 'export-first', `\`${base}.ts\` has ${what} above its export, which the export doesn't use.`,
            `Put \`export const ${exported}\`, with its doc comment, first after the imports, and private constants, types and functions beneath it, so a reader sees the whole public interface at the top. Only what the export's own statement needs as the module loads, such as an \`Index\` its declaration names, may sit above it.`);
    }
};
