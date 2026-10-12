/// <reference types="node" />
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const extension = extname(here);
const posix = (path: string): string => path.replace(/\\/g, "/");
const packageRoot = posix(fileURLToPath(new URL("../..", import.meta.url))).replace(/\/$/, "");

/** The runtime hook emitted code imports: the source file when running from `src`, the built one from `dist`. */
export const attachKernelPath = posix(fileURLToPath(new URL(`../world/create/attach-kernel${extension}`, import.meta.url)));

/** The runtime hook for spawns whose values pass positionally. */
export const prepareSpawnPath = posix(fileURLToPath(new URL(`../world/create/prepared-spawn${extension}`, import.meta.url)));

/** The package's math modules, which kernels inline (`builtins.ts`), and their index. */
export const mathDirectory = posix(fileURLToPath(new URL("../math", import.meta.url)));
export const mathEntry = `${mathDirectory}/index${extension}`;

const indexes: ReadonlySet<string> = new Set(["src/index.ts", "src/index.js", "dist/index.js"].map(path => `${packageRoot}/${path}`));

/** The math module a resolved module id is: the math index for the package root, or null for anything else. */
export const mathFileOf = (id: string): string | null => {
    const path = posix(id.split("?")[0] ?? id);
    if (indexes.has(path)) return mathEntry;
    return path.startsWith(`${mathDirectory}/`) ? path : null;
};

const systemModules: ReadonlySet<string> = new Set([
    "src/system/system.ts", "src/system/system.js", "dist/system/system.js", "src/index.ts", "src/index.js", "dist/index.js",
].map(path => `${packageRoot}/${path}`));

/** Whether a resolved module id is this package's `System` namespace, directly or through the package root. */
export const isSystemModule = (id: string): boolean => systemModules.has(posix(id.split("?")[0] ?? id));
