// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, join } from '../path.js';
import { isTest } from '../graph.js';
import { declarationOf, declaredBy, exportedVariables, firstLine, isExport, isReExport, textOf, walk, type Module, type Node } from '../syntax.js';
import { camel, type Context } from './context.js';


/** The files the source root may hold beside its folders. */
const isRootFile = (path: string): boolean => path === 'index.ts' || path.endsWith('.md') || path.endsWith('.d.ts') || isTest(path);

/** The source root holds only its index, documents and tests, and its index only re-exports. */
export const checkRoot = ({ graph, violate }: Context): void => {
    for (const path of graph.paths) {
        if (dirname(path) !== '.' || isRootFile(path)) continue;
        violate(path, 'src-root-files', `${path} is in the root of the source folder, which holds only index.ts, documents, tests and folders.`,
            'Move it into a layer of a feature (<feature>/<layer>/), or into an app\'s folder if it belongs to an app.');
    }
    if (!graph.files.has('index.ts')) return;
    const module = graph.moduleOf('index.ts');
    for (const statement of module.program.body) {
        if (isReExport(statement)) continue;
        violate('index.ts', 'index-is-only-re-exports', `index.ts has a statement that isn't a re-export: ${firstLine(module, statement)}`,
            'The source root\'s index.ts re-exports the app\'s entry points and nothing else; the call that starts the app belongs in an app\'s file, which nothing imports.');
    }
};

/** Features and groups hold only folders, a feature only its layers, and a component outside another is a layer in a feature. */
export const checkFolders = ({ graph, violate }: Context): void => {
    const { layers } = graph;
    const list = layers.join(', ');
    for (const dir of graph.dirs) {
        if (graph.isApp(dir) || graph.componentSet.has(dir) || graph.componentOf(`${dir}/x`) !== undefined) continue;
        if (layers.includes(basename(dir))) {
            violate(`${dir}/index.ts`, 'layer-needs-index', `\`${dir}/\` is named like a layer but has no index.ts.`,
                'A layer is a component: give it index.ts and README.md, or rename the folder if it isn\'t a layer.');
        }
        const children = [...graph.dirs].filter(child => dirname(child) === dir);
        if (children.some(child => layers.includes(basename(child)))) {
            for (const child of children.filter(child => !layers.includes(basename(child)))) {
                violate(`${child}/`, 'feature-holds-only-layers', `\`${dir}/\` is a feature, since it has layer folders, but it also holds \`${basename(child)}/\`.`,
                    `A feature holds only its layers (${list}). Move \`${basename(child)}/\` into one of them, or make it a feature of its own beside \`${basename(dir)}\`.`);
            }
        }
        for (const path of graph.paths) {
            if (dirname(path) !== dir || basename(path) === 'ARCHITECTURE.md') continue;
            violate(path, 'folder-holds-only-folders', `\`${dir}/\` is a feature or a group of features, which holds only folders, but it holds ${basename(path)}.`,
                `Move ${basename(path)} into a layer (${list}) of this feature.`);
        }
    }
    for (const component of graph.components) {
        if (graph.componentOf(component) !== undefined) continue;
        if (!layers.includes(basename(component))) {
            violate(`${component}/index.ts`, 'layer-name', `component \`${component}\` isn't a layer: a component outside another is named one of ${list}.`,
                `Move it under a feature as <feature>/<layer> (for example ${dirname(component) === '.' ? component : dirname(component)}/model), or make ${component} a feature and move its parts into layers.`);
        } else if (dirname(component) === '.') {
            violate(`${component}/index.ts`, 'layer-in-feature', `layer \`${component}\` isn't inside a feature.`, `Put it in a feature folder: <feature>/${component}.`);
        }
    }
};

/** Each component's README, index and root files. */
export const checkComponents = ({ graph, settings, violate }: Context): void => {
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
    const match = /^([a-z]+)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(base);
    const kind = match?.[1];
    const name = match?.[2];
    if (kind === undefined || name === undefined || !settings.kinds.includes(kind)) {
        violate(file, 'file-name', `\`${base}.ts\` isn't named <kind>.<name>.ts with a known kind.`,
            `Rename it <kind>.<kebab-name>.ts with its kind one of: ${settings.kinds.join(', ')}. A file exports one declaration: give each other export a file of its own, in a folder without an index.ts if it's private.`);
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
    for (const statement of [...above].reverse()) if (declaredBy(declarationOf(statement)).some(each => used.has(each))) use(statement);
    for (const statement of above) {
        const declared = declaredBy(declarationOf(statement));
        if (declared.some(each => used.has(each))) continue;
        const what = declared[0] === undefined ? 'a statement' : `\`${declared[0]}\``;
        violate(file, 'export-first', `\`${base}.ts\` has ${what} above its export, which the export doesn't use.`,
            `Put \`export const ${exported}\`, with its doc comment, first after the imports, and private constants, types and functions beneath it, so a reader sees the whole public interface at the top. Only what the export's own statement needs as the module loads, such as an \`Index\` its declaration names, may sit above it.`);
    }
};
