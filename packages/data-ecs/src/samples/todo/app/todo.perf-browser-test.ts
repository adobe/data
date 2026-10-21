import { it } from "vitest";
import { Entity, Report, System, workers, type World } from "../../../index.js";
import { createWorld } from "../../../implementation/index.js";
import { toggleAll } from "../features/completion/model.js";
import { filter } from "../features/filter/data.js";
import { setFilter } from "../features/filter/model.js";
import { addGenerated } from "../features/generate/model.js";
import { done } from "../features/todos/data.js";
import { createRows, dom, list, todoOf } from "../features/todos/dom.js";
import { addTodo, editTodo, moveTodo, toggleTodo } from "../features/todos/model.js";
import { nextTick, watchTicks } from "../shared/ticks.test-helper.js";
import { createApp, defineElements } from "./app.js";

/**
 * How the app's DOM path scales, with 1K and 10K todos: each operation's run is timed, the observer systems that run
 * after it included, and then run once more with the DOM's mutations counted, those of the tick after it included.
 * Numbers are logged, never asserted: `pnpm test:perf src/samples/todo`.
 */

defineElements();

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
    await change();
    await nextTick();
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
const measure = async (operation: string, n: number, repeats: number, run: (repeat: number) => Promise<number>, settle: () => void = () => {}): Promise<void> => {
    const once = async (repeat: number): Promise<number> => {
        const start = performance.now();
        await run(repeat);
        settle();
        const ms = performance.now() - start;
        // A failing run's report is spawned before its pass, which logs it.
        if (failed.length > 0) throw new Error(`${operation} failed: ${JSON.stringify(failed)}`);
        return ms;
    };
    const times: number[] = [];
    const ticks: number[] = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
        times.push(await once(repeat));
        await nextTick();
        ticks.push(performance.now() - frameStart);
    }
    const mutations = await mutationsOf(() => once(repeats));
    results.push({ operation, n, ms: median(times), mutations, tick: median(ticks) });
};

const nothing = System.create({ name: "perf/nothing" }, () => {});

/** The failures of every report the apps measured spawned, which none should. */
const failed: Report.Failure[] = [];
const collectFailures = System.create({ name: "perf/collectFailures", observer: true, components: { read: [Report.failures], changed: [Report.failures] } }, row => {
    failed.push(...row[Report.failures]);
});

/**
 * The todos in list order, read once, before anything's timed: indexing a list's `children` far from the last index
 * read walks them.
 */
const listedTodos = (): readonly Entity[] => [...found("todo-list").children].map(element => todoOf.get(element) ?? Entity.none);

/** Forces the style and layout a change left, so their cost counts too. */
const forceLayout = (): void => {
    void document.body.offsetHeight;
};

/** Marks every other todo done, for filters to hide half the rows. */
const halfDone = System.create({ name: "perf/halfDone", components: { write: [done] } }, item => {
    item[done] = item.entity % 2 === 0;
});

const alternateFilter = (world: World) => (repeat: number) => world.run(setFilter, { filter: repeat % 2 === 0 ? "active" : "all" });

/** A new app on the page holding `n` generated todos, with no rows yet: the tick that would make them hasn't come. */
const generated = async (n: number): Promise<{ readonly app: ReturnType<typeof createApp>; readonly ms: number }> => {
    document.body.innerHTML = markup;
    const app = createApp(document.body);
    app.world.add(collectFailures);
    await watchTicks(app.world);
    const start = performance.now();
    await app.world.run(addGenerated, { count: n });
    const ms = performance.now() - start;
    if (found("todo-list").children.length > 0) throw new Error("A tick made the rows before they were timed.");
    return { app, ms };
};

const benchmarkApp = async (n: number): Promise<void> => {
    // Rows are created and placed by a run of the system the tick after a run would run, counted on another app.
    const counted = await generated(n);
    const createMutations = await mutationsOf(() => counted.app.world.run(createRows));
    await counted.app.dispose();
    const { app, ms: generateMs } = await generated(n);
    const { world } = app;
    const start = performance.now();
    await world.run(createRows);
    const created = performance.now();
    forceLayout();
    results.push({ operation: "generate N todos", n, ms: generateMs, mutations: null, tick: null });
    results.push({ operation: "create and place N rows", n, ms: created - start, mutations: createMutations, tick: null });
    results.push({ operation: "lay N rows out", n, ms: performance.now() - created, mutations: null, tick: null });
    await nextTick();
    await measure("add one, with its row", n, 11, async repeat => {
        await world.run(addTodo, { label: `added ${repeat}` });
        return world.run(createRows);
    });
    const listed = listedTodos();
    const at = (index: number): Entity => listed[(index + listed.length) % listed.length] ?? Entity.none;
    await measure("run that changes nothing", n, 21, () => world.run(nothing));
    await measure("toggle one", n, 21, repeat => world.run(toggleTodo, { entity: at(repeat * 7) }));
    await measure("edit one", n, 21, repeat => world.run(editTodo, { entity: at(repeat * 11), label: `edited ${repeat}` }));
    // Each move rotates the list by one: after r of them, the last is the one r + 1 from the end, the first r from it.
    await measure("move last to first", n, 21, repeat => world.run(moveTodo, { entity: at(-1 - repeat), before: at(-repeat) }));
    await measure("toggle all", n, 4, repeat => world.run(toggleAll, { done: repeat % 2 === 0 }));
    await world.run(halfDone);
    await measure("filter half the rows", n, 20, alternateFilter(world));
    await measure("filter half the rows, laid out", n, 20, alternateFilter(world), forceLayout);
    await world.run(setFilter, { filter: "all" });
    // The move by the DOM alone, outside the world, which leaves the rows out of list order: measured last.
    const element = found("todo-list");
    await measure("move last to first, the DOM alone", n, 21, () => {
        const last = element.lastElementChild;
        if (last !== null) element.prepend(last);
        return world.run(nothing);
    });
    await app.dispose();
    document.body.replaceChildren();
};

/** The filter not kept: an attribute of the list, which a style sheet selects rows by. */
const markList = System.create({
    name: "perf/markList",
    observer: true,
    resources: { read: [filter], changed: [filter], is: [list] },
}, ({ resources }) => {
    resources[list].dataset.filter = resources[filter];
});

const listStyle = `
todo-list[data-filter="active"] > todo-row[done],
todo-list[data-filter="completed"] > todo-row:not([done]) { display: none; }`;

const benchmarkListFilter = async (n: number): Promise<void> => {
    const style = document.createElement("style");
    style.textContent = listStyle;
    const element = document.createElement("todo-list");
    element.style.display = "block";
    element.style.maxHeight = "600px";
    document.body.append(style, element);
    await using world = createWorld({ [workers]: 0, [list]: element });
    await watchTicks(world);
    for (const system of [...dom, markList]) world.add(system);
    await world.run(addGenerated, { count: n });
    await world.run(createRows);
    await world.run(halfDone);
    forceLayout();
    await nextTick();
    await measure("filter half the rows by a list attribute (not kept)", n, 20, alternateFilter(world));
    await measure("filter half the rows by a list attribute, laid out (not kept)", n, 20, alternateFilter(world), forceLayout);
    document.body.replaceChildren();
};

it("measures the todo app's DOM path", async () => {
    for (const n of [1000, 10000]) {
        await benchmarkApp(n);
        await benchmarkListFilter(n);
    }
    const cell = (value: number | null, digits = 0): string => value === null ? "—" : value.toFixed(digits);
    console.log(["| Operation | N | Run ms | Tick after it, ms | DOM mutations |", "|---|---:|---:|---:|---:|", ...results.map(result => `| ${result.operation} | ${result.n} | ${result.ms.toFixed(3)} | ${cell(result.tick, 3)} | ${cell(result.mutations)} |`)].join("\n"));
});
