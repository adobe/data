// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-problems>`: a chapter's problems in one list, TypeScript's and the ECS build's each marked as theirs, with
 * where each is. `problems` lists them. Choosing one dispatches `guide-locate` with its file and place.
 */

export type ListedProblem = {
    readonly kind: "typescript" | "build";
    readonly severity: "error" | "warning";
    readonly file: string;
    readonly message: string;
    readonly line: number | null;
    readonly column: number | null;
};

export type GuideProblemsEvents = {
    readonly "guide-locate": CustomEvent<{ readonly file: string; readonly line: number; readonly column: number }>;
};

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; font: var(--spectrum-font-size-100, 14px)/1.45 var(--spectrum-sans-font-family-stack, system-ui, sans-serif); color: var(--spectrum-gray-800); }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--spectrum-spacing-100, 8px); padding: var(--spectrum-spacing-100, 8px);
        border-radius: var(--spectrum-corner-radius-100, 4px); }
    li + li { margin-top: 2px; }
    li[data-line] { cursor: pointer; }
    li[data-line]:hover { background: var(--spectrum-gray-100); }
    .kind { align-self: start; padding: 0 var(--spectrum-spacing-75, 6px); border-radius: var(--spectrum-corner-radius-100, 4px);
        font-size: var(--spectrum-font-size-50, 11px); font-weight: 700; line-height: 18px; color: var(--spectrum-gray-50); white-space: nowrap; }
    .kind.typescript { background: var(--guide-typescript); }
    .kind.build { background: var(--guide-build); }
    .severity-warning .kind { opacity: 0.75; }
    .place { color: var(--spectrum-gray-600); font: var(--spectrum-font-size-75, 12px) var(--guide-code-font, ui-monospace, monospace); }
    .message { grid-column: 2; margin: 0; white-space: pre-wrap; word-break: break-word; font: var(--spectrum-font-size-75, 12px)/1.5 var(--guide-code-font, ui-monospace, monospace); }
    .empty { color: var(--spectrum-gray-600); margin: 0; padding: var(--spectrum-spacing-100, 8px); }
</style>
<ul></ul>
<p class="empty">No problems.</p>`;

const placeOf = (problem: ListedProblem): string =>
    problem.line === null ? problem.file : `${problem.file}:${problem.line}${problem.column === null ? "" : `:${problem.column}`}`;

export class GuideProblems extends HTMLElement {
    readonly #list: HTMLElement;
    readonly #empty: HTMLElement;
    #problems: readonly ListedProblem[] = [];

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const list = root.querySelector("ul");
        const empty = root.querySelector(".empty");
        if (!(list instanceof HTMLElement && empty instanceof HTMLElement)) throw new Error("guide-problems' template is missing a part.");
        this.#list = list;
        this.#empty = empty;
        list.addEventListener("click", event => {
            const item = event.target instanceof Element ? event.target.closest("li") : null;
            if (item === null || item.dataset["line"] === undefined) return;
            const detail = { file: item.dataset["file"] ?? "", line: Number(item.dataset["line"]), column: Number(item.dataset["column"] ?? 1) };
            this.dispatchEvent(new CustomEvent("guide-locate", { detail, bubbles: true, composed: true }));
        });
    }

    get problems(): readonly ListedProblem[] {
        return this.#problems;
    }

    set problems(value: readonly ListedProblem[]) {
        if (value === this.#problems) return;
        this.#problems = value;
        this.#empty.hidden = value.length > 0;
        this.#list.replaceChildren(...value.map(problem => {
            const item = document.createElement("li");
            item.className = `severity-${problem.severity}`;
            item.dataset["kind"] = problem.kind;
            item.dataset["file"] = problem.file;
            if (problem.line !== null) {
                item.dataset["line"] = String(problem.line);
                item.dataset["column"] = String(problem.column ?? 1);
            }
            const kind = document.createElement("span");
            kind.className = `kind ${problem.kind}`;
            kind.textContent = problem.kind === "typescript" ? "TypeScript" : "ECS build";
            const place = document.createElement("span");
            place.className = "place";
            place.textContent = placeOf(problem);
            const message = document.createElement("pre");
            message.className = "message";
            message.textContent = problem.message;
            item.append(kind, place, message);
            return item;
        }));
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-problems": GuideProblems;
    }
    interface HTMLElementEventMap extends GuideProblemsEvents {}
}
