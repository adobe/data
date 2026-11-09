// © 2026 Adobe. MIT License. See /LICENSE for details.
// Runs the suite's benchmarks on the ECS, bundled for plain node as an app ships, each benchmark at each count of
// entities in a process of its own, and writes results/ours/<lane>.json in Google Benchmark's shape.
//
//   node scripts/ours.mjs [--lane js|wasm|threads] [--filter <regular expression>] [--sizes <a,b,…>] [--skip-build]
//
// Lanes: js, kernels in JS on one thread, as a page without cross-origin isolation runs them; wasm, kernels in WASM on
// one thread; threads, kernels in WASM on the world's thread and a pool worker for every other hardware thread.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = join(root, "results", "ours");
const main = join(root, "dist", "perftest", "main.js");

const defaultSizes = [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 2097152];

const options = (() => {
    const args = process.argv.slice(2);
    const value = name => {
        const at = args.indexOf(name);
        return at >= 0 ? args[at + 1] : undefined;
    };
    return {
        lanes: value("--lane") === undefined ? ["js", "wasm", "threads"] : [value("--lane")],
        filter: value("--filter") === undefined ? null : new RegExp(value("--filter")),
        sizes: value("--sizes")?.split(",").map(Number) ?? defaultSizes,
        skipBuild: args.includes("--skip-build"),
    };
})();

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

/** Runs one benchmark in a fresh process and resolves with the result line it prints. */
const measure = (lane, name, count) => new Promise((done, failed) => {
    const child = spawn("node", [main, lane, name, String(count)], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
    let text = "";
    child.stdout.on("data", data => { text += data; });
    child.on("close", code => {
        const line = text.split("\n").find(candidate => candidate.startsWith("ecs-benchmark-result "));
        if (code !== 0 || line === undefined) failed(new Error(`${lane} ${name}/${count} exited with ${code}`));
        else done(JSON.parse(line.slice("ecs-benchmark-result ".length)));
    });
});

const runAll = async () => {
    if (!options.skipBuild) execFileSync("pnpm", ["exec", "vite", "build", "--logLevel", "warn"], { cwd: root, stdio: "inherit" });
    const names = execFileSync("node", [main, "--names"], { cwd: root, encoding: "utf8" }).split("\n").filter(name => name !== "" && (options.filter === null || options.filter.test(name)));
    const version = JSON.parse(readFileSync(join(root, "node_modules", "@adobe", "ecs", "package.json"), "utf8")).version;
    mkdirSync(results, { recursive: true });

    for (const lane of options.lanes) {
        const benchmarks = [];
        let threads = 0;
        for (const name of names) {
            for (const count of options.sizes) {
                const result = await measure(lane, name, count);
                threads = result.threads;
                console.log(`${lane.padEnd(8)} ${result.name.padEnd(48)} ${(result.median / 1e3).toFixed(1).padStart(12)} µs  ${(result.median / Math.max(1, count)).toFixed(2).padStart(10)} ns/entity  ${result.iterations} runs`);
                const shared = { run_name: result.name, run_type: "aggregate", repetitions: 1, threads: 1, iterations: result.iterations, time_unit: "ns", entities: count };
                benchmarks.push(
                    { name: `${result.name}_median`, ...shared, aggregate_name: "median", real_time: result.median, cpu_time: result.median },
                    { name: `${result.name}_mean`, ...shared, aggregate_name: "mean", real_time: result.mean, cpu_time: result.mean },
                );
            }
        }
        const context = {
            date: new Date().toISOString(),
            "framework.name": `@adobe/ecs (${lane})`,
            "framework.version": version,
            "ecs_benchmark.lane": lane,
            "ecs_benchmark.threads": lane === "threads" ? threads + 1 : 1,
            "ecs_benchmark.workers": threads,
            "ecs_benchmark.commit": git("rev-parse", "--short", "HEAD"),
            "ecs_benchmark.dirty": git("status", "--porcelain", "--", ".", ":!results") !== "",
            "ecs_benchmark.node": process.versions.node,
            "ecs_benchmark.machine": { cpu: cpus()[0]?.model ?? "unknown", threads: availableParallelism(), memory: `${Math.round(totalmem() / 2 ** 30)} GB`, platform: `${process.platform} ${process.arch}` },
        };
        // A run of some benchmarks replaces theirs in the lane's file and keeps the rest.
        const file = join(results, `${lane}.json`);
        const measured = new Set(benchmarks.map(entry => entry.run_name));
        const kept = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).benchmarks.filter(entry => !measured.has(entry.run_name)) : [];
        writeFileSync(file, `${JSON.stringify({ context, benchmarks: [...kept, ...benchmarks] }, null, 2)}\n`);
    }
};

runAll().catch(error => {
    console.error(error);
    process.exit(1);
});
