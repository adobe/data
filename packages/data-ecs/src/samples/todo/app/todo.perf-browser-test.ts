import { it } from "vitest";
import { Entity, System, workers, type World } from "../../../index.js";
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

type Result = { readonly operation: string; readonly n: number; readonly ms: number; readonly mutations: number };
const results: Result[] = [];

const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;

/** Runs `operation` `repeats` times, timed and each followed by a tick, then once more counting its mutations. */
const measure = async (operation: string, n: number, repeats: number, run: (repeat: number) => Promise<World.Report>, settle: () => void = () => {}): Promise<void> => {
    const once = async (repeat: number): Promise<number> => {
        const start = performance.now();
        const report = await run(repeat);
        settle();
        const ms = performance.now() - start;
        if (report.failures.length > 0) throw new Error(`${operation} failed: ${JSON.stringify(report.failures)}`);
        return ms;
    };
    const times: number[] = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
        times.push(await once(repeat));
        await nextTick();
    }
    const mutations = await mutationsOf(() => once(repeats));
    results.push({ operation, n, ms: median(times), mutations });
};

const nothing = System.create({ name: "perf/nothing" }, () => {});

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

const benchmarkApp = async (n: number): Promise<void> => {
    document.body.innerHTML = markup;
    const app = createApp({ root: document.body, list: found("todo-list"), filters: found("todo-filters"), summary: found("todo-summary"), toggleAll: found("todo-toggle-all") });
    await watchTicks(app.world);
    const { world } = app;
    // A new todo's row is created by a tick after the run that adds the todo: here by a run of the system that does.
    const start = performance.now();
    await world.run(addGenerated, { count: n });
    const generated = performance.now();
    await world.run(createRows);
    const created = performance.now();
    forceLayout();
    results.push({ operation: "generate N todos", n, ms: generated - start, mutations: 0 });
    results.push({ operation: "create and place N rows", n, ms: created - generated, mutations: 3 * n });
    results.push({ operation: "lay N rows out", n, ms: performance.now() - created, mutations: 0 });
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
    console.log(["| Operation | N | ms | DOM mutations |", "|---|---:|---:|---:|", ...results.map(result => `| ${result.operation} | ${result.n} | ${result.ms.toFixed(3)} | ${result.mutations} |`)].join("\n"));
});
