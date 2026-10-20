import { afterEach, expect, it } from "vitest";
import { Entity, type World } from "../../../index.js";
import { toggleAll } from "../features/completion/model.js";
import { setFilter } from "../features/filter/model.js";
import { addGenerated } from "../features/generate/model.js";
import { todoOf } from "../features/todos/dom.js";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "../features/todos/model.js";
import { nextTick, watchTicks } from "../shared/ticks.test-helper.js";
import { createApp, defineElements } from "./app.js";

/** The DOM writes of each operation follow what it changed, whatever the list holds; `app/todo.perf-browser-test.ts` times them. */

defineElements();

const markup = `<todo-toggle-all></todo-toggle-all><todo-list></todo-list><todo-summary></todo-summary><todo-filters></todo-filters>`;

afterEach(() => {
    document.body.replaceChildren();
});

/** The mutations of the page and its open shadow roots from `change` until the tick after it. */
const mutationsOf = async (change: () => Promise<World.Report>): Promise<number> => {
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

/** Each operation's mutations, on an app holding `n` todos, every other one done. */
const mutationsWith = async (n: number): Promise<Record<string, number>> => {
    document.body.innerHTML = markup;
    const app = createApp(document.body);
    await watchTicks(app.world);
    const { world } = app;
    await world.run(addGenerated, { count: n });
    await nextTick();
    const listed = [...document.querySelectorAll("todo-row")].map(row => todoOf.get(row) ?? Entity.none);
    const at = (index: number): Entity => listed[(index + n) % n] ?? Entity.none;
    for (let i = 0; i < n; i += 2) await world.run(toggleTodo, { entity: at(i) });
    await nextTick();
    const rows = (): HTMLElementTagNameMap["todo-row"][] => [...document.querySelectorAll("todo-row")];
    const counts: Record<string, number> = {
        "toggle one": await mutationsOf(() => world.run(toggleTodo, { entity: at(1) })),
        "edit one": await mutationsOf(() => world.run(editTodo, { entity: at(3), label: "edited" })),
        "move one": await mutationsOf(() => world.run(moveTodo, { entity: at(-1), before: at(0) })),
        "add one": await mutationsOf(() => world.run(addTodo, { label: "added" })),
        "delete one": await mutationsOf(() => world.run(deleteTodo, { entity: at(5) })),
    };
    // What's left over once each row the operation changed is taken off.
    counts["filter, beyond a write per row hidden"] = await mutationsOf(() => world.run(setFilter, { filter: "active" })) - rows().filter(row => row.hidden).length;
    await world.run(setFilter, { filter: "all" });
    await nextTick();
    const notDone = rows().filter(row => !row.done).length;
    counts["toggle all, beyond a write per row marked done"] = await mutationsOf(() => world.run(toggleAll, { done: true })) - notDone;
    await app.dispose();
    return counts;
};

it("writes the DOM in proportion to what changed, not to how many todos there are", async () => {
    const small = await mutationsWith(100);
    const large = await mutationsWith(2000);
    expect(large).toEqual(small);
    expect(small).toEqual({
        // The row's done attribute, and the summary's count.
        "toggle one": 2,
        // The row's label.
        "edit one": 1,
        // The row out of the list, and in again.
        "move one": 2,
        // The new row into the list, the tabindex and draggable it sets once connected, and the summary's count. Its
        // label is written in a shadow root made after the count began.
        "add one": 4,
        // The row out of the list, and the summary's count.
        "delete one": 2,
        // The filter buttons pressed and released.
        "filter, beyond a write per row hidden": 2,
        // The summary's count.
        "toggle all, beyond a write per row marked done": 1,
    });
});
