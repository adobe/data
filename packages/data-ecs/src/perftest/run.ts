import { benchmarks } from "./benchmarks.js";
import { report } from "./suite.js";

/** Runs the benchmarks bundled, on plain node: real module bindings, as in production. */
const filter = process.argv[2];
for (const benchmark of benchmarks) {
    if (filter !== undefined && !benchmark.name.includes(filter)) continue;
    report(benchmark.name, await benchmark.run());
}
