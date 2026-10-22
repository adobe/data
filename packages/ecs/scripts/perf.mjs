// Runs the benchmarks, compares them with what this machine recorded last, and records them.
//
//   pnpm perf [filter]           node benchmarks whose names match the regular expression filter, each in a process
//                                of its own, compared with the last record
//   pnpm perf:browser            chromium benchmarks: main thread, workers and GPU
//   add --record                 append the results to perf/history and regenerate perf/README.md, keeping each
//                                benchmark's faster of two runs
//   pnpm perf:report             regenerate perf/README.md from perf/history
//
// Results are kept per machine, since times only compare on the same hardware.

import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, arch, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const perf = join(root, "perf");
const historyDirectory = join(perf, "history");
const descriptionsFile = join(perf, "benchmarks.json");
const readmeFile = join(perf, "README.md");
/** A change within this fraction is noise. */
const noise = 0.1;
/** Records shown in a history table. */
const shown = 8;

const flags = new Set(process.argv.slice(2).filter(argument => argument.startsWith("--")));
const [filter] = process.argv.slice(2).filter(argument => !argument.startsWith("--"));

const machine = () => {
    const cpu = cpus()[0]?.model.trim() ?? "unknown cpu";
    const cores = cpus().length;
    const memory = Math.round(totalmem() / 2 ** 30);
    const label = `${cpu}, ${cores} cores, ${memory} GB, ${platform()} ${arch()}`;
    const key = `${cpu} ${cores} cores ${memory}gb ${platform()} ${arch()}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { key, label, cpu, cores, memory, platform: platform(), arch: arch() };
};

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const readJsonLines = file => existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(line => line.trim() !== "").map(line => JSON.parse(line)) : [];
const readDescriptions = () => existsSync(descriptionsFile) ? JSON.parse(readFileSync(descriptionsFile, "utf8")) : {};
/** "node 24.15.0" is "node"; results compare within a kind across versions. */
const kindOf = environment => environment.split(" ")[0];

const nanosecondsPerN = result => (result.milliseconds * 1e6) / result.n;
/** The fastest copy bandwidth a curve measured: data in the caches. */
const peak = curve => Math.max(...curve.map(([, rate]) => rate));
const bestNanosecondsPerN = (best, bandwidth) => {
    const rate = best.on === "gpu" ? bandwidth.gpu : best.on === "threads" ? bandwidth.threads && peak(bandwidth.threads) : peak(bandwidth.thread);
    return rate === undefined ? undefined : best.bytes / rate;
};

const number = value => {
    if (value === undefined || !Number.isFinite(value)) return "";
    if (value >= 100) return Math.round(value).toLocaleString("en-US");
    return Number(value.toPrecision(3)).toString();
};
const count = value => value >= 1e6 ? `${number(value / 1e6)}M` : value >= 1e3 ? `${number(value / 1e3)}K` : String(value);
const change = (now, before) => {
    if (before === undefined) return "";
    const fraction = now / before - 1;
    // Past a factor of two, a percentage hides the size of the change.
    if (now < before / 2) return `${number(before / now)}× faster`;
    if (now > before * 2) return `${number(now / before)}× slower`;
    const text = `${fraction >= 0 ? "+" : "−"}${Math.round(Math.abs(fraction) * 100)}%`;
    return fraction > noise ? `${text} slower` : fraction < -noise ? `${text} faster` : text;
};
const ratio = (now, best) => best === undefined ? "" : `${number(now / best)}×`;

/** The newest result for each benchmark among records, and the one before it, with its record. */
const latest = records => {
    const found = new Map();
    for (let k = records.length - 1; k >= 0; k--) {
        for (const [name, result] of Object.entries(records[k].results)) {
            const entry = found.get(name);
            if (entry === undefined) found.set(name, { result, record: records[k] });
            else if (entry.previous === undefined) entry.previous = result;
        }
    }
    return found;
};

/** Runs a command, passing its output through, and collects the perf lines it prints, after the given environment. */
const collect = (command, args, known, quiet = false) => new Promise((done, failed) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
    let environment = known;
    const results = [];
    let pending = "";
    const line = text => {
        const environmentAt = text.indexOf("perf-environment ");
        const resultAt = text.indexOf("perf-result ");
        if (environmentAt >= 0) environment = JSON.parse(text.slice(environmentAt + "perf-environment ".length));
        else if (resultAt >= 0) {
            const result = JSON.parse(text.slice(resultAt + "perf-result ".length));
            results.push(result);
            if (!quiet) progress(environment, result);
        } else if (flags.has("--verbose")) console.log(text);
    };
    child.stdout.on("data", data => {
        pending += data;
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const text of lines) line(text);
    });
    child.on("close", code => {
        if (pending !== "") line(pending);
        if (code !== 0) failed(new Error(`${command} ${args.join(" ")} exited with ${code}`));
        else if (environment === undefined) failed(new Error("The run printed no environment."));
        else done({ environment, results });
    });
});

const current = machine();
const historyFile = join(historyDirectory, `${current.key}.jsonl`);
let previousResults;

const progress = (environment, result) => {
    if (previousResults === undefined) {
        const records = readJsonLines(historyFile).filter(record => kindOf(record.environment) === kindOf(environment.environment));
        previousResults = latest(records);
    }
    const now = nanosecondsPerN(result);
    const before = previousResults.get(result.name);
    const best = bestNanosecondsPerN(result.best, environment.bandwidth);
    console.log([
        result.name.padEnd(34),
        `${number(result.milliseconds)} ms`.padStart(12),
        `${number(now)} ns/${result.per}`.padEnd(32),
        `best ${number(best)}`.padEnd(14),
        ratio(now, best).padStart(9),
        before === undefined ? "" : `  ${change(now, nanosecondsPerN(before.result))} vs ${before.record.commit}`,
    ].join(" "));
};

const run = async () => {
    if (flags.has("--browser")) {
        execFileSync("pnpm", ["exec", "playwright", "install", "chromium"], { cwd: root, stdio: "ignore" });
        const browserArgs = ["exec", "vitest", "--run", "--config", "vitest.perf.config.ts", "--project", "perf-browser"];
        if (!flags.has("--record")) return collect("pnpm", browserArgs);
        // A record keeps each benchmark's faster of two runs, as for node.
        const first = await collect("pnpm", browserArgs, undefined, true);
        const second = await collect("pnpm", browserArgs, undefined, true);
        const results = first.results.map(result => {
            const other = second.results.find(({ name }) => name === result.name);
            return other !== undefined && other.milliseconds < result.milliseconds ? other : result;
        });
        for (const result of results) progress(first.environment, result);
        return { environment: first.environment, results };
    }
    execFileSync("pnpm", ["exec", "vite", "build", "--config", "vite.perf.config.ts", "--logLevel", "warn"], { cwd: root, stdio: "inherit" });
    // Each benchmark runs in a fresh process, so none inherits another's heap or compiled code.
    const { environment } = await collect("node", ["dist/perf/run.js", "--environment"]);
    const pattern = filter === undefined ? null : new RegExp(filter);
    const names = execFileSync("node", ["dist/perf/run.js", "--names"], { cwd: root, encoding: "utf8" }).split("\n").filter(name => name !== "" && (pattern === null || pattern.test(name)));
    // A record keeps the faster of two processes per benchmark, so one disturbed process doesn't stand.
    const repeats = flags.has("--record") ? 2 : 1;
    const results = [];
    for (const name of names) {
        let fastest;
        for (let k = 0; k < repeats; k++) {
            for (const result of (await collect("node", ["dist/perf/run.js", name], environment, true)).results) {
                if (fastest === undefined || result.milliseconds < fastest.milliseconds) fastest = result;
            }
        }
        if (fastest === undefined) continue;
        progress(environment, fastest);
        results.push(fastest);
    }
    return { environment, results };
};

const record = ({ environment, results }) => {
    mkdirSync(historyDirectory, { recursive: true });
    // Records themselves don't make the tree dirty.
    const dirty = git("status", "--porcelain", "--", ".", ":!perf") !== "";
    const entry = {
        commit: git("rev-parse", "--short", "HEAD"),
        dirty,
        date: new Date().toISOString(),
        machine: current,
        environment: environment.environment,
        bandwidth: environment.bandwidth,
        results: Object.fromEntries(results.map(({ name, milliseconds, n }) => [name, { milliseconds, n }])),
    };
    appendFileSync(historyFile, `${JSON.stringify(entry)}\n`);
    const descriptions = readDescriptions();
    for (const { name, milliseconds: _, ...description } of results) descriptions[name] = description;
    writeFileSync(descriptionsFile, `${JSON.stringify(descriptions, null, 4)}\n`);
};

const table = (header, rows) => [
    `| ${header.join(" | ")} |`,
    `|${header.map((_, k) => k === 0 ? "---" : "---:").join("|")}|`,
    ...rows.map(row => `| ${row.join(" | ")} |`),
].join("\n");

const megabytes = bytes => bytes >= 2 ** 20 ? `${number(bytes / 2 ** 20)} MB` : `${number(bytes / 2 ** 10)} KB`;
const curveText = curve => curve.map(([size, rate]) => `${number(rate)} at ${megabytes(size)}`).join(", ");
const commitOf = record => `\`${record.commit}${record.dirty ? "+" : ""}\``;

const report = () => {
    const descriptions = readDescriptions();
    const files = existsSync(historyDirectory) ? readdirSync(historyDirectory).filter(file => file.endsWith(".jsonl")).sort() : [];
    const sections = [];
    for (const file of files) {
        const records = readJsonLines(join(historyDirectory, file));
        if (records.length === 0) continue;
        sections.push(`## ${records[records.length - 1].machine.label}`);
        const kinds = [...new Set(records.map(record => kindOf(record.environment)))].sort();
        for (const kind of kinds) {
            const ofKind = records.filter(record => kindOf(record.environment) === kind);
            const found = latest(ofKind);
            const newest = ofKind[ofKind.length - 1];
            const { thread, threads, gpu } = newest.bandwidth;
            sections.push(`### ${newest.environment}`);
            sections.push([
                `Latest ${commitOf(newest)}, ${newest.date.slice(0, 10)}. Copy bandwidth in GB/s by working set:`,
                `- One thread: ${curveText(thread)}.`,
                ...(threads === undefined ? [] : [`- All workers: ${curveText(threads)}.`]),
                ...(gpu === undefined ? [] : [`- GPU: ${number(gpu)}.`]),
            ].join("\n"));
            const order = Object.keys(descriptions);
            const names = [...found.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
            sections.push(table(["Benchmark", "Per", "N", "Typical N", "ms", "ns per N", "Best ns per N", "× best", "Room, ms", "Change"], names.map(name => {
                const { result, record, previous } = found.get(name);
                const description = descriptions[name];
                const now = nanosecondsPerN(result);
                const best = description === undefined ? undefined : bestNanosecondsPerN(description.best, record.bandwidth);
                return [
                    name,
                    description?.per ?? "",
                    count(result.n),
                    description === undefined ? "" : `${count(description.typical[0])}–${count(description.typical[1])}`,
                    number(result.milliseconds),
                    number(now),
                    number(best),
                    ratio(now, best),
                    best === undefined ? "" : number(result.milliseconds - (best * result.n) / 1e6),
                    previous === undefined ? "" : change(now, nanosecondsPerN(previous)),
                ];
            })));
            const recent = ofKind.slice(-shown);
            if (recent.length > 1) {
                sections.push(`History, ns per N, oldest first:`);
                sections.push(table(["Benchmark", ...recent.map(record => `${commitOf(record)} ${record.date.slice(5, 10)}`)], names.map(name => [
                    name,
                    ...recent.map(record => record.results[name] === undefined ? "" : number(nanosecondsPerN(record.results[name]))),
                ])));
            }
        }
    }
    const benchmarks = Object.entries(descriptions).map(([name, description]) => [
        `### ${name}`,
        "",
        description.operation,
        "",
        `- **N:** ${count(description.n)} ${description.per}; usually ${count(description.typical[0])}–${count(description.typical[1])}.`,
        `- **Best:** ${number(description.best.bytes)} bytes per N at the copy bandwidth of ${description.best.on === "threads" ? "all workers" : description.best.on === "gpu" ? "the GPU" : "one thread"}, the fastest it measured. ${description.best.basis}`,
    ].join("\n"));
    const text = [
        "# ecs performance",
        "Generated by `pnpm perf:report` from `history/`; don't edit it by hand.",
        [
            "- `pnpm perf [filter]` runs the node benchmarks, bundled as in production, and compares each with this machine's last record. `pnpm perf:browser` runs the chromium ones: main thread, workers and GPU.",
            "- Add `--record` to append the results to `history/<machine>.jsonl` and regenerate this file. Record on an idle machine, and commit the record with the change it measures.",
            "- **ns per N** is the fastest run's time divided by N. **Best** is the time to move the fewest bytes an ideal implementation must, in this ECS's storage model, at the fastest copy bandwidth the run measured, with data in the caches; **× best** is how far from it the run is, and **Room** the milliseconds between them. **Change** compares with the previous record on the same machine; beyond ±10% it says slower or faster.",
        ].join("\n"),
        ...sections,
        "## Benchmarks",
        ...benchmarks,
    ].join("\n\n");
    writeFileSync(readmeFile, `${text}\n`);
};

if (flags.has("--report")) report();
else {
    const results = await run();
    if (flags.has("--record")) {
        record(results);
        report();
        console.log(`Recorded to ${historyFile}`);
    }
}
