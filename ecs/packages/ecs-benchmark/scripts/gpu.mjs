// © 2026 Adobe. MIT License. See /LICENSE for details.
// Runs the GPU lane's benchmarks, the suite's frames as GPU kernels with their data's `dingy` an f32, in headless
// Chromium on this machine's GPU: each benchmark at each count of entities in a page of its own, on the GPU and, for
// comparison, as the same kernels in WASM on the page's thread. The page is served by Vite with the ECS's compiler
// plugin, cross-origin isolated, so WASM kernels have shared memory.
//
//   node scripts/gpu.mjs [--lane gpu|wasm] [--filter <regular expression>] [--sizes <a,b,…>] [--compare <entities>]
//
// --compare runs frames of the 7-system GPU frame on the GPU and in WASM and prints how what they hold differs.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import { Compiler } from "@adobe/ecs/compiler";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** How long a page may take to print its result. */
const pageTimeout = 5 * 60 * 1000;
const benchmarks = ["GPU_SystemsUpdate", "GPU_SystemsUpdateMixedEntities", "GPU_ComplexSystemsUpdate", "GPU_ComplexSystemsUpdateMixedEntities"];

const options = (() => {
    const args = process.argv.slice(2);
    const value = name => {
        const at = args.indexOf(name);
        return at >= 0 ? args[at + 1] : undefined;
    };
    return {
        lanes: value("--lane") === undefined ? ["gpu", "wasm"] : [value("--lane")],
        filter: value("--filter") === undefined ? null : new RegExp(value("--filter")),
        sizes: value("--sizes")?.split(",").map(Number) ?? [16384, 262144, 1048576],
        compare: value("--compare") === undefined ? null : Number(value("--compare")),
    };
})();

const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    plugins: [Compiler.plugin()],
    server: { port: 0, headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } },
});
await server.listen();
const origin = server.resolvedUrls?.local[0] ?? "http://localhost:5173/";
const browser = await chromium.launch({ channel: "chromium", args: ["--enable-unsafe-webgpu"] });

/** Opens the page with `search` and resolves to what the line it prints starting `prefix` holds. */
const visit = async (search, prefix) => {
    const page = await browser.newPage();
    try {
        return await new Promise((resolvePage, reject) => {
            // A page whose modules fail to load prints nothing more.
            const timeout = setTimeout(() => reject(new Error(`browser.html?${search} printed no result in ${pageTimeout / 1000} s`)), pageTimeout);
            const settle = (done) => value => {
                clearTimeout(timeout);
                done(value);
            };
            page.on("console", message => {
                const text = message.text();
                if (text.startsWith(`${prefix} `)) settle(resolvePage)(JSON.parse(text.slice(prefix.length + 1)));
                else if (text.startsWith("ecs-benchmark-error ")) settle(reject)(new Error(text.slice("ecs-benchmark-error ".length)));
                else if (message.type() === "error") settle(reject)(new Error(text));
            });
            page.on("pageerror", settle(reject));
            void page.goto(new URL(`browser.html?${search}`, origin).href);
        });
    }
    finally {
        await page.close();
    }
};

try {
    if (options.compare !== null) {
        const { count, gpu, differences } = await visit(`compare&count=${options.compare}`, "ecs-benchmark-compare");
        console.log(`${count} entities, 20 frames, on ${gpu.vendor} ${gpu.architecture}${gpu.fallback ? " (fallback)" : ""} and in WASM:`);
        for (const [name, { rows, differing, words, largest }] of Object.entries(differences)) {
            const where = words.length === 0 ? "" : ` (${name === "frame" ? "cells" : "words"} ${words.join(", ")})`;
            console.log(`  ${name.padEnd(10)} ${String(differing).padStart(8)} of ${String(rows).padStart(8)} rows differ${where}${largest === undefined ? "" : `, by ${largest} at most`}`);
        }
    }
    else {
        for (const lane of options.lanes) {
            for (const name of benchmarks.filter(benchmark => options.filter === null || options.filter.test(benchmark))) {
                for (const count of options.sizes) {
                    const result = await visit(`lane=${lane}&name=${name}&count=${count}`, "ecs-benchmark-result");
                    console.log(`${lane.padEnd(8)} ${result.name.padEnd(48)} ${(result.median / 1e3).toFixed(1).padStart(12)} µs  ${(result.median / Math.max(1, count)).toFixed(2).padStart(10)} ns/entity  ${result.iterations} runs`);
                }
            }
        }
    }
}
finally {
    await browser.close();
    await server.close();
}
