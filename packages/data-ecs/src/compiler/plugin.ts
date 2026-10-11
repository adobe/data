import type { Plugin } from 'vite';
import { isSystemModule } from './paths.js';
import { transformKernels } from './transform.js';

const scripts = /\.[cm]?[jt]sx?$/;

/**
 * Compiles `kernel: true` systems at build time. Runs after TypeScript is stripped and before minification,
 * so it sees plain JS with source names.
 */
export const kernelPlugin = (): Plugin => ({
    name: "@adobe/data-ecs/kernel",
    enforce: "post",
    async transform(code, id) {
        if (!scripts.test(id.split("?")[0] ?? id)) return null;
        const result = await transformKernels(code, id, input => this.parse(input), async source => {
            const resolved = await this.resolve(source, id);
            return resolved !== null && isSystemModule(resolved.id);
        });
        if (result === null) return null;
        if ("failure" in result) return this.error(result.failure.message, result.failure.position);
        return { code: result.code, map: null };
    },
});
