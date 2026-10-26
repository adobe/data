// © 2026 Adobe. MIT License. See /LICENSE for details.
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';
import type { AugmentationHost } from './augmentations.js';
import type { InputHost } from './input-schemas.js';
import { packagePathOf } from './paths.js';

const packageRoot = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "");

/**
 * Files by path, beside the package's own sources, which `@adobe/ecs` resolves to, as it exports `System`; emitted
 * registrations import from `declare.js`.
 */
export const hostOf = (files: { readonly [path: string]: string }): InputHost & AugmentationHost => ({
    parse: (code, file) => parseAst(code, { lang: "ts" }, file),
    resolve: async (specifier, importer) => {
        if (specifier === "@adobe/ecs") return `${packageRoot}/src/index.ts`;
        if (!specifier.startsWith(".")) return null;
        const target = posix.resolve(posix.dirname(importer), specifier).replace(/\.js$/, ".ts");
        return target in files || existsSync(target) ? target : null;
    },
    load: async file => files[file] ?? readFileSync(file, "utf8"),
    packagePath: packagePathOf,
    isSystem: async specifier => specifier === "@adobe/ecs",
});
