// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "vite";

/**
 * A build of a package the pages read, or a change to its sources, reloads no page: its modules are only invalidated,
 * so the next load reads them anew. A build writes many files, and each would reload the page otherwise, losing what
 * the reader typed. `folders` are the package's, as absolute paths ending in `/`.
 */
export const packageUpdates = (folders: readonly string[]): Plugin => ({
    name: "package-updates-without-reloads",
    hotUpdate({ file, modules }) {
        const path = file.replace(/\\/g, "/");
        if (!folders.some(folder => path.startsWith(folder))) return;
        for (const module of modules) this.environment.moduleGraph.invalidateModule(module);
        return [];
    },
});
