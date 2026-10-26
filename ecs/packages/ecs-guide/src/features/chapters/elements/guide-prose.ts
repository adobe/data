// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-prose>`: a chapter's heading and prose. `heading` is its title, and `html` its prose, rendered from the
 * guide's markdown as it builds. Its links to a program's lines are addresses in the page, which whoever owns the chapters reads.
 */

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; box-sizing: border-box; overflow-y: auto; padding: var(--spectrum-spacing-400) var(--spectrum-spacing-500) var(--spectrum-spacing-600);
        font: var(--spectrum-font-size-200)/1.6 var(--spectrum-sans-font-family-stack, system-ui, sans-serif); color: var(--spectrum-gray-800); }
    h1 { margin: 0 0 var(--spectrum-spacing-300); font-size: var(--spectrum-font-size-700); font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; color: var(--spectrum-gray-900); }
    h2, h3 { margin: var(--spectrum-spacing-400) 0 var(--spectrum-spacing-100); color: var(--spectrum-gray-900); }
    p, ul, ol { margin: 0 0 var(--spectrum-spacing-300); }
    li + li { margin-top: var(--spectrum-spacing-75); }
    li > p { margin: 0; }
    a { color: var(--spectrum-accent-content-color-default); text-decoration-thickness: 1px; text-underline-offset: 2px; }
    a:focus-visible { outline: 2px solid var(--spectrum-focus-indicator-color); outline-offset: 2px; border-radius: var(--spectrum-corner-radius-75); }
    code { font: var(--spectrum-font-size-75)/1.6 var(--guide-code-font, ui-monospace, monospace); padding: 1px 5px; border-radius: var(--spectrum-corner-radius-100);
        background: var(--spectrum-gray-100); color: var(--spectrum-gray-900); }
    /* Code wraps, so every line reads in the column, however narrow. */
    pre { margin: 0 0 var(--spectrum-spacing-300); padding: var(--spectrum-spacing-200) var(--spectrum-spacing-300); border-radius: var(--spectrum-corner-radius-200);
        white-space: pre-wrap; overflow-wrap: anywhere; background: var(--spectrum-background-base-color); border: 1px solid var(--spectrum-gray-200);
        font-size: var(--spectrum-font-size-75); line-height: 1.6; }
    pre code { padding: 0; background: none; }
    /* A link to a program's lines, underlined dotted, as it shows them in the editor rather than going elsewhere. */
    a[href*="/L"] { text-decoration-style: dotted; text-decoration-thickness: 1.5px; }
    a code { color: inherit; }
</style>
<h1></h1>
<div class="prose"></div>`;

export class GuideProse extends HTMLElement {
    readonly #heading: HTMLElement;
    readonly #prose: HTMLElement;
    #title = "";
    #html = "";

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const heading = root.querySelector("h1");
        const prose = root.querySelector(".prose");
        if (!(heading instanceof HTMLElement && prose instanceof HTMLElement)) throw new Error("guide-prose's template is missing a part.");
        this.#heading = heading;
        this.#prose = prose;
    }

    get heading(): string {
        return this.#title;
    }

    set heading(value: string) {
        if (value === this.#title) return;
        this.#title = value;
        this.#heading.textContent = value;
    }

    get html(): string {
        return this.#html;
    }

    /** The guide's own prose, rendered as it builds, which the guide trusts as its source. */
    set html(value: string) {
        if (value === this.#html) return;
        this.#html = value;
        this.#prose.innerHTML = value;
        this.scrollTop = 0;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-prose": GuideProse;
    }
}
