import { copyBandwidth, environmentLine, resultLine } from "./benchmark.js";
import { benchmarks } from "./benchmarks.js";

/**
 * Runs the benchmarks bundled, on plain node: real module bindings, as in production. `scripts/perf.mjs` reads its
 * lines. The filter is a regular expression the names must match.
 */
const filter = process.argv[2] === undefined ? undefined : new RegExp(process.argv[2]);
console.log(environmentLine(`node ${process.versions.node}`, { thread: copyBandwidth() }));
for (const benchmark of benchmarks) {
    if (filter !== undefined && !filter.test(benchmark.name)) continue;
    console.log(resultLine(benchmark, await benchmark.run()));
}
