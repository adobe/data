// © 2026 Adobe. MIT License. See /LICENSE for details.
// Runs the suite's benchmarks on the ECS, bundled for plain node as an app ships, each benchmark at each count of
// entities in a process of its own, writes results/ours/<lane>.json in Google Benchmark's shape, and compares each
// result with the last one this machine recorded.
//
//   node scripts/ours.mjs [--lane js|wasm|threads] [--filter <regular expression>] [--sizes <a,b,…>] [--full] [--through]
//                         [--skip-build] [--record]
//
// By default it measures 16K, 256K and 1M entities; --full measures from 1 entity to 2M, as --record does. --through
// adds the frames through each of the 7-system benchmarks' systems, which tell what each costs. The GPU lane's frames
// run in a browser, by scripts/gpu.mjs. --record appends the results to results/history/<machine>.jsonl,
// which later runs compare with. Results are kept per machine, since times only compare on the same hardware.
//
// Lanes: js, kernels in JS on one thread, as a page without cross-origin isolation runs them; wasm, kernels in WASM on
// one thread; threads, kernels in WASM on the world's thread and a pool worker for every other hardware thread.

import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, availableParallelism, cpus, platform, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = join(root, "results", "ours");
const history = join(root, "results", "history");
/** A change within this fraction is noise. */
const noise = 0.1;
const main = join(root, "dist", "perftest", "main.js");

const defaultSizes = [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 2097152];
const quickSizes = [16384, 262144, 1048576];

const options = (() => {
    const args = process.argv.slice(2);
    const value = name => {
        const at = args.indexOf(name);
        return at >= 0 ? args[at + 1] : undefined;
    };
    return {
        lanes: value("--lane") === undefined ? ["js", "wasm", "threads"] : [value("--lane")],
        filter: value("--filter") === undefined ? null : new RegExp(value("--filter")),
        sizes: value("--sizes")?.split(",").map(Number) ?? (args.includes("--full") || args.includes("--record") ? defaultSizes : quickSizes),
        through: args.includes("--through"),
        skipBuild: args.includes("--skip-build"),
        record: args.includes("--record"),
    };
})();

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const machineKey = () => `${cpus()[0]?.model.trim() ?? "unknown cpu"} ${cpus().length} cores ${Math.round(totalmem() / 2 ** 30)}gb ${platform()} ${arch()}`
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const historyFile = join(history, `${machineKey()}.jsonl`);
const readHistory = () => existsSync(historyFile) ? readFileSync(historyFile, "utf8").split("\n").filter(line => line.trim() !== "").map(line => JSON.parse(line)) : [];

/** Each result's nanoseconds per entity against the newest record of it on this lane, and the changes beyond noise. */
const compareWithHistory = (lane, measured) => {
    const records = readHistory().filter(record => record.lane === lane).reverse();
    const changes = [];
    for (const [name, time] of measured) {
        const record = records.find(candidate => candidate.results[name] !== undefined);
        if (record === undefined) continue;
        const ratio = time / record.results[name];
        if (Math.abs(ratio - 1) > noise) changes.push({ name, ratio, before: record.results[name], after: time, commit: record.commit });
    }
    const compared = measured.filter(([name]) => records.some(record => record.results[name] !== undefined)).length;
    if (records.length === 0) {
        console.log(`${lane}: no record on this machine yet; --record makes one`);
        return;
    }
    const slower = changes.filter(change => change.ratio > 1).sort((a, b) => b.ratio - a.ratio);
    const faster = changes.filter(change => change.ratio < 1).sort((a, b) => a.ratio - b.ratio);
    const line = change => `  ${change.name.padEnd(48)} ${(change.before / 1e3).toFixed(1).padStart(12)} → ${(change.after / 1e3).toFixed(1).padStart(12)} µs  ${change.ratio > 1 ? "+" : ""}${((change.ratio - 1) * 100).toFixed(0)}%  (against ${change.commit})`;
    console.log(`${lane}: ${compared} compared with the last record, ${slower.length} slower and ${faster.length} faster by more than ${noise * 100}%`);
    if (slower.length > 0) console.log(["REGRESSIONS", ...slower.map(line)].join("\n"));
    if (faster.length > 0) console.log(["improvements", ...faster.map(line)].join("\n"));
};

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
    const names = execFileSync("node", [main, "--names"], { cwd: root, encoding: "utf8" }).split("\n").filter(name => name !== "" && !name.startsWith("GPU_")
        && (options.through || !name.includes("_Through_")) && (options.filter === null || options.filter.test(name)));
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
        const measured = benchmarks.filter(entry => entry.aggregate_name === "median").map(entry => [entry.run_name, entry.real_time]);
        compareWithHistory(lane, measured);
        if (options.record) {
            mkdirSync(history, { recursive: true });
            appendFileSync(historyFile, `${JSON.stringify({
                date: new Date().toISOString(), commit: git("rev-parse", "--short", "HEAD"), dirty: git("status", "--porcelain", "--", "..", ":!results") !== "",
                ecs: version, node: process.versions.node, lane, threads: lane === "threads" ? threads + 1 : 1, results: Object.fromEntries(measured),
            })}\n`);
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
        const replaced = new Set(benchmarks.map(entry => entry.run_name));
        const kept = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).benchmarks.filter(entry => !replaced.has(entry.run_name)) : [];
        writeFileSync(file, `${JSON.stringify({ context, benchmarks: [...kept, ...benchmarks] }, null, 2)}\n`);
    }
};

runAll().catch(error => {
    console.error(error);
    process.exit(1);
});
