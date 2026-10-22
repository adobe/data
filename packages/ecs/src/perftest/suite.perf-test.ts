// © 2026 Adobe. MIT License. See /LICENSE for details.
import { it } from "vitest";
import { benchmarks } from "./benchmarks.js";
import { report } from "./suite.js";

// Under vitest's node transform every imported binding is a getter, which inflates JS-heavy paths;
// `pnpm perf` runs the same benchmarks bundled, on plain node.
for (const benchmark of benchmarks) it(benchmark.name, async () => report(benchmark.name, await benchmark.run()), 120_000);
