// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { calibrationSource, copyBandwidth, environmentLine, resultLine, threadsBandwidth, type Curve } from "./benchmark.js";
import { benchmarks } from "./benchmarks.js";
import { runKeyReading } from "./keys.js";
import { threads } from "./placed.js";

/** Every worker's copy bandwidth together, through `worker_threads` running the calibration script over `parentPort`. */
const nodeThreadsBandwidth = (): Promise<Curve> => {
    const { Worker } = process.getBuiltinModule("node:worker_threads");
    const scope = `const { parentPort } = require("node:worker_threads");
        const postMessage = message => parentPort.postMessage(message);
        let onmessage = null;
        parentPort.on("message", data => onmessage({ data }));`;
    return threadsBandwidth(threads, () => {
        const worker = new Worker(`${scope}\n${calibrationSource}`, { eval: true });
        return {
            ask: message => new Promise(resolve => {
                worker.once("message", resolve);
                worker.postMessage(message);
            }),
            terminate: () => void worker.terminate(),
        };
    });
};

/**
 * Runs benchmarks bundled, on plain node: real module bindings, as in production. `scripts/perf.mjs` reads its lines.
 * - `--names` prints the benchmarks' names, one per line.
 * - `--environment` prints the environment line, with measured copy bandwidth, of one thread and of every worker.
 * - `--keys` prints the key-reading microbenchmark (`keys.ts`).
 * - Otherwise it runs the benchmark with the given name, or those whose names match a regular expression with `--match`.
 */
const [option, value] = process.argv.slice(2);
if (option === "--names") for (const { name } of benchmarks) console.log(name);
else if (option === "--keys") runKeyReading();
else if (option === "--environment") console.log(environmentLine(`node ${process.versions.node}`, { thread: copyBandwidth(), threads: await nodeThreadsBandwidth() }));
else {
    const pattern = option === "--match" && value !== undefined ? new RegExp(value) : null;
    for (const benchmark of benchmarks) {
        if (pattern === null ? benchmark.name !== option : !pattern.test(benchmark.name)) continue;
        console.log(resultLine(benchmark, await benchmark.run()));
    }
}
