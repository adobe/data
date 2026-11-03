// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname } from '../path.js';
import ts from 'typescript';
import { isTest } from '../graph.js';
import { bindingNames, firstLine, isExported, walk } from '../syntax.js';
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
    for (const statement of module.statements) {
        if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) continue;
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
        for (const statement of index.statements) {
            const exported = ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
                ? { spec: statement.moduleSpecifier.text, all: statement.exportClause === undefined } : undefined;
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
            checkRootFile({ graph, settings, violate }, file, base);
            if (!reexported.has(base)) violate(indexPath, 'index-exports-root-files', `index.ts doesn't re-export \`${base}.ts\`.`, `Add: export * from './${base}.js';`);
        }
        for (const name of reexported) {
            if (bases.has(name)) continue;
            violate(indexPath, 'index-exports-root-files', `index.ts re-exports './${name}.js', which isn't a declaration file in the component's root.`,
                'Re-export only root files (export * from), or a part by name: export { name } from \'./part/index.js\';');
        }
    }
};

/** A root file: named for its kind and export, which it exports alone and first, a system typed as its interface. */
const checkRootFile = ({ graph, settings, violate }: Context, file: string, base: string): void => {
    const match = /^([a-z]+)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(base);
    const kind = match?.[1];
    const name = match?.[2];
    if (kind === undefined || name === undefined || !settings.kinds.includes(kind)) {
        violate(file, 'root-file-name', `\`${base}.ts\` isn't named <kind>.<name>.ts with a known kind.`,
            `Rename it <kind>.<kebab-name>.ts with its kind one of: ${settings.kinds.join(', ')}. Private helpers go in a folder without an index.ts.`);
        return;
    }
    const exported = camel(name);
    const module = graph.moduleOf(file);
    const reexports = module.statements.filter(statement => ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined);
    const names = [...graph.exportsOf(file), ...reexports.map(statement => firstLine(module, statement))];
    if (names.length !== 1 || names[0]?.toLowerCase() !== exported.toLowerCase()) {
        violate(file, 'root-file-exports-its-name', `\`${base}.ts\` exports [${names.join(', ')}]; it should export exactly one name, ${exported} (either case of the first letter).`,
            `Export only ${exported} from this file, or rename the file for what it exports. Helpers belong in a private folder.`);
    }
    if (kind === 'system') {
        const declaration = module.statements.filter(ts.isVariableStatement).find(isExported)?.declarationList.declarations[0];
        const type = declaration?.type?.getText(module);
        if (type === undefined || !/^System(<|$)/.test(type)) {
            violate(file, 'system-typed', `system \`${base}.ts\` isn't typed as its interface (${type ?? 'no type'}).`,
                `Declare it with its interface: export const ${exported}: System = …; with type arguments only for input and result (System<{ readonly x: number }, Entity>).`);
        } else if (/^System<\s*undefined/.test(type)) {
            violate(file, 'system-typed', `system \`${base}.ts\` is typed ${type}: a system with no input has input \`void\`.`,
                'Write System<void, Result>, or plain System with neither input nor result.');
        }
    }
    const statements = module.statements.filter(statement => !ts.isImportDeclaration(statement));
    const at = statements.findIndex(statement => isExported(statement) || ts.isExportDeclaration(statement) || ts.isExportAssignment(statement));
    if (at < 0) {
        violate(file, 'root-export-first', `\`${base}.ts\` declares nothing.`, `Declare and export \`${exported}\` here.`);
        return;
    }
    const exportStatement = statements[at];
    if (exportStatement === undefined || at === 0) return;
    // A declaration above the export is allowed when the export's own statement uses it as it loads, or another so used does.
    const used = new Set<string>();
    const use = (statement: ts.Node): void => walk(statement, node => { if (ts.isIdentifier(node)) used.add(node.text); });
    use(exportStatement);
    const above = statements.slice(0, at);
    for (const statement of [...above].reverse()) if (declaredBy(statement).some(each => used.has(each))) use(statement);
    for (const statement of above) {
        const declared = declaredBy(statement);
        if (declared.some(each => used.has(each))) continue;
        const what = declared[0] === undefined ? 'a statement' : `\`${declared[0]}\``;
        violate(file, 'root-export-first', `\`${base}.ts\` has ${what} above its export, which the export doesn't use.`,
            `Put \`export const ${exported}\`, with its doc comment, first after the imports, and private constants, types and functions beneath it, so a reader sees the whole public interface at the top. Only what the export's own statement needs as the module loads, such as an \`Index\` its declaration names, may sit above it.`);
    }
};

const declaredBy = (statement: ts.Statement): string[] => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(declaration => bindingNames(declaration.name));
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
        || ts.isEnumDeclaration(statement)) && statement.name !== undefined) return [statement.name.text];
    return [];
};
