// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-output>`: the frame a run's examples run in, which they may render into. `page` is the run's page: each new
 * one replaces the frame, disposing the last run's worlds and workers with it. What the frame posts is dispatched as
 * `guide-run`, for whoever owns the runs to read.
 */

export type GuideOutputEvents = {
    readonly "guide-run": CustomEvent<{ readonly message: unknown }>;
};

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; position: relative; min-height: 120px; overflow: hidden; }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    :host([running]) .empty { display: none; }
    .empty { margin: var(--spectrum-spacing-200, 12px) var(--spectrum-spacing-300, 16px); color: var(--spectrum-gray-600);
        font: var(--spectrum-font-size-100, 14px) var(--spectrum-sans-font-family-stack, system-ui, sans-serif); }
</style>
<p class="empty">Each run renders here.</p>`;

export class GuideOutput extends HTMLElement {
    #page: string | null = null;
    #frame: HTMLIFrameElement | null = null;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        addEventListener("message", this.#received);
    }

    disconnectedCallback(): void {
        removeEventListener("message", this.#received);
    }

    readonly #received = (event: MessageEvent): void => {
        if (this.#frame === null || event.source !== this.#frame.contentWindow) return;
        this.dispatchEvent(new CustomEvent("guide-run", { detail: { message: event.data }, bubbles: true, composed: true }));
    };

    get page(): string | null {
        return this.#page;
    }

    set page(value: string | null) {
        if (value === this.#page) return;
        this.#page = value;
        this.#frame?.remove();
        this.#frame = null;
        this.toggleAttribute("running", value !== null);
        if (value === null) return;
        const frame = document.createElement("iframe");
        frame.title = "Output of the run";
        frame.src = value;
        this.#frame = frame;
        this.shadowRoot?.append(frame);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-output": GuideOutput;
    }
    interface HTMLElementEventMap extends GuideOutputEvents {}
}
