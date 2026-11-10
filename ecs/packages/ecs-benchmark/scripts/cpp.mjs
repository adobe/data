// © 2026 Adobe. MIT License. See /LICENSE for details.
// Fetches the ecs_benchmark suite at its pinned commit, builds it Release with CMake and Ninja, and runs its Google
// Benchmark binaries, writing their JSON to results/cpp/<lane>/<binary>.json.
//
//   node scripts/cpp.mjs [--suite <checkout>] [--lane single|threads] [--repetitions <n>] [--skip-build] [--skip-run] [--through-only] [--sizes <a,b,…>]
//
// - The suite is copied into cpp/source, from --suite or a clone of the pinned commit, and the patches in patches/
//   applied: pin-dependencies.patch fetches the libraries the suite follows on a branch (entityx, ginseng, mustache,
//   pico_headers) at their last commit before the suite's; multi-threaded.patch changes nothing without ECS_BENCHMARK_THREADS, so cpp/build-single builds the suite as
//   published, and cpp/build-threads defines it as the thread count; systems-prefix.patch changes nothing without
//   ECS_BENCHMARK_SYSTEMS, which adds only the first that many of the seven systems to Flecs's and mustache's apps.
// - The 7-system benchmarks of Flecs and mustache run again with each shorter prefix of the systems, as
//   BM_ComplexSystemsUpdate[MixedEntities]_Through_<System>, in results/cpp/<lane>/<library>-through.json;
//   --through-only runs just those.
// - vcpkg, which the suite's CMake fetches, lives in cpp/home, so nothing is written outside the package.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, "cpp");
const source = join(work, "source");
const home = join(work, "home");
const patches = join(root, "patches");
const results = join(root, "results", "cpp");

const repository = "https://github.com/abeimler/ecs_benchmark";
const commit = "98678f746e0e2f04c37a3332453c8d98daa94f92";

/** Every hardware thread: the world's thread and a pool worker on each other one, as the ECS's threads lane runs. */
const threads = availableParallelism();

/** The suite's entity counts, every fourth power of two from 1 to 1M, and its largest, 2M. */
const defaultSizes = [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 2097152];

/** The libraries the suite's own task runs, by their binaries' names. */
const libraries = ["entt", "entityx", "ginseng", "mustache", "flecs", "pico-ecs", "gaia-ecs"];

/** The libraries the patch runs on several threads; gaia-ecs 0.8.6 has no parallel query execution to switch on. */
const threadedLibraries = ["flecs", "mustache"];

/** The seven systems of the 7-system benchmarks, in the order a frame runs them. */
const complexSystems = ["MovementSystem", "DataSystem", "MoreComplexSystem", "HealthSystem", "DamageSystem", "SpriteSystem", "RenderSystem"];

const entityBenchmarks = ["CreateEntities", "DestroyEntities", "UnpackOneComponent", "UnpackTwoComponents", "UnpackThreeComponents", "RemoveAddComponent"];

const options = (() => {
    const args = process.argv.slice(2);
    const value = name => {
        const at = args.indexOf(name);
        return at >= 0 ? args[at + 1] : undefined;
    };
    return {
        suite: value("--suite"),
        lanes: value("--lane") === undefined ? ["single", "threads"] : [value("--lane")],
        repetitions: Number(value("--repetitions") ?? 3),
        skipBuild: args.includes("--skip-build"),
        skipRun: args.includes("--skip-run"),
        throughOnly: args.includes("--through-only"),
        sizes: value("--sizes")?.split(",").map(Number) ?? defaultSizes,
    };
})();

const run = (command, args, settings = {}) => {
    console.log(`$ ${command} ${args.join(" ")}`);
    const result = spawnSync(command, args, { stdio: "inherit", ...settings });
    if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
};

const output = (command, args, settings = {}) => execFileSync(command, args, { encoding: "utf8", ...settings }).trim();

/** The suite's sources at the pinned commit, with the patch applied, in cpp/source. */
const prepare = () => {
    const stamp = join(source, ".ecs-benchmark-source");
    const files = readdirSync(patches).filter(name => name.endsWith(".patch")).sort().map(name => join(patches, name));
    const wanted = [commit, ...files.map(file => readFileSync(file, "utf8"))].join("\n");
    if (existsSync(stamp) && readFileSync(stamp, "utf8") === wanted) return;
    rmSync(source, { recursive: true, force: true });
    let from = options.suite;
    if (from === undefined) {
        from = join(work, "fetch");
        rmSync(from, { recursive: true, force: true });
        mkdirSync(from, { recursive: true });
        run("git", ["init", "--quiet"], { cwd: from });
        run("git", ["fetch", "--depth", "1", repository, commit], { cwd: from });
        run("git", ["checkout", "--quiet", "FETCH_HEAD"], { cwd: from });
    }
    const at = output("git", ["rev-parse", "HEAD"], { cwd: from });
    if (at !== commit) throw new Error(`${from} is at ${at}, not the pinned ${commit}`);
    cpSync(from, source, { recursive: true, filter: path => !/\/(\.git|build|out)$/.test(path) });
    for (const file of files) run("patch", ["-p1", "--forward", "--input", file], { cwd: source });
    writeFileSync(stamp, wanted);
};

const environment = { ...process.env, HOME: home, VCPKG_DISABLE_METRICS: "1" };

const buildDirectory = lane => join(work, `build-${lane}`);

/** Binaries a lane runs, with the filter of each. */
const binariesOf = (lane, sizes) => {
    const counts = `(${sizes.join("|")})`;
    const systems = `^BM_SystemsUpdate(MixedEntities)?/${counts}$`;
    const complex = `^BM_ComplexSystemsUpdate(MixedEntities)?/${counts}$`;
    const entities = `^BM_(${entityBenchmarks.join("|")})/${counts}$`;
    if (lane === "threads") return threadedLibraries.flatMap(library => [[library, library, systems], [`${library}-extended`, `${library}-extended`, complex]]);
    return [
        ...libraries.flatMap(library => [[library, library, systems], [`${library}-extended`, `${library}-extended`, complex], [`${library}-entities`, `${library}-entities`, entities]]),
        ["oop", "oop", systems],
        ["oop", "oop-complex", complex],
    ];
};

const build = lane => {
    const directory = buildDirectory(lane);
    mkdirSync(home, { recursive: true });
    // vcpkg's gsl-lite is 1.x, whose defaults drop the `gsl` namespace the suite, written for 0.x, uses.
    const defines = ["-Dgsl_CONFIG_DEFAULTS_VERSION=0", ...lane === "threads" ? [`-DECS_BENCHMARK_THREADS=${threads}`] : []];
    const flags = [`-DCMAKE_CXX_FLAGS=${defines.join(" ")}`];
    const configure = ["-S", source, "-B", directory, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", "-DENABLE_TESTING=OFF", "-DENABLE_BENCHMARKS=ON", ...flags];
    // The suite's benchmark folders read options its src folder declares, so they're added on a second configure.
    run("cmake", configure, { env: environment });
    run("cmake", configure, { env: environment });
    const targets = [...new Set(binariesOf(lane, defaultSizes).map(([, binary]) => `ecs-benchmark-${binary}`))];
    run("ninja", ["-C", directory, ...targets], { env: environment });
};

/** The commit each library's sources were fetched at. */
const libraryCommits = lane => {
    const deps = join(buildDirectory(lane), "_deps");
    if (!existsSync(deps)) return {};
    return Object.fromEntries(readdirSync(deps).filter(name => name.endsWith("-src")).flatMap(name => {
        try {
            return [[name.slice(0, -"-src".length), output("git", ["rev-parse", "HEAD"], { cwd: join(deps, name) })]];
        }
        catch {
            return [];
        }
    }));
};

const benchmark = (lane, sizes) => {
    const directory = join(results, lane);
    mkdirSync(directory, { recursive: true });
    const compiler = output("c++", ["--version"]).split("\n")[0];
    const machine = { cpu: cpus()[0]?.model ?? "unknown", threads: availableParallelism(), memory: `${Math.round(totalmem() / 2 ** 30)} GB`, platform: `${process.platform} ${process.arch}` };
    const record = (report, out) => {
        report.context["ecs_benchmark.commit"] = commit;
        report.context["ecs_benchmark.lane"] = lane;
        report.context["ecs_benchmark.threads"] = lane === "threads" ? threads : 1;
        report.context["ecs_benchmark.compiler"] = compiler;
        report.context["ecs_benchmark.machine"] = machine;
        report.context["ecs_benchmark.libraries"] = libraryCommits(lane);
        writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    };
    for (const [folder, binary, filter] of options.throughOnly ? [] : binariesOf(lane, sizes)) {
        const path = join(buildDirectory(lane), "benchmark", "benchmarks", folder, `ecs-benchmark-${binary}`);
        const out = join(directory, `${binary}.json`);
        run(path, [
            `--benchmark_filter=${filter}`,
            `--benchmark_repetitions=${options.repetitions}`,
            "--benchmark_report_aggregates_only=true",
            `--benchmark_out=${out}`,
            "--benchmark_out_format=json",
            "--benchmark_format=console",
        ]);
        record(JSON.parse(readFileSync(out, "utf8")), out);
    }
    const counts = `(${sizes.join("|")})`;
    for (const library of threadedLibraries) {
        const binary = `${library}-extended`;
        const path = join(buildDirectory(lane), "benchmark", "benchmarks", binary, `ecs-benchmark-${binary}`);
        const scratch = join(directory, `${library}-through.partial.json`);
        const merged = [];
        let context;
        for (let k = 0; k < complexSystems.length - 1; k++) {
            run(path, [
                `--benchmark_filter=^BM_ComplexSystemsUpdate(MixedEntities)?/${counts}$`,
                `--benchmark_repetitions=${options.repetitions}`,
                "--benchmark_report_aggregates_only=true",
                `--benchmark_out=${scratch}`,
                "--benchmark_out_format=json",
                "--benchmark_format=console",
            ], { env: { ...process.env, ECS_BENCHMARK_SYSTEMS: String(k + 1) } });
            const report = JSON.parse(readFileSync(scratch, "utf8"));
            context = report.context;
            const rename = name => name.replace(/^(BM_ComplexSystemsUpdate(?:MixedEntities)?)\//, `$1_Through_${complexSystems[k]}/`);
            merged.push(...report.benchmarks.map(entry => ({ ...entry, name: rename(entry.name), run_name: rename(entry.run_name ?? entry.name) })));
        }
        rmSync(scratch, { force: true });
        record({ context, benchmarks: merged }, join(directory, `${library}-through.json`));
    }
};

prepare();
for (const lane of options.lanes) {
    if (!options.skipBuild) build(lane);
    if (!options.skipRun) benchmark(lane, options.sizes);
}
