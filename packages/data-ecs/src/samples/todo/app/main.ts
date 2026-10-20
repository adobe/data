import { createApp, defineElements, type App } from "./app.js";

/** The todo sample's page: its markup holds the fixed elements, and the app's world drives them. */

const start = (): App | null => {
    defineElements();
    const list = document.querySelector("todo-list");
    const filters = document.querySelector("todo-filters");
    const summary = document.querySelector("todo-summary");
    const toggleAll = document.querySelector("todo-toggle-all");
    if (list === null || filters === null || summary === null || toggleAll === null) return null;
    return createApp({ root: document.body, list, filters, summary, toggleAll });
};

const app = start();
if (app === null) console.error("The page is missing one of the todo app's elements.");
/** For automated checks. */
Reflect.set(globalThis, "todoApp", app);
