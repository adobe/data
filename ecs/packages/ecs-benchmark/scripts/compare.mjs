// © 2026 Adobe. MIT License. See /LICENSE for details.
// Merges results/cpp/<lane>/*.json and results/ours/<lane>.json into results/comparison.md: nanoseconds per entity, the
// median run's time divided by the benchmark's count of entities, by scenario and count.
//
//   node scripts/compare.mjs

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = join(root, "results");

const scenarios = [
    ["BM_ComplexSystemsUpdateMixedEntities", "7 systems, mixed entities"],
    ["BM_ComplexSystemsUpdate", "7 systems"],
    ["BM_SystemsUpdateMixedEntities", "2 systems, mixed entities"],
    ["BM_SystemsUpdate", "2 systems"],
    ["BM_CreateEntities", "create entities"],
    ["BM_DestroyEntities", "destroy entities"],
    ["BM_UnpackOneComponent", "get one component"],
    ["BM_UnpackTwoComponents", "get two components"],
    ["BM_UnpackThreeComponents", "get three components"],
    ["BM_RemoveAddComponent", "remove and add a component"],
];

const read = path => JSON.parse(readFileSync(path, "utf8"));
const nanoseconds = { ns: 1, us: 1e3, ms: 1e6, s: 1e9 };

/** Each run's median time in nanoseconds, by "BM_X/N", from a Google Benchmark report. */
const mediansOf = report => new Map(report.benchmarks
    .filter(entry => entry.aggregate_name === "median" || (entry.run_type !== "aggregate" && entry.aggregate_name === undefined))
    .map(entry => [entry.run_name ?? entry.name, entry.real_time * nanoseconds[entry.time_unit ?? "ns"]]));

/** The C++ reports of a lane by library, its binaries' results merged. */
const cppLane = lane => {
    const directory = join(results, "cpp", lane);
    if (!existsSync(directory)) return new Map();
    const byLibrary = new Map();
    for (const file of readdirSync(directory).filter(name => name.endsWith(".json")).sort()) {
        const report = read(join(directory, file));
        const library = file.replace(/\.json$/, "").replace(/-(entities|extended|complex)$/, "");
        const merged = byLibrary.get(library) ?? { context: report.context, medians: new Map() };
        for (const [name, time] of mediansOf(report)) merged.medians.set(name, time);
        byLibrary.set(library, merged);
    }
    return byLibrary;
};

const ourLane = lane => {
    const path = join(results, "ours", `${lane}.json`);
    if (!existsSync(path)) return null;
    const report = read(path);
    return { context: report.context, medians: mediansOf(report) };
};

const labels = { entt: "EnTT", entityx: "EntityX", ginseng: "Ginseng", mustache: "mustache", flecs: "Flecs", "pico-ecs": "pico_ecs", "gaia-ecs": "gaia-ecs", oop: "OOP" };

const number = value => value === undefined ? "" : value >= 100 ? Math.round(value).toLocaleString("en-US") : Number(value.toPrecision(3)).toString();
const count = value => value >= 1048576 ? `${number(value / 1048576)}M` : value >= 1024 ? `${number(value / 1024)}K` : String(value);

const table = (columns, sizesOf) => {
    const lines = [];
    for (const [scenario, title] of scenarios) {
        const sizes = sizesOf(scenario, columns);
        if (sizes.length === 0) continue;
        lines.push(`### ${title} (\`${scenario}\`)`, "", "ns per entity; lower is faster. **Bold** is the fastest.", "");
        lines.push(`| Entities | ${columns.map(([label]) => label).join(" | ")} |`, `|---:|${columns.map(() => "---:").join("|")}|`);
        for (const size of sizes) {
            const values = columns.map(([, medians]) => medians.get(`${scenario}/${size}`)).map(time => time === undefined ? undefined : time / Math.max(1, size));
            const fastest = Math.min(...values.filter(value => value !== undefined));
            lines.push(`| ${count(size)} | ${values.map(value => value === undefined ? "" : value === fastest ? `**${number(value)}**` : number(value)).join(" | ")} |`);
        }
        lines.push("");
    }
    return lines.join("\n");
};

const sizesOf = (scenario, columns) => [...new Set(columns.flatMap(([, medians]) => [...medians.keys()]
    .filter(name => name.startsWith(`${scenario}/`))
    .map(name => Number(name.slice(scenario.length + 1)))))].filter(size => size > 0).sort((a, b) => a - b);

const single = cppLane("single");
const threaded = cppLane("threads");
const js = ourLane("js");
const wasm = ourLane("wasm");
const threads = ourLane("threads");

const singleColumns = [
    ...[...single].map(([library, { medians }]) => [labels[library] ?? library, medians]),
    ...(js === null ? [] : [["ours, JS", js.medians]]),
    ...(wasm === null ? [] : [["ours, WASM", wasm.medians]]),
];
const threadsColumns = [
    ...[...threaded].map(([library, { medians }]) => [`${labels[library] ?? library}, ${threaded.get(library)?.context["ecs_benchmark.threads"]} threads`, medians]),
    ...(threads === null ? [] : [[`ours, WASM, ${threads.context["ecs_benchmark.threads"]} threads`, threads.medians]]),
    ...(wasm === null ? [] : [["ours, WASM, 1 thread", wasm.medians]]),
];

const anyContext = [...single.values()][0]?.context;
const machine = anyContext?.["ecs_benchmark.machine"] ?? js?.context["ecs_benchmark.machine"];
const libraries = anyContext?.["ecs_benchmark.libraries"] ?? {};
const header = [
    "# Comparison",
    "",
    "Generated by `node scripts/compare.mjs` from `cpp/` and `ours/`; don't edit it by hand.",
    "",
    machine === undefined ? "" : `- **Machine:** ${machine.cpu}, ${machine.threads} hardware threads, ${machine.memory}, ${machine.platform}.`,
    anyContext === undefined ? "" : `- **C++:** ${anyContext["ecs_benchmark.compiler"]}, Release (\`-O3\`, LTO), the ecs_benchmark suite at \`${anyContext["ecs_benchmark.commit"].slice(0, 7)}\`; the median of Google Benchmark's repetitions.`,
    js === null ? "" : `- **Ours:** \`@adobe/ecs\` ${js.context["framework.version"]} at \`${js.context["ecs_benchmark.commit"]}\`${js.context["ecs_benchmark.dirty"] ? " with changes" : ""}, node ${js.context["ecs_benchmark.node"]}, the median of its timed runs.`,
    Object.keys(libraries).length === 0 ? "" : `- **Libraries fetched at:** ${Object.entries(libraries).map(([name, at]) => `${name} \`${at.slice(0, 7)}\``).join(", ")}.`,
].filter(line => line !== "").join("\n");

const text = [
    header,
    "## One thread",
    "Every library on one thread; ours with kernels in JS, as a page without cross-origin isolation runs them, and in WASM.",
    table(singleColumns, sizesOf),
    "## Many threads",
    "The libraries whose threading the patch switches on, against ours on its worker pool, and ours on one thread for scale. The C++ suite runs only its frames on several threads.",
    table(threadsColumns, sizesOf),
].join("\n\n");
writeFileSync(join(results, "comparison.md"), `${text}\n`);
console.log(`wrote ${join(results, "comparison.md")}`);
