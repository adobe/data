/// <reference types="node" />
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const extension = extname(here);
const posix = (path: string): string => path.replace(/\\/g, "/");
const packageRoot = posix(fileURLToPath(new URL("../..", import.meta.url))).replace(/\/$/, "");

/** The runtime hook emitted code imports: the source file when running from `src`, the built one from `dist`. */
export const attachKernelPath = posix(fileURLToPath(new URL(`../world/create/attach-kernel${extension}`, import.meta.url)));

const systemModules: ReadonlySet<string> = new Set([
    "src/system/system.ts", "src/system/system.js", "dist/system/system.js", "src/index.ts", "src/index.js", "dist/index.js",
].map(path => `${packageRoot}/${path}`));

/** Whether a resolved module id is this package's `System` namespace, directly or through the package root. */
export const isSystemModule = (id: string): boolean => systemModules.has(posix(id.split("?")[0] ?? id));
