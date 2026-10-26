// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageCopies, type PackageCopies } from './package-copies.js';

export type { PackageCopy } from './package-copies.js';

const posix = (path: string): string => path.replace(/\\/g, "/");

/** The copies of the package on node's file system, as the plugin finds them (`package-copies.ts`). */
export const nodeCopies: PackageCopies = createPackageCopies({
    read: file => readFileSync(file, "utf8"),
    exists: existsSync,
    realpath: realpathSync,
    dirname,
    extname,
    isAbsolute,
    ownRoot: posix(fileURLToPath(new URL("../../..", import.meta.url))).replace(/\/$/, ""),
    ownModule: posix(fileURLToPath(import.meta.url)),
});

export const { ownCopy, copyForImporter, isIntrinsicModule, isAttachKernelModule, namespaceCopyOf, packagePathOf, typesFileOf } = nodeCopies;
