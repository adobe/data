import { copyBandwidth, environmentLine, resultLine } from "./benchmark.js";
import { benchmarks } from "./benchmarks.js";

/** Runs the benchmarks bundled, on plain node: real module bindings, as in production. `scripts/perf.mjs` reads its lines. */
const filter = process.argv[2];
console.log(environmentLine(`node ${process.versions.node}`, { thread: copyBandwidth() }));
for (const benchmark of benchmarks) {
    if (filter !== undefined && !benchmark.name.includes(filter)) continue;
    console.log(resultLine(benchmark, await benchmark.run()));
}
