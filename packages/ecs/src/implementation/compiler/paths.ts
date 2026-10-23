// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageName = "@adobe/ecs";
const posix = (path: string): string => path.replace(/\\/g, "/");
const fileOf = (id: string): string => posix(id.split("?")[0] ?? id);

/**
 * The files of one copy of the package that compiled code imports. A copy is judged by the files an importer resolves
 * into it, so emitted code always binds to the copy, and the registry, the importer itself uses.
 */
export type PackageCopy = {
    /** The runtime hook kernels attach through. */
    readonly attachKernel: string;
    /** The runtime hook for spawns and adds whose values pass positionally. */
    readonly preparedSpawn: string;
    /** The runtime hook for index lookups whose keys pass positionally. */
    readonly preparedLookup: string;
    /** The package root's module, for kernels that import the package when a build treats it as external. */
    readonly index: string;
};

/** The root of the copy of the package containing each directory, or null; found once per directory. */
const roots = new Map<string, string | null>();

/** The name the package.json in a directory gives, or null when it has none that parses. */
const packageNameAt = (directory: string): unknown => {
    try {
        const json: unknown = JSON.parse(readFileSync(`${directory}/package.json`, "utf8"));
        return typeof json === "object" && json !== null ? Reflect.get(json, "name") : undefined;
    }
    catch {
        // No package.json here, or none that parses.
        return null;
    }
};

const isPackageRoot = (directory: string): boolean => packageNameAt(directory) === packageName;

const rootOfDirectory = (directory: string): string | null => {
    const known = roots.get(directory);
    if (known !== undefined) return known;
    const name = packageNameAt(directory);
    const parent = dirname(directory);
    // The nearest package.json owns the file, whichever package it names.
    const root = name === packageName ? directory : name !== null || parent === directory ? null : rootOfDirectory(parent);
    roots.set(directory, root);
    return root;
};

/** A file's path in the copy of the package containing it, as `src/…` or `dist/…`, or null outside every copy. */
const pathInCopy = (file: string): { readonly root: string; readonly path: string } | null => {
    if (!isAbsolute(file)) return null;
    const root = rootOfDirectory(dirname(file));
    return root === null ? null : { root, path: file.slice(root.length + 1) };
};

const copies = new Map<string, PackageCopy>();

/** The copy at `root`, laid out as its `src` with `extension`, or as its built `dist`. */
const copyAt = (root: string, source: boolean, extension: string): PackageCopy => {
    const key = `${root}\0${source ? extension : ""}`;
    const known = copies.get(key);
    if (known !== undefined) return known;
    const prefix = source ? `${root}/src` : `${root}/dist`;
    const suffix = source ? extension : ".js";
    const copy: PackageCopy = {
        attachKernel: `${prefix}/implementation/world/attach-kernel${suffix}`,
        preparedSpawn: `${prefix}/implementation/world/prepared-spawn${suffix}`,
        preparedLookup: `${prefix}/implementation/world/prepared-lookup${suffix}`,
        index: `${prefix}/index${suffix}`,
    };
    copies.set(key, copy);
    return copy;
};

const here = posix(fileURLToPath(import.meta.url));
const ownRoot = posix(fileURLToPath(new URL("../../..", import.meta.url))).replace(/\/$/, "");

/** The copy this compiler runs from: its sources when running from `src`, its `dist` otherwise. */
export const ownCopy: PackageCopy = copyAt(ownRoot, here.startsWith(`${ownRoot}/src/`), extname(here));

/**
 * The copy at `root`, in the layout of a file in it. This compiler's own copy keeps the compiler's layout, so modules
 * importing its sources and its `dist` share the runtime the compiler runs with.
 */
const copyIn = (root: string, path: string, extension: string): PackageCopy =>
    root === ownRoot ? ownCopy : copyAt(root, path.startsWith("src/"), extension);

/** The copy a file belongs to, or null outside every copy. */
const copyOfFile = (file: string): PackageCopy | null => {
    const found = pathInCopy(file);
    return found === null ? null : copyIn(found.root, found.path, extname(file));
};

/** The copy installed for each directory's modules, found once per directory. */
const installed = new Map<string, PackageCopy | null>();

const installedFrom = (directory: string): PackageCopy | null => {
    const known = installed.get(directory);
    if (known !== undefined) return known;
    let copy: PackageCopy | null = null;
    const candidate = `${directory}/node_modules/${packageName}`;
    if (isPackageRoot(candidate)) {
        copy = copyIn(posix(realpathSync(candidate)), "dist/", ".js");
    } else {
        const parent = dirname(directory);
        copy = parent === directory ? null : installedFrom(parent);
    }
    installed.set(directory, copy);
    return copy;
};

/**
 * The copy an importer that can't resolve the package through the build uses: the copy it is part of, or else the one
 * installed nearest it, or else this compiler's own.
 */
export const copyForImporter = (importer: string): PackageCopy => {
    const file = fileOf(importer);
    return copyOfFile(file) ?? installedFrom(dirname(file)) ?? ownCopy;
};

const layouts = (module: string, extensions: readonly string[] = [".ts", ".js"]): readonly string[] =>
    [...extensions.map(extension => `src/${module}${extension}`), `dist/${module}.js`];

const intrinsicModules: ReadonlySet<string> = new Set(layouts("interface/math/intrinsic"));

/** Whether a file is the module math functions declare their WGSL builtins with, in any copy of the package. */
export const isIntrinsicModule = (file: string): boolean => {
    const posixFile = posix(file);
    if (!posixFile.includes("/intrinsic.")) return false;
    const found = pathInCopy(posixFile);
    return found !== null && intrinsicModules.has(found.path);
};

const attachKernelModules: ReadonlySet<string> = new Set(layouts("implementation/world/attach-kernel"));

/** Whether an import specifier is the runtime hook kernels attach through, in any copy of the package. */
export const isAttachKernelModule = (specifier: string): boolean => {
    if (!specifier.includes("/attach-kernel.")) return false;
    const found = pathInCopy(fileOf(specifier));
    return found !== null && attachKernelModules.has(found.path);
};

const rootModules = [...layouts("interface/index"), ...layouts("index")];
const namespaceModules: { readonly [namespace: string]: ReadonlySet<string> } = Object.fromEntries(
    [["System", "system/system"], ["Rule", "rule/rule"], ["Finalizer", "finalizer/finalizer"], ["Index", "indexes/index-type"]]
        .map(([namespace, module]) => [namespace, new Set([...layouts(`interface/${module}`), ...rootModules])]),
);

/**
 * The copy of the package whose module of `namespace` a resolved module id is, directly or through the package root,
 * in the id's layout; null when the id is no such module.
 */
export const namespaceCopyOf = (id: string, namespace: string): PackageCopy | null => {
    const modules = namespaceModules[namespace];
    if (modules === undefined) return null;
    const file = fileOf(id);
    const found = pathInCopy(file);
    return found !== null && modules.has(found.path) ? copyIn(found.root, found.path, extname(file)) : null;
};

/** Whether a resolved module id is one of the package's public modules, in any copy: its root or its interface. */
export const isInterfaceModule = (id: string): boolean => {
    const found = pathInCopy(fileOf(id));
    return found !== null && (found.path.startsWith("src/interface/") || found.path.startsWith("dist/interface/") || rootModules.includes(found.path));
};
