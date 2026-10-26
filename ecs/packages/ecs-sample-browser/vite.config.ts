// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { type Connect, defineConfig, type Plugin } from "vite";
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

/**
 * Serves the folder of packages, so the sample browser at `/ecs-sample-browser/` frames each sample's page at
 * `/<package>/src/`, from one server, cross-origin isolated for shared memory. The build writes the same layout to
 * `dist`, with relative urls, so it works wherever it's served from, and the service worker that isolates its pages
 * where the host can't (`publish.ts`).
 */
export default defineConfig({
    root: packages,
    base: "./",
    appType: "mpa",
    plugins: [Compiler.plugin(), isolation, browser, publish(packages, "ecs-sample-browser/"), packageUpdates(["dist", "src"].map(folder => `${packages}ecs/${folder}/`.replace(/\\/g, "/")))],
    optimizeDeps: { entries },
    build: {
        outDir: fileURLToPath(new URL("dist", import.meta.url)),
        emptyOutDir: true,
        rolldownOptions: {
            input: [...pages.map(page => `${packages}${page}`), fileURLToPath(new URL("isolation-worker.ts", import.meta.url))],
            output: { entryFileNames: chunk => chunk.name === "isolation-worker" ? isolationWorker : "assets/[name]-[hash].js" },
        },
    },
});
