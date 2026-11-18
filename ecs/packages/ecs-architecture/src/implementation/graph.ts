// © 2026 Adobe. MIT License. See /LICENSE for details.
import { basename, dirname, join, normalize } from './path.js';
import type { Config } from '../config.js';
import { defaults } from '../defaults.js';
import { exportsOf, importsOf, parseModule, type Import, type Module, type Parse } from './syntax.js';


/** A configuration with every part the checks and diagrams read given: the defaults' for those it leaves out. */
export type Settings = Required<Omit<Config, 'agents'>>;

/** Whether a file is a test or a test's helper, which may import anything by its path. */
export const isTest = (path: string): boolean => /[.-](test|type-test|test-helper)\.ts$/.test(path);

/** Whether a file is an entry, `entry.<name>.ts`: a module that runs code as it loads, which nothing imports. */
export const isEntry = (path: string): boolean => /^entry\.[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(basename(path));

/**
 * The feature owning the test feature a path is in, `.` for the source root, or undefined when it's in none: a test
 * feature is a feature in the `test/` folder of a feature, the source root or one in a `features/` folder.
 */
export const testFeatureOwner = (path: string): string | undefined => {
    const segments = path.split('/');
    for (let at = 0; at < segments.length - 1; at++) {
        if (segments[at] !== 'test' || !(at === 0 || segments[at - 2] === 'features')) continue;
        return at === 0 ? '.' : segments.slice(0, at).join('/');
    }
    return undefined;
};

/** Whether a path is in a test feature: what only tests, and test features, of its owner's subtree may import. */
export const isTestFeature = (path: string): boolean => testFeatureOwner(path) !== undefined;

/** Whether `feature` is `ancestor` or a feature inside it, `.` being the source root. */
export const isWithin = (feature: string, ancestor: string): boolean => ancestor === '.' || feature === ancestor || feature.startsWith(`${ancestor}/`);

export const settingsOf = (config: Config = {}): Settings => ({ ...defaults, ...config });

/**
 * What the checks and the diagrams know of an application's source: its files parsed, its components, layers,
 * features and apps, and the file each import resolves to. `input` is every file of the source folder, by its path in
 * that folder, posix, to its text, each `.ts` file read by `parse`.
 */
export const analyze = (input: Readonly<Record<string, string>>, settings: Settings, parse: Parse) => {
    const files = new Map(Object.entries(input).map(([path, text]) => [path, text.replace(/\r\n/g, '\n')]));
    const paths = [...files.keys()].sort();
    const tsPaths = paths.filter(path => path.endsWith('.ts'));
    const layers = Object.keys(settings.layers);
    const textOf = (path: string): string => files.get(path) ?? '';

    const parsed = new Map<string, Module>();
    const moduleOf = (path: string): Module => {
        let module = parsed.get(path);
        if (module === undefined) parsed.set(path, module = parseModule(parse, path, textOf(path)));
        return module;
    };
    const exportsCache = new Map<string, readonly string[]>();
    const exportsIn = (path: string): readonly string[] => {
        let names = exportsCache.get(path);
        if (names === undefined) exportsCache.set(path, names = exportsOf(moduleOf(path)));
        return names;
    };
    const importsCache = new Map<string, readonly Import[]>();
    const importsIn = (path: string): readonly Import[] => {
        let imports = importsCache.get(path);
        if (imports === undefined) importsCache.set(path, imports = importsOf(moduleOf(path)));
        return imports;
    };
    /** The file of ours a relative import from `file` names, if any. */
    const resolve = (file: string, spec: string): string | undefined => {
        let target = normalize(join(dirname(file), spec));
        if (target.endsWith('.js')) target = `${target.slice(0, -3)}.ts`;
        else if (files.has(`${target}/index.ts`)) target = `${target}/index.ts`;
        return files.has(target) ? target : undefined;
    };

    const dirs = new Set<string>();
    for (const path of paths) for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) dirs.add(dir);

    const components = [...dirs].filter(dir => files.has(`${dir}/index.ts`)).sort();
    const componentSet = new Set(components);
    /** The nearest component holding a path. */
    const componentOf = (path: string): string | undefined => {
        for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) if (componentSet.has(dir)) return dir;
        return undefined;
    };
    /** The outermost component holding a component: its layer. */
    const topOf = (component: string): string => {
        let top = component;
        for (let parent = componentOf(top); parent !== undefined; parent = componentOf(top)) top = parent;
        return top;
    };
    const layerOf = (component: string): string | undefined => {
        const name = basename(topOf(component));
        return layers.includes(name) ? name : undefined;
    };
    /** The feature holding a component's layer: `features/todos`, or `.` for a layer of the source root. */
    const featureOf = (component: string): string => dirname(topOf(component));
    /** A component's public declarations: the files in its folder but its index and tests. */
    const rootFiles = (component: string): string[] =>
        tsPaths.filter(path => dirname(path) === component && path !== `${component}/index.ts` && !isTest(path) && !isEntry(path));
    return {
        files, paths, tsPaths, dirs, components, componentSet, layers,
        textOf, moduleOf, exportsOf: exportsIn, importsOf: importsIn, resolve, componentOf, topOf, layerOf, featureOf, rootFiles,
    };
};

export type Graph = ReturnType<typeof analyze>;
