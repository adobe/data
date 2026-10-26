// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-console>`: what a run logged, a line each, marked by level: errors nothing caught stand out. `logged` holds
 * the latest lines and how many came before them; lines added to the end are appended, and the view follows the end
 * while it's scrolled there.
 */

export type ConsoleEntry = { readonly level: "log" | "info" | "warn" | "error" | "debug" | "uncaught"; readonly text: string };
export type ConsoleLog = { readonly entries: readonly ConsoleEntry[]; readonly dropped: number };

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; overflow: auto; font: var(--spectrum-font-size-75, 12px)/1.6 var(--guide-code-font, ui-monospace, SFMono-Regular, Menlo, monospace);
        color: var(--spectrum-gray-800); }
    ol { list-style: none; margin: 0; padding: var(--spectrum-spacing-75, 4px) 0; }
    li { padding: 2px var(--spectrum-spacing-300, 16px); white-space: pre-wrap; word-break: break-word; border-bottom: 1px solid rgba(var(--spectrum-gray-200-rgb), 0.6); }
    li.level-warn { color: var(--spectrum-notice-content-color-default); background: color-mix(in srgb, var(--spectrum-notice-background-color-default) 10%, transparent); }
    li.level-error, li.level-uncaught { color: var(--spectrum-negative-content-color-default); background: color-mix(in srgb, var(--spectrum-negative-background-color-default) 10%, transparent); }
    li.level-uncaught { font-weight: 700; }
    li.level-debug { color: var(--spectrum-gray-600); }
    .note, .empty { margin: 0; padding: var(--spectrum-spacing-200, 12px) var(--spectrum-spacing-300, 16px); color: var(--spectrum-gray-600);
        font: var(--spectrum-font-size-100, 14px)/1.4 var(--spectrum-sans-font-family-stack, system-ui, sans-serif); }
    [hidden] { display: none; }
</style>
<p class="note" hidden></p>
<ol role="log" aria-label="Console"></ol>
<p class="empty">Nothing logged.</p>`;

const lineOf = (entry: ConsoleEntry): HTMLElement => {
    const item = document.createElement("li");
    item.className = `level-${entry.level}`;
    item.textContent = entry.text;
    return item;
};

export class GuideConsole extends HTMLElement {
    readonly #note: HTMLElement;
    readonly #list: HTMLElement;
    readonly #empty: HTMLElement;
    #logged: ConsoleLog = { entries: [], dropped: 0 };

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const note = root.querySelector(".note");
        const list = root.querySelector("ol");
        const empty = root.querySelector(".empty");
        if (!(note instanceof HTMLElement && list instanceof HTMLElement && empty instanceof HTMLElement)) throw new Error("guide-console's template is missing a part.");
        this.#note = note;
        this.#list = list;
        this.#empty = empty;
    }

    get logged(): ConsoleLog {
        return this.#logged;
    }

    set logged(value: ConsoleLog) {
        const previous = this.#logged;
        if (value === previous) return;
        this.#logged = value;
        const following = this.scrollTop + this.clientHeight >= this.scrollHeight - 4;
        // Lines this one keeps from the last, the same objects at the same places, stay; the rest are written.
        const shownEnd = previous.dropped + previous.entries.length;
        const overlap = shownEnd - value.dropped;
        const last = previous.entries.at(-1);
        const continues = value.dropped >= previous.dropped && overlap >= 0 && overlap <= value.entries.length && (overlap === 0 || value.entries[overlap - 1] === last);
        if (continues) {
            for (let index = previous.dropped; index < value.dropped; index++) this.#list.firstElementChild?.remove();
            this.#list.append(...value.entries.slice(overlap).map(lineOf));
        }
        else this.#list.replaceChildren(...value.entries.map(lineOf));
        this.#note.hidden = value.dropped === 0;
        this.#note.textContent = `${value.dropped} earlier line${value.dropped === 1 ? "" : "s"} not shown`;
        this.#empty.hidden = value.entries.length > 0;
        if (following) this.scrollTop = this.scrollHeight;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-console": GuideConsole;
    }
}
