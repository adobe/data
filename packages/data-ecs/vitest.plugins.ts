import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

/** Shared memory needs cross-origin isolation, on every response the browser test server sends. */
export const isolation: Plugin = {
    name: "cross-origin-isolation",
    enforce: "pre",
    configureServer: server => {
        server.middlewares.use((_, response, next) => {
            response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            next();
        });
    },
};

/** Sources import siblings as `.js`; serve the `.ts` when only it exists, as `tsc` output would provide the `.js`. */
export const sources: Plugin = {
    name: "typescript-sources",
    enforce: "pre",
    resolveId: source => {
        const [path, query] = source.split("?");
        if (!path.endsWith(".js") || !path.includes("/src/") || existsSync(path)) return null;
        const typescript = path.replace(/\.js$/, ".ts");
        const absolute = existsSync(typescript) ? typescript : resolve(root, `.${typescript}`);
        return existsSync(absolute) ? `${absolute}${query === undefined ? "" : `?${query}`}` : null;
    },
};
