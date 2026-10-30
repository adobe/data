// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Connect, defineConfig, type Plugin, type UserConfig } from "vite";
import { isolation } from "./isolation.ts";
import { packageUpdates } from "./package-updates.ts";
import { isolationWorker, publish } from "./publish.ts";
import { packages, samples } from "./samples.ts";

/** The sample browser's page and every sample's, in the folder of packages. */
const pages = ["ecs-sample-browser/index.html", ...samples().map(sample => sample.page)];

/**
 * Where the dev server finds the dependencies to optimize before the first page asks: the pages, and every sample's
 * modules, its workers' among them, which a page's scan doesn't reach. A dependency found late reloads the page.
 */
const entries = [...pages, ...samples().map(sample => `${sample.name}/src/**/*.ts`), "!**/*.test.ts", "!**/*.test-helper.ts", "!**/*.d.ts"];

/** Sends the root of the dev and preview servers to the sample browser. */
const redirect = (server: { readonly middlewares: Connect.Server }): void => {
    server.middlewares.use((request, response, next) => {
        if (request.url !== "/") return next();
        response.statusCode = 302;
        response.setHeader("Location", "/ecs-sample-browser/");
        response.end();
    });
};
const browser: Plugin = { name: "sample-browser", configureServer: redirect, configurePreviewServer: redirect };

/** Whether a value is a list of Vite plugins, each an object with a name. */
const isPlugins = (value: unknown): value is readonly Plugin[] => Array.isArray(value)
    && value.every(item => typeof item === "object" && item !== null && typeof Reflect.get(item, "name") === "string");

/** The plugins samples' pages build with besides the ECS's: what each sample's `vite.plugins.ts` makes, where it has one. */
const samplePlugins = async (): Promise<readonly Plugin[]> => {
    const files = samples().map(sample => `${packages}${sample.name}/vite.plugins.ts`).filter(file => existsSync(file));
    const loaded: unknown[] = await Promise.all(files.map(file => import(pathToFileURL(file).href)));
    return loaded.flatMap(module => {
        const make: unknown = Reflect.get(Object(module), "plugins");
        const made: unknown = typeof make === "function" ? Reflect.apply(make, undefined, []) : [];
        return isPlugins(made) ? made : [];
    });
};

/**
 * Serves the folder of packages, so the sample browser at `/ecs-sample-browser/` frames each sample's page at
 * `/<package>/src/`, from one server, cross-origin isolated for shared memory. The build writes the same layout to
 * `dist`, with relative urls, so it works wherever it's served from, and the service worker that isolates its pages
 * where the host can't (`publish.ts`).
 */
export default defineConfig(async (): Promise<UserConfig> => {
    // Pages and workers build apart, each with plugins of its own.
    const [forPages, forWorkers] = await Promise.all([samplePlugins(), samplePlugins()]);
    return {
        root: packages,
        base: "./",
        appType: "mpa",
        plugins: [Compiler.plugin(), isolation, browser, publish(packages, "ecs-sample-browser/"), packageUpdates(["dist", "src"].map(folder => `${packages}ecs/${folder}/`.replace(/\\/g, "/"))), ...forPages],
        worker: { plugins: () => [Compiler.plugin(), ...forWorkers] },
        optimizeDeps: { entries },
        build: {
            outDir: fileURLToPath(new URL("dist", import.meta.url)),
            emptyOutDir: true,
            rolldownOptions: {
                input: [...pages.map(page => `${packages}${page}`), fileURLToPath(new URL("isolation-worker.ts", import.meta.url))],
                output: { entryFileNames: chunk => chunk.name === "isolation-worker" ? isolationWorker : "assets/[name]-[hash].js" },
            },
        },
    };
});
