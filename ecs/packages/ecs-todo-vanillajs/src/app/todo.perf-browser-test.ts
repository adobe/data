// © 2026 Adobe. MIT License. See /LICENSE for details.
import { it } from "vitest";
import { Entity, System, type World } from "@adobe/ecs";
import { toggleAll } from "../features/completion/model/index.js";
import { filter, setFilter } from "../features/filter/model/index.js";
import { addGenerated } from "../features/generate/model/index.js";
import { addTodo, done, editTodo, moveTodo, toggleTodo } from "../features/todos/model/index.js";
import { todosOf } from "../features/todos/model/todos.test-helper.js";
import { nextTick, watchTicks } from "../features/page/view/ticks.test-helper.js";
import { createApp } from "./function.create-app.js";

/**
 * How the app's DOM path scales, with 1K and 10K todos: each operation's run is timed, the observer systems that run
 * after it included, and then run once more with the DOM's mutations counted, those of the tick after it included.
 * Numbers are logged, never asserted: `pnpm test:perf`.
 */

const markup = `
<header><todo-toggle-all></todo-toggle-all><todo-entry></todo-entry></header>
<todo-list style="display: block; max-height: 600px"></todo-list>
<footer><todo-summary></todo-summary><todo-filters></todo-filters></footer>`;

const found = <K extends keyof HTMLElementTagNameMap>(name: K): HTMLElementTagNameMap[K] => {
    const element = document.querySelector(name);
    if (element === null) throw new Error(`No ${name}.`);
    return element;
};

/** The mutations of the page and of every open shadow root on it that `change` makes, until the tick after it. */
const mutationsOf = async (change: () => Promise<unknown>): Promise<number> => {
    let count = 0;
    const observer = new MutationObserver(records => {
        count += records.length;
    });
    const options = { attributes: true, childList: true, characterData: true, subtree: true };
    observer.observe(document.body, options);
    for (const element of document.body.querySelectorAll("*")) if (element.shadowRoot !== null) observer.observe(element.shadowRoot, options);
    const ticked = nextTick();
    await change();
    await ticked;
    count += observer.takeRecords().length;
    observer.disconnect();
    return count;
};

/** Null where not measured. */
type Result = { readonly operation: string; readonly n: number; readonly ms: number; readonly mutations: number | null; readonly tick: number | null };
const results: Result[] = [];

const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;

/** When the last animation frame's callback began, which a tick runs in. */
let frameStart = 0;
const platformFrame = globalThis.requestAnimationFrame.bind(globalThis);
globalThis.requestAnimationFrame = callback => platformFrame(time => {
    frameStart = performance.now();
    callback(time);
});

/**
 * Runs `operation` `repeats` times, each timed and followed by the tick a run brings, timed from its frame's start to
 * the end of its observer systems; then once more, counting its mutations.
 */
const measure = async (operation: string, n: number, repeats: number, run: (repeat: number) => Promise<unknown>, settle: () => void = () => {}): Promise<void> => {
    const once = async (repeat: number): Promise<number> => {
        const start = performance.now();
        await run(repeat);
        settle();
        const ms = performance.now() - start;
        // What a tick or observer system threw, reported out of band by the time the run resolves.
        if (failed.length > 0) throw new Error(`${operation} failed: ${failed.map(String).join("; ")}`);
        return ms;
    };
    const times: number[] = [];
    const ticks: number[] = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
        // Waited for from before the run: one spanning a frame can have its tick run before the run's caller resumes.
        const ticked = nextTick();
        times.push(await once(repeat));
        await ticked;
        ticks.push(performance.now() - frameStart);
    }
    const mutations = await mutationsOf(() => once(repeats));
    results.push({ operation, n, ms: median(times), mutations, tick: median(ticks) });
};

const nothing = System.create({}, () => {});

/** What the apps measured reported failing out of band, which none should. */
const failed: unknown[] = [];
window.addEventListener("error", event => failed.push(event.error));

/** Forces the style and layout a change left, so their cost counts too. */
const forceLayout = (): void => {
    void document.body.offsetHeight;
};

/** Marks every other todo done, for filters to hide half the rows. */
const halfDone = System.create({ components: { with: [done] } }, item => {
    item[done] = item.entity % 2 === 0;
});

const alternateFilter = (world: World) => (repeat: number) => world.run(setFilter, { filter: repeat % 2 === 0 ? "active" : "all" });

/** A new app on the page holding `n` generated todos, the rows it shows of them rendered, and how long that took. */
const generated = async (n: number): Promise<{ readonly app: ReturnType<typeof createApp>; readonly ms: number }> => {
    document.body.innerHTML = markup;
    const app = createApp(document.body);
    await watchTicks(app.world);
    const start = performance.now();
    await app.world.run(addGenerated, { count: n });
    const ms = performance.now() - start;
    return { app, ms };
};

const benchmarkApp = async (n: number): Promise<void> => {
    // The todos and the rows the list renders of them, in one run, its mutations counted on another app.
    const counted = await generated(0);
    const generateMutations = await mutationsOf(() => counted.app.world.run(addGenerated, { count: n }));
    await counted.app.dispose();
    const { app, ms: generateMs } = await generated(n);
    const { world } = app;
    const laying = performance.now();
    forceLayout();
    results.push({ operation: "generate N todos, with their rows", n, ms: generateMs, mutations: generateMutations, tick: null });
    results.push({ operation: "lay the rows out", n, ms: performance.now() - laying, mutations: null, tick: null });
    await nextTick();
    await measure("add one", n, 11, repeat => world.run(addTodo, { label: `added ${repeat}` }));
    const listed = (await todosOf(world)).map(item => item.entity);
    const at = (index: number): Entity => listed[(index + listed.length) % listed.length] ?? Entity.none;
    await measure("run that changes nothing", n, 21, () => world.run(nothing));
    await measure("toggle one", n, 21, repeat => world.run(toggleTodo, { entity: at(repeat * 7) }));
    await measure("edit one", n, 21, repeat => world.run(editTodo, { entity: at(repeat * 11), label: `edited ${repeat}` }));
    // Each move rotates the list by one: after r of them, the last is the one r + 1 from the end, the first r from it.
    await measure("move last to first", n, 21, repeat => world.run(moveTodo, { entity: at(-1 - repeat), before: at(-repeat) }));
    await measure("toggle all", n, 4, repeat => world.run(toggleAll, { done: repeat % 2 === 0 }));
    await world.run(halfDone);
    await measure("filter half the todos", n, 20, alternateFilter(world));
    await measure("filter half the todos, laid out", n, 20, alternateFilter(world), forceLayout);
    await world.run(setFilter, { filter: "all" });
    const list = found("todo-list");
    // Scrolling two views down, past the rows kept beyond the view, renders the range again: the list's scroll event is
    // dispatched at once, rather than at the next frame, so only the render is timed.
    await measure("scroll two views down", n, 21, repeat => {
        list.scrollTop = (repeat + 1) * list.clientHeight * 2;
        list.dispatchEvent(new Event("scroll"));
        return world.run(nothing);
    }, forceLayout);
    await app.dispose();
    document.body.replaceChildren();
};

it("measures the todo app's DOM path", async () => {
    for (const n of [1000, 10000]) {
        await benchmarkApp(n);
    }
    const cell = (value: number | null, digits = 0): string => value === null ? "—" : value.toFixed(digits);
    console.log(["| Operation | N | Run ms | Tick after it, ms | DOM mutations |", "|---|---:|---:|---:|---:|", ...results.map(result => `| ${result.operation} | ${result.n} | ${result.ms.toFixed(3)} | ${cell(result.tick, 3)} | ${cell(result.mutations)} |`)].join("\n"));
});
