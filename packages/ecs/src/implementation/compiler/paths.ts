// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const extension = extname(here);
const posix = (path: string): string => path.replace(/\\/g, "/");
const packageRoot = posix(fileURLToPath(new URL("../../..", import.meta.url))).replace(/\/$/, "");

/** The runtime hook emitted code imports: the source file when running from `src`, the built one from `dist`. */
export const attachKernelPath = posix(fileURLToPath(new URL(`../world/attach-kernel${extension}`, import.meta.url)));

/** The runtime hook for spawns whose values pass positionally. */
export const prepareSpawnPath = posix(fileURLToPath(new URL(`../world/prepared-spawn${extension}`, import.meta.url)));

/** The runtime hook for index lookups whose keys pass positionally. */
export const prepareLookupPath = posix(fileURLToPath(new URL(`../world/prepared-lookup${extension}`, import.meta.url)));

const intrinsicModules: ReadonlySet<string> = new Set(["src/interface/math/intrinsic.ts", "src/interface/math/intrinsic.js", "dist/interface/math/intrinsic.js"].map(path => `${packageRoot}/${path}`));

/** Whether a file is the module math functions declare their WGSL builtins with. */
export const isIntrinsicModule = (file: string): boolean => intrinsicModules.has(posix(file));

/** The package root's module, for kernels that import the package when a build treats it as external. */
export const packageIndex = posix(fileURLToPath(new URL(`../../index${extension}`, import.meta.url)));

const systemModules: ReadonlySet<string> = new Set([
    "src/interface/system/system.ts", "src/interface/system/system.js", "dist/interface/system/system.js",
    "src/interface/index.ts", "src/interface/index.js", "dist/interface/index.js", "src/index.ts", "src/index.js", "dist/index.js",
].map(path => `${packageRoot}/${path}`));

/** Whether a resolved module id is this package's `System` namespace, directly or through the package root. */
export const isSystemModule = (id: string): boolean => systemModules.has(posix(id.split("?")[0] ?? id));

const roots = ["src/interface/index.ts", "src/interface/index.js", "dist/interface/index.js", "src/index.ts", "src/index.js", "dist/index.js"];
const namespaceModules: { readonly [namespace: string]: ReadonlySet<string> } = Object.fromEntries(
    [["System", "system/system"], ["Rule", "rule/rule"], ["Finalizer", "finalizer/finalizer"], ["Index", "indexes/index-type"]].map(([namespace, module]) => [namespace, new Set(
        [`src/interface/${module}.ts`, `src/interface/${module}.js`, `dist/interface/${module}.js`, ...roots].map(path => `${packageRoot}/${path}`),
    )]),
);

/** Whether a resolved module id is the module of this package's `namespace`, directly or through the package root. */
export const isNamespaceModule = (id: string, namespace: string): boolean => namespaceModules[namespace]?.has(posix(id.split("?")[0] ?? id)) ?? false;
