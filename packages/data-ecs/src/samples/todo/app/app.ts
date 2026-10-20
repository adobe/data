import { workers, type World } from "../../../index.js";
import { createWorld } from "../../../implementation/index.js";
import * as completionDom from "../features/completion/dom.js";
import * as completionEvents from "../features/completion/events.js";
import { defineTodoSummary, type TodoSummary } from "../features/completion/elements/todo-summary.js";
import { defineTodoToggleAll, type TodoToggleAll } from "../features/completion/elements/todo-toggle-all.js";
import * as filterDom from "../features/filter/dom.js";
import * as filterEvents from "../features/filter/events.js";
import { defineTodoFilters, type TodoFilters } from "../features/filter/elements/todo-filters.js";
import * as generateEvents from "../features/generate/events.js";
import { defineTodoGenerate } from "../features/generate/elements/todo-generate.js";
import * as todosDom from "../features/todos/dom.js";
import * as todosEvents from "../features/todos/events.js";
import { defineTodoEntry } from "../features/todos/elements/todo-entry.js";
import { defineTodoList, type TodoList } from "../features/todos/elements/todo-list.js";
import { defineTodoRow } from "../features/todos/elements/todo-row.js";

/** Defines every element the app uses. */
export const defineElements = (): void => {
    for (const define of [defineTodoRow, defineTodoList, defineTodoEntry, defineTodoFilters, defineTodoSummary, defineTodoToggleAll, defineTodoGenerate]) define();
};

/** The page's fixed elements, and the root its features' events bubble to. */
export type Page = {
    readonly root: HTMLElement;
    readonly list: TodoList;
    readonly filters: TodoFilters;
    readonly summary: TodoSummary;
    readonly toggleAll: TodoToggleAll;
};

export type App = { readonly world: World; readonly dispose: () => Promise<void> };

const systems = [...todosDom.dom, ...filterDom.dom, ...completionDom.dom];
const connects = [todosEvents.connect, filterEvents.connect, completionEvents.connect, generateEvents.connect];

/** Starts the app on a page: a world whose DOM systems drive the page, and whose runs its events start. */
export const createApp = (page: Page): App => {
    const world = createWorld({
        [workers]: 0,
        [todosDom.list]: page.list,
        [filterDom.filters]: page.filters,
        [completionDom.summary]: page.summary,
        [completionDom.toggleAllBox]: page.toggleAll,
    });
    for (const system of systems) world.add(system);
    const disconnects = connects.map(connect => connect(world, page.root));
    return {
        world,
        dispose: async () => {
            for (const disconnect of disconnects) disconnect();
            await world.dispose();
        },
    };
};
