/// <reference types="@vitest/browser-playwright" />
import { it } from "vitest";
import { cdp } from "vitest/browser";
import { Entity, System, workers } from "../../../index.js";
import { create } from "../../../implementation/index.js";
import { bindCompletion } from "../features/completion/dom.js";
import { bindFilters, filterRows } from "../features/filter/dom.js";
import { addGenerated } from "../features/generate/model.js";
import { bindRows, createRows, placeRows } from "../features/todos/dom.js";
import { toggleTodo } from "../features/todos/model.js";
import { entityOfElement } from "../shared/attach.js";
import { createApp, type App } from "./app.js";
import { logFailures } from "./log-failures.js";

/**
 * Where a run's fixed cost goes in Chromium: runs timed one at a time and back to back, in a world gaining the app's
 * observer systems one by one and in the app at three sizes, then a sampled profile of toggling at 10K. Logged, never
 * asserted: `pnpm test:perf src/samples/todo`.
 */

const nothing = System.create({ name: "profile/nothing" }, () => {});
const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;

/** The median of `repeats` runs awaited one at a time, and the mean of as many issued back to back. */
const timeRuns = async (run: (repeat: number) => Promise<unknown>, repeats: number): Promise<string> => {
    const times: number[] = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
        const start = performance.now();
        await run(repeat);
        times.push(performance.now() - start);
    }
    const start = performance.now();
    const pending: Promise<unknown>[] = [];
    for (let repeat = 0; repeat < repeats; repeat++) pending.push(run(repeat));
    await Promise.all(pending);
    return `${median(times).toFixed(4)} | ${((performance.now() - start) / repeats).toFixed(4)}`;
};

const markup = "<todo-toggle-all></todo-toggle-all><todo-list></todo-list><todo-summary></todo-summary><todo-filters></todo-filters>";

/** The app on the page with `n` todos and their rows, and its todos in list order. */
const appWith = async (n: number): Promise<{ readonly app: App; readonly listed: readonly Entity[] }> => {
    document.body.innerHTML = markup;
    const app = createApp(document.body);
    await app.world.run(addGenerated, { count: n });
    await app.world.run(createRows);
    return { app, listed: [...document.querySelectorAll("todo-row")].map(entityOfElement) };
};

/** The share of a profile's samples each function took, by itself, largest first. */
const selfTimes = (profile: { readonly nodes: readonly { readonly id: number; readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number } }[]; readonly samples?: readonly number[] }): string[] => {
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const shares = new Map<string, number>();
    const samples = profile.samples ?? [];
    for (const sample of samples) {
        const frame = nodes.get(sample)?.callFrame;
        if (frame === undefined) continue;
        const key = `${frame.functionName === "" ? "(anonymous)" : frame.functionName} ${frame.url.split("/").pop()?.split("?")[0] ?? ""}:${frame.lineNumber + 1}`;
        shares.set(key, (shares.get(key) ?? 0) + 1);
    }
    return [...shares].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key, count]) => `${(100 * count / samples.length).toFixed(1)}% ${key}`);
};

it("profiles a run's fixed cost", async () => {
    const lines = ["| Setup | one at a time, ms | back to back, ms per run |", "|---|---:|---:|"];
    lines.push(`| await of a resolved promise | ${await timeRuns(() => Promise.resolve(), 2001)} |`);
    lines.push(`| a task: MessageChannel round trip | ${await timeRuns(() => new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            channel.port1.close();
            resolve(null);
        };
        channel.port2.postMessage(null);
    }), 2001)} |`);
    {
        await using world = create({ [workers]: 0 });
        lines.push(`| empty world, a run that changes nothing | ${await timeRuns(() => world.run(nothing), 2001)} |`);
        for (const system of [bindRows, placeRows, filterRows, bindFilters, bindCompletion, logFailures, createRows]) {
            world.add(system);
            lines.push(`| + ${system.name} | ${await timeRuns(() => world.run(nothing), 2001)} |`);
        }
    }
    for (const n of [1000, 10000, 100000]) {
        const { app, listed } = await appWith(n);
        lines.push(`| app with ${n} todos, a run that changes nothing | ${await timeRuns(() => app.world.run(nothing), 1001)} |`);
        lines.push(`| app with ${n} todos, toggle one | ${await timeRuns(repeat => app.world.run(toggleTodo, { entity: listed[(repeat * 7) % n] ?? Entity.none }), 1001)} |`);
        await app.dispose();
    }
    console.log(lines.join("\n"));

    const { app, listed } = await appWith(10000);
    const session = cdp();
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 50 });
    await session.send("Profiler.start");
    for (let i = 0; i < 4000; i++) await app.world.run(toggleTodo, { entity: listed[(i * 7) % listed.length] ?? Entity.none });
    const { profile } = await session.send("Profiler.stop");
    console.log(["Toggling one of 10K, self time by function:", ...selfTimes(profile)].join("\n"));
    await app.dispose();
    document.body.replaceChildren();
});
