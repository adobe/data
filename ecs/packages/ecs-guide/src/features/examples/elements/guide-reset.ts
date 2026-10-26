// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-reset>`: the button that resets a chapter's examples to the guide's. `disabled` while they're unedited; a
 * click dispatches `guide-reset`.
 */

export type GuideResetEvents = {
    readonly "guide-reset": CustomEvent<null>;
};

const template = document.createElement("template");
template.innerHTML = `<sp-button variant="secondary" treatment="outline" size="s">Reset example</sp-button>`;

export class GuideReset extends HTMLElement {
    readonly #button: HTMLElement;
    #disabled = false;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const button = root.querySelector("sp-button");
        if (!(button instanceof HTMLElement)) throw new Error("guide-reset's template is missing its button.");
        this.#button = button;
        button.addEventListener("click", () => {
            if (!this.#disabled) this.dispatchEvent(new CustomEvent("guide-reset", { detail: null, bubbles: true, composed: true }));
        });
    }

    get disabled(): boolean {
        return this.#disabled;
    }

    set disabled(value: boolean) {
        if (value === this.#disabled) return;
        this.#disabled = value;
        this.#button.toggleAttribute("disabled", value);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-reset": GuideReset;
    }
    interface HTMLElementEventMap extends GuideResetEvents {}
}
