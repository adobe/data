import { copyBandwidth, environmentLine, resultLine } from "./benchmark.js";
import { benchmarks } from "./benchmarks.js";

/**
 * Runs benchmarks bundled, on plain node: real module bindings, as in production. `scripts/perf.mjs` reads its lines.
 * - `--names` prints the benchmarks' names, one per line.
 * - `--environment` prints the environment line, with measured copy bandwidth.
 * - Otherwise it runs the benchmark with the given name, or those whose names match a regular expression with `--match`.
 */
const [option, value] = process.argv.slice(2);
if (option === "--names") for (const { name } of benchmarks) console.log(name);
else if (option === "--environment") console.log(environmentLine(`node ${process.versions.node}`, { thread: copyBandwidth() }));
else {
    const pattern = option === "--match" && value !== undefined ? new RegExp(value) : null;
    for (const benchmark of benchmarks) {
        if (pattern === null ? benchmark.name !== option : !pattern.test(benchmark.name)) continue;
        console.log(resultLine(benchmark, await benchmark.run()));
    }
}
