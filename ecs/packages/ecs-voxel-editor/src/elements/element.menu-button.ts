// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MenuItem } from "./element.menu-button/type.menu-item.js";

/**
 * `<menu-button>`: a button, labelled by `label`, opening a dropdown of `items`; choosing one dispatches `menu-choose`
 * with its action and closes it, as Escape and a click elsewhere do. An item that isn't `enabled` shows, greyed.
 */
export class MenuButton extends HTMLElement {
    #items: readonly MenuItem[] = [];
    readonly #button: HTMLButtonElement;
    readonly #list: HTMLElement;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const button = root.querySelector("button");
        const list = root.querySelector<HTMLElement>("[role=menu]");
        if (button === null || list === null) throw new Error("menu-button's template is incomplete.");
        this.#button = button;
        this.#list = list;
        button.addEventListener("click", () => this.#open(list.hidden));
        list.addEventListener("click", event => {
            const item = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-action]") : null;
            if (item === null || item.disabled) return;
            this.#open(false);
            this.dispatchEvent(new CustomEvent("menu-choose", { detail: { action: item.dataset["action"] ?? "" }, bubbles: true, composed: true }));
        });
        this.addEventListener("keydown", event => {
            if (event.key === "Escape") this.#open(false);
        });
        this.addEventListener("focusout", event => {
            if (!(event.relatedTarget instanceof Node && this.shadowRoot?.contains(event.relatedTarget))) this.#open(false);
        });
    }

    set label(value: string) {
        this.#button.textContent = value;
    }

    set items(value: readonly MenuItem[]) {
        if (value.length === this.#items.length && value.every((item, i) => {
            const was = this.#items[i];
            return was !== undefined && was.action === item.action && was.label === item.label && was.enabled === item.enabled && was.hint === item.hint;
        })) return;
        this.#items = value;
        this.#list.replaceChildren(...value.map(item => {
            if (item.action === "") return Object.assign(document.createElement("hr"), { role: "separator" });
            const entry = Object.assign(document.createElement("button"), { role: "menuitem", disabled: !item.enabled });
            entry.dataset["action"] = item.action;
            entry.append(Object.assign(document.createElement("span"), { textContent: item.label }), Object.assign(document.createElement("kbd"), { textContent: item.hint ?? "" }));
            return entry;
        }));
    }

    #open(open: boolean): void {
        this.#list.hidden = !open;
        this.#button.setAttribute("aria-expanded", String(open));
        if (open) this.#list.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { position: relative; display: inline-block; font-size: 13px; }
    button { font: inherit; color: inherit; }
    .open { background: none; border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; cursor: pointer; }
    .open:hover, .open[aria-expanded="true"] { background: rgb(255 255 255 / 0.1); }
    [role=menu] { position: absolute; z-index: 10; top: calc(100% + 4px); left: 0; min-width: 220px; display: flex; flex-direction: column; padding: 4px;
        background: #26282e; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 6px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.45); }
    [role=menu][hidden] { display: none; }
    [role=menuitem] { display: flex; justify-content: space-between; gap: 16px; text-align: left; background: none; border: 0; border-radius: 4px; padding: 5px 8px; cursor: pointer; }
    [role=menuitem]:hover:not(:disabled), [role=menuitem]:focus-visible { background: rgb(255 255 255 / 0.1); outline: none; }
    [role=menuitem]:disabled { opacity: 0.4; cursor: default; }
    kbd { font: inherit; color: #9ca3af; }
    hr { width: 100%; border: 0; border-top: 1px solid rgb(255 255 255 / 0.1); margin: 4px 0; }
</style>
<button class="open" aria-haspopup="menu" aria-expanded="false"></button>
<div role="menu" hidden></div>`;

type MenuButtonEvents = {
    readonly "menu-choose": CustomEvent<{ readonly action: string }>;
};

declare global {
    interface HTMLElementTagNameMap {
        "menu-button": MenuButton;
    }
    interface HTMLElementEventMap extends MenuButtonEvents {}
}
